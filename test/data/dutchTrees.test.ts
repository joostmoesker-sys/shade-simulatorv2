import { describe, expect, it, vi } from 'vitest';

import {
  AHN_DSM_COVERAGE_ID,
  AHN_DTM_COVERAGE_ID,
  buildAhnCoverageUrl,
  buildOpenStreetMapTreesOverpassUrl,
  detectTreesInCanopyHeightModel,
  fetchDutchTreeObjects,
  parseOpenStreetMapTreesResponse,
} from '../../src/data/dutchTrees';

describe('dutchTrees', () => {
  it('builds a bounded OpenStreetMap tree request', () => {
    const url = new URL(buildOpenStreetMapTreesOverpassUrl({ lat: 52, lon: 5 }, 50, 12));
    const query = url.searchParams.get('data') ?? '';

    expect(url.origin + url.pathname).toBe('https://overpass-api.de/api/interpreter');
    expect(query).toContain('node["natural"="tree"]');
    expect(query).toContain('way["natural"="tree"]');
    expect(query).toContain('out geom qt 12');
  });

  it('builds a bounded AHN WCS coverage URL in RD coordinates', () => {
    const url = new URL(buildAhnCoverageUrl(AHN_DSM_COVERAGE_ID, { lat: 52.1551744, lon: 5.38720621 }, 50));

    expect(url.origin + url.pathname).toBe('https://service.pdok.nl/rws/ahn/wcs/v1_0');
    expect(url.searchParams.get('service')).toBe('WCS');
    expect(url.searchParams.get('request')).toBe('GetCoverage');
    expect(url.searchParams.get('coverageId')).toBe('dsm_05m');
    expect(url.searchParams.get('format')).toBe('image/tiff');
    const subsets = url.searchParams.getAll('subset');
    expect(subsets).toHaveLength(2);
    // RD origin for our PDOK polynomial is (155000, 463000); a 50 m bbox centred there must include it.
    expect(subsets[0]).toMatch(/^X\(15[45]\d{3}\.\d+,1550\d{2}\.\d+\)$/);
    expect(subsets[1]).toMatch(/^Y\(462\d{3}\.\d+,463\d{3}\.\d+\)$/);
  });

  it('parses OpenStreetMap tree nodes with height and crown tags', () => {
    const trees = parseOpenStreetMapTreesResponse({
      elements: [
        {
          type: 'node',
          id: 123,
          lat: 52,
          lon: 5,
          tags: { species: 'Quercus robur', height: '9 m', diameter_crown: '6' },
        },
      ],
    });

    expect(trees[0]).toMatchObject({
      kind: 'tree',
      name: 'OpenStreetMap boom Quercus robur',
      position: { lat: 52, lon: 5 },
      heightM: 9,
      crownRadiusM: 3,
      trunkHeightM: 3,
    });
  });

  it('detects tall isolated peaks in a canopy height model as trees', () => {
    // 17 x 17 grid at 0.5 m cells so the ±4-cell taper probes stay in bounds.
    // Two tree-like peaks taper outward; a flat-topped "building" plateau in
    // the corner must be rejected.
    const cols = 17;
    const rows = 17;
    const cellSizeM = 0.5;
    const values = new Float32Array(cols * rows).fill(0);
    function paintTreeAt(cx: number, cy: number, peak: number, falloff = 1.5) {
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const dx = col - cx;
          const dy = row - cy;
          const height = peak - falloff * Math.sqrt(dx * dx + dy * dy);
          if (height > values[row * cols + col]) values[row * cols + col] = height;
        }
      }
    }
    paintTreeAt(5, 5, 12); // tall oak
    paintTreeAt(12, 12, 8); // shorter tree, well-separated

    const trees = detectTreesInCanopyHeightModel({
      values,
      cols,
      rows,
      xllRd: 155_000,
      yulRd: 463_000,
      cellSizeM,
    });

    expect(trees).toHaveLength(2);
    // Sorted by descending height: tallest first.
    expect(trees[0].heightM).toBeGreaterThan(trees[1].heightM);
    expect(trees[0].name).toBe('AHN boom 1');
    expect(trees[0].position.lat).toBeGreaterThan(52);
    expect(trees[0].position.lon).toBeGreaterThan(5);
  });

  it('skips peaks below the minimum tree height threshold', () => {
    const trees = detectTreesInCanopyHeightModel({
      values: new Float32Array([
        0, 0, 0, 0, 0,
        0, 2, 0, 0, 0,
        0, 0, 0, 0, 0,
        0, 0, 0, 0, 0,
        0, 0, 0, 0, 0,
      ]),
      cols: 5,
      rows: 5,
      xllRd: 0,
      yulRd: 0,
      cellSizeM: 0.5,
    });
    expect(trees).toEqual([]);
  });

  it('rejects flat building tops via the taper requirement', () => {
    // 13×13 grid with a 9×9 plateau at 6 m. The centre is bumped 0.05 m so it
    // wins the 3×3 local-max check, but the ±4-cell taper probes still land
    // on the plateau and find no real drop-off → it must be rejected.
    const cols = 13;
    const rows = 13;
    const values = new Float32Array(cols * rows);
    for (let row = 2; row <= 10; row++) {
      for (let col = 2; col <= 10; col++) {
        values[row * cols + col] = 6;
      }
    }
    values[6 * cols + 6] = 6.05;

    const trees = detectTreesInCanopyHeightModel({
      values,
      cols,
      rows,
      xllRd: 0,
      yulRd: 0,
      cellSizeM: 0.5,
    });
    expect(trees).toEqual([]);
  });

  it('falls back to OpenStreetMap when the AHN service is unavailable', async () => {
    const osmPayload = {
      elements: [
        { type: 'node', id: 456, lat: 52, lon: 5, tags: { name: 'Linde' } },
      ],
    };
    const fetchImpl = vi.fn((async (input: string) => {
      if (input.includes('service.pdok.nl')) throw new TypeError('Failed to fetch');
      return {
        ok: true,
        json: async () => osmPayload,
        arrayBuffer: async () => new ArrayBuffer(0),
      } as Response;
    }) as unknown as typeof fetch);

    const trees = await fetchDutchTreeObjects({ lat: 52, lon: 5 }, { fetchImpl });

    expect(trees).toHaveLength(1);
    expect(trees[0].name).toBe('OpenStreetMap boom Linde');
    // At least the AHN DSM+DTM attempt plus the OSM request must have been made.
    expect(fetchImpl).toHaveBeenCalled();
    const calls = fetchImpl.mock.calls.map((call) => call[0] as string);
    expect(calls.some((url) => url.includes('coverageId=dsm_05m'))).toBe(true);
    expect(calls.some((url) => url.includes('coverageId=dtm_05m'))).toBe(true);
    expect(calls.some((url) => url.includes('overpass-api'))).toBe(true);
  });

  it('exposes the AHN coverage ids as constants', () => {
    expect(AHN_DSM_COVERAGE_ID).toBe('dsm_05m');
    expect(AHN_DTM_COVERAGE_ID).toBe('dtm_05m');
  });
});
