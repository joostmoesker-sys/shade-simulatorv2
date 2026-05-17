import { describe, expect, it, vi } from 'vitest';

import {
  buildThreeDBagItemsUrl,
  fetchDutchBuildingObjects,
  parseDutchBuildingResponse,
} from '../../src/data/dutchBuildings';

describe('dutchBuildings', () => {
  it('builds a bounded 3D BAG request around a location', () => {
    const url = new URL(buildThreeDBagItemsUrl({ lat: 52, lon: 5 }, 50, 12));

    expect(url.origin + url.pathname).toBe('https://api.3dbag.nl/collections/pand/items');
    expect(url.searchParams.get('bbox')?.split(',')).toHaveLength(4);
    expect(url.searchParams.get('limit')).toBe('12');
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
});
