import { describe, expect, it, vi } from 'vitest';

import {
  buildOpenStreetMapTreesOverpassUrl,
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

  it('fetches trees with an injectable fetch implementation', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ elements: [] }),
    })) as unknown as typeof fetch;

    await expect(fetchDutchTreeObjects({ lat: 52, lon: 5 }, { fetchImpl })).resolves.toEqual([]);
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('natural'), {
      headers: { Accept: 'application/json' },
    });
  });
});
