import { describe, expect, it } from 'vitest';

import {
  buildOsmRasterStyle,
  OSM_ATTRIBUTION,
  OSM_RASTER_TILE_URLS,
} from '../../src/map/osmStyle';

describe('buildOsmRasterStyle', () => {
  const style = buildOsmRasterStyle();

  it('declares a single raster source named "osm"', () => {
    expect(style.version).toBe(8);
    expect(Object.keys(style.sources)).toEqual(['osm']);
    const source = style.sources.osm as { type: string; tiles: string[] };
    expect(source.type).toBe('raster');
    expect(source.tiles).toEqual([...OSM_RASTER_TILE_URLS]);
  });

  it('renders the raster source as the only layer', () => {
    expect(style.layers).toHaveLength(1);
    expect(style.layers[0]).toMatchObject({ id: 'osm', type: 'raster', source: 'osm' });
  });

  it('attributes OpenStreetMap contributors', () => {
    const source = style.sources.osm as { attribution: string };
    expect(source.attribution).toBe(OSM_ATTRIBUTION);
    expect(source.attribution).toContain('OpenStreetMap');
  });
});
