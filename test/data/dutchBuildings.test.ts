import { describe, expect, it, vi } from 'vitest';

import {
  buildOpenStreetMapOverpassUrl,
  buildPdokBagWfsUrl,
  buildThreeDBagItemsUrl,
  fetchDutchBuildingObjects,
  parseDutchBuildingResponse,
  parseOpenStreetMapBuildingsResponse,
  parsePdokBagResponse,
} from '../../src/data/dutchBuildings';

describe('dutchBuildings', () => {
  it('builds a bounded 3D BAG request around a location', () => {
    const url = new URL(buildThreeDBagItemsUrl({ lat: 52, lon: 5 }, 50, 12));

    expect(url.origin + url.pathname).toBe('https://api.3dbag.nl/v3/collections/pand/items');
    expect(url.searchParams.get('bbox')?.split(',')).toHaveLength(4);
    expect(url.searchParams.get('limit')).toBe('12');
    // Requesting CityJSON gives us LoD2.2 with sloped roofs instead of flat boxes.
    expect(url.searchParams.get('f')).toBe('cityjson');
  });

  it('builds a bounded PDOK BAG WFS fallback request in RD coordinates', () => {
    const url = new URL(buildPdokBagWfsUrl({ lat: 51.25, lon: 5.98 }, 75, 25));

    expect(url.origin + url.pathname).toBe('https://geodata.nationaalgeoregister.nl/bag/wfs/v1_1');
    expect(url.searchParams.get('typeName')).toBe('bag:pand');
    expect(url.searchParams.get('outputFormat')).toBe('application/json');
    expect(url.searchParams.get('bbox')?.split(',')).toHaveLength(5);
    expect(url.searchParams.get('maxFeatures')).toBe('25');
  });

  it('builds a bounded OpenStreetMap Overpass fallback request', () => {
    const url = new URL(buildOpenStreetMapOverpassUrl({ lat: 51.25, lon: 5.98 }, 75, 25));
    const query = url.searchParams.get('data') ?? '';

    expect(url.origin + url.pathname).toBe('https://overpass-api.de/api/interpreter');
    expect(query).toContain('way["building"]');
    expect(query).toContain('out geom qt 25');
  });

  it('parses GeoJSON building footprints and 3DBAG roof height attributes', () => {
    const buildings = parseDutchBuildingResponse({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { identificatie: 'pand-1', b3_h_dak_50p: 14, b3_h_maaiveld: 2 },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [5, 52],
                [5.0001, 52],
                [5.0001, 52.0001],
                [5, 52],
              ],
            ],
          },
        },
      ],
    });

    expect(buildings[0]).toMatchObject({
      kind: 'building',
      name: '3D BAG pand-1',
      heightM: 12,
      footprint: [
        [5, 52],
        [5.0001, 52],
        [5.0001, 52.0001],
      ],
    });
  });

  it('preserves 3D BAG CityJSON roof surfaces for non-flat buildings', () => {
    const buildings = parseDutchBuildingResponse({
      type: 'CityJSONFeature',
      transform: { scale: [1, 1, 1], translate: [0, 0, 0] },
      vertices: [
        [5, 52, 0],
        [5.0002, 52, 0],
        [5.0002, 52.0001, 0],
        [5, 52.0001, 0],
        [5, 52, 3],
        [5.0002, 52, 3],
        [5.0002, 52.0001, 3],
        [5, 52.0001, 3],
        [5.0001, 52.00005, 4],
      ],
      CityObjects: {
        pand: {
          geometry: [
            {
              type: 'MultiSurface',
              boundaries: [
                [[0, 1, 2, 3, 0]],
                [[4, 5, 8, 4]],
                [[5, 6, 7, 8, 5]],
              ],
              semantics: {
                surfaces: [{ type: 'GroundSurface' }, { type: 'RoofSurface' }],
                values: [0, 1, 1],
              },
            },
          ],
        },
      },
    });

    expect(buildings[0]).toMatchObject({
      heightM: 4,
      footprint: [
        [5, 52],
        [5.0002, 52],
        [5.0002, 52.0001],
        [5, 52.0001],
      ],
      roofSurfaces: [
        {
          baseHeightM: 3,
          heightM: 4,
          vertices: [
            [5, 52, 3],
            [5.0002, 52, 3],
            [5.0001, 52.00005, 4],
          ],
          footprint: [
            [5, 52],
            [5.0002, 52],
            [5.0001, 52.00005],
          ],
        },
        expect.objectContaining({ baseHeightM: 3, heightM: 4 }),
      ],
    });
  });

  it('preserves 3D GeoJSON roof vertex heights when they are present', () => {
    const buildings = parseDutchBuildingResponse({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'MultiPolygon',
            coordinates: [
              [
                [
                  [5, 52, 3],
                  [5.0002, 52, 3],
                  [5.0001, 52.0001, 5],
                  [5, 52, 3],
                ],
              ],
              [
                [
                  [5.0002, 52, 3],
                  [5.0002, 52.0002, 3],
                  [5.0001, 52.0001, 5],
                  [5.0002, 52, 3],
                ],
              ],
            ],
          },
        },
      ],
    });

    expect(buildings[0].heightM).toBe(2);
    expect(buildings[0].roofSurfaces).toHaveLength(2);
    expect(buildings[0].roofSurfaces?.[0].vertices).toEqual([
      [5, 52, 0],
      [5.0002, 52, 0],
      [5.0001, 52.0001, 2],
    ]);
  });

  it('parses a top-level 3D BAG CityJSON document and prefers LoD2.2 roof shapes over LoD1.2 boxes', () => {
    const buildings = parseDutchBuildingResponse({
      type: 'CityJSON',
      version: '1.1',
      transform: { scale: [1, 1, 1], translate: [0, 0, 0] },
      // Vertices 0..3 are the ground ring; 4..7 are the LoD1.2 flat-top box;
      // 8..11 are the LoD2.2 eaves; 12 is the ridge that gives a saddle roof.
      vertices: [
        [5, 52, 0],
        [5.0002, 52, 0],
        [5.0002, 52.0001, 0],
        [5, 52.0001, 0],
        [5, 52, 6],
        [5.0002, 52, 6],
        [5.0002, 52.0001, 6],
        [5, 52.0001, 6],
        [5, 52, 4],
        [5.0002, 52, 4],
        [5.0002, 52.0001, 4],
        [5, 52.0001, 4],
        [5.0001, 52.00005, 7],
      ],
      CityObjects: {
        'NL.IMBAG.Pand.0001': {
          type: 'Building',
          attributes: { identificatie: '0001', b3_h_dak_50p: 9, b3_h_maaiveld: 2 },
          children: ['NL.IMBAG.Pand.0001-0'],
          geometry: [
            {
              type: 'MultiSurface',
              lod: '0',
              boundaries: [[[0, 1, 2, 3]]],
              semantics: { surfaces: [{ type: 'GroundSurface' }], values: [0] },
            },
          ],
        },
        'NL.IMBAG.Pand.0001-0': {
          type: 'BuildingPart',
          parents: ['NL.IMBAG.Pand.0001'],
          geometry: [
            {
              type: 'MultiSurface',
              lod: '1.2',
              boundaries: [[[0, 1, 2, 3]], [[4, 5, 6, 7]]],
              semantics: { surfaces: [{ type: 'GroundSurface' }, { type: 'RoofSurface' }], values: [0, 1] },
            },
            {
              type: 'MultiSurface',
              lod: '2.2',
              boundaries: [
                [[0, 1, 2, 3]],
                [[8, 9, 12]],
                [[9, 10, 12]],
                [[10, 11, 12]],
                [[11, 8, 12]],
              ],
              semantics: {
                surfaces: [{ type: 'GroundSurface' }, { type: 'RoofSurface' }],
                values: [0, 1, 1, 1, 1],
              },
            },
          ],
        },
      },
    });

    expect(buildings).toHaveLength(1);
    expect(buildings[0].name).toBe('3D BAG 0001');
    // Building height is read from the LoD2.2 ridge (7m above ground), not from the LoD1.2 box (6m).
    expect(buildings[0].heightM).toBe(7);
    expect(buildings[0].roofSurfaces).toHaveLength(4);
    // Each LoD2.2 triangle has a unique ridge vertex (z=3 above eaves at z=4), proving the sloped roof survives.
    const ridgeHeights = buildings[0].roofSurfaces?.map((surface) => surface.heightM) ?? [];
    expect(ridgeHeights.every((heightM) => heightM === 7)).toBe(true);
    const eaveHeights = buildings[0].roofSurfaces?.map((surface) => surface.baseHeightM) ?? [];
    expect(eaveHeights.every((heightM) => heightM === 4)).toBe(true);
  });

  it('skips BuildingParts at the top level when parsing a CityJSON document', () => {
    const buildings = parseDutchBuildingResponse({
      type: 'CityJSON',
      transform: { scale: [1, 1, 1], translate: [0, 0, 0] },
      vertices: [
        [5, 52, 0],
        [5.0001, 52, 0],
        [5.0001, 52.0001, 0],
        [5, 52, 3],
      ],
      CityObjects: {
        part: {
          type: 'BuildingPart',
          parents: ['parent'],
          geometry: [
            {
              type: 'MultiSurface',
              lod: '2.2',
              boundaries: [[[0, 1, 2]], [[0, 1, 3]]],
              semantics: { surfaces: [{ type: 'GroundSurface' }, { type: 'RoofSurface' }], values: [0, 1] },
            },
          ],
        },
      },
    });

    expect(buildings).toEqual([]);
  });

  it('fetches and parses buildings with an injectable fetch implementation', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ type: 'FeatureCollection', features: [] }),
    })) as unknown as typeof fetch;

    await expect(fetchDutchBuildingObjects({ lat: 52, lon: 5 }, { fetchImpl })).resolves.toEqual([]);
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('bbox='), {
      headers: { Accept: 'application/json, application/geo+json' },
    });
  });

  it('falls back to PDOK BAG when 3D BAG cannot be fetched', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: { identificatie: 'pand-2' },
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [196_000, 360_000],
                    [196_010, 360_000],
                    [196_010, 360_010],
                    [196_000, 360_000],
                  ],
                ],
              },
            },
          ],
        }),
      }) as unknown as typeof fetch;

    const buildings = await fetchDutchBuildingObjects({ lat: 51.25, lon: 5.98 }, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(buildings[0].name).toBe('BAG pand-2');
    expect(buildings[0].heightM).toBe(6);
    expect(buildings[0].footprint[0][0]).toBeGreaterThan(3.1);
    expect(buildings[0].footprint[0][0]).toBeLessThan(7.4);
  });

  it('falls back to OpenStreetMap when 3D BAG and PDOK BAG cannot be fetched', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          elements: [
            {
              type: 'way',
              id: 123,
              tags: { 'building:levels': '2' },
              geometry: [
                { lon: 5.98, lat: 51.25 },
                { lon: 5.9801, lat: 51.25 },
                { lon: 5.9801, lat: 51.2501 },
                { lon: 5.98, lat: 51.25 },
              ],
            },
          ],
        }),
      }) as unknown as typeof fetch;

    const buildings = await fetchDutchBuildingObjects({ lat: 51.25, lon: 5.98 }, { fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(buildings[0]).toMatchObject({
      name: 'OpenStreetMap 123',
      heightM: 6,
      footprint: [
        [5.98, 51.25],
        [5.9801, 51.25],
        [5.9801, 51.2501],
      ],
    });
  });

  it('parses PDOK BAG RD coordinates as WGS84 footprints', () => {
    const buildings = parsePdokBagResponse({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { identificatie: 'pand-3' },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [155_000, 463_000],
                [155_010, 463_000],
                [155_010, 463_010],
                [155_000, 463_000],
              ],
            ],
          },
        },
      ],
    });

    expect(buildings[0].name).toBe('BAG pand-3');
    expect(buildings[0].position).toMatchObject({
      lat: expect.closeTo(52.1552, 3),
      lon: expect.closeTo(5.3872, 3),
    });
  });

  it('parses OpenStreetMap building geometry and height tags', () => {
    const buildings = parseOpenStreetMapBuildingsResponse({
      elements: [
        {
          type: 'way',
          id: 456,
          tags: { name: 'Schuur', height: '4,5 m' },
          geometry: [
            { lon: 5.98, lat: 51.25 },
            { lon: 5.9801, lat: 51.25 },
            { lon: 5.9801, lat: 51.2501 },
            { lon: 5.98, lat: 51.25 },
          ],
        },
      ],
    });

    expect(buildings[0]).toMatchObject({
      name: 'OpenStreetMap Schuur',
      heightM: 4.5,
      position: {
        lat: expect.closeTo(51.25003, 5),
        lon: expect.closeTo(5.98007, 5),
      },
    });
  });
});
