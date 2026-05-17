import { describe, expect, it, vi } from 'vitest';

import {
  buildPdokBagWfsUrl,
  buildThreeDBagItemsUrl,
  fetchDutchBuildingObjects,
  parseDutchBuildingResponse,
  parsePdokBagResponse,
} from '../../src/data/dutchBuildings';

describe('dutchBuildings', () => {
  it('builds a bounded 3D BAG request around a location', () => {
    const url = new URL(buildThreeDBagItemsUrl({ lat: 52, lon: 5 }, 50, 12));

    expect(url.origin + url.pathname).toBe('https://api.3dbag.nl/collections/pand/items');
    expect(url.searchParams.get('bbox')?.split(',')).toHaveLength(4);
    expect(url.searchParams.get('limit')).toBe('12');
  });

  it('builds a bounded PDOK BAG WFS fallback request in RD coordinates', () => {
    const url = new URL(buildPdokBagWfsUrl({ lat: 51.25, lon: 5.98 }, 75, 25));

    expect(url.origin + url.pathname).toBe('https://geodata.nationaalgeoregister.nl/bag/wfs/v1_1');
    expect(url.searchParams.get('typeName')).toBe('bag:pand');
    expect(url.searchParams.get('outputFormat')).toBe('application/json');
    expect(url.searchParams.get('bbox')?.split(',')).toHaveLength(5);
    expect(url.searchParams.get('maxFeatures')).toBe('25');
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
});
