import { describe, expect, it } from 'vitest';

import {
  buildOsmRasterStyle,
  OSM_ATTRIBUTION,
  OSM_RASTER_TILE_URLS,
  SATELLITE_ATTRIBUTION,
  SATELLITE_RASTER_TILE_URLS,
} from '../../src/map/osmStyle';

describe('buildOsmRasterStyle', () => {
  const style = buildOsmRasterStyle();

  it('declares raster sources for OSM and satellite maps', () => {
    expect(style.version).toBe(8);
    expect(Object.keys(style.sources)).toEqual(['osm', 'satellite']);
    const source = style.sources.osm as { type: string; tiles: string[] };
    expect(source.type).toBe('raster');
    expect(source.tiles).toEqual([...OSM_RASTER_TILE_URLS]);
    const satellite = style.sources.satellite as { type: string; tiles: string[] };
    expect(satellite.type).toBe('raster');
    expect(satellite.tiles).toEqual([...SATELLITE_RASTER_TILE_URLS]);
  });

  it('renders OSM and satellite raster layers', () => {
    expect(style.layers).toHaveLength(2);
    expect(style.layers[0]).toMatchObject({ id: 'osm', type: 'raster', source: 'osm' });
    expect(style.layers[1]).toMatchObject({ id: 'satellite', type: 'raster', source: 'satellite' });
  });

  it('can start with satellite visible', () => {
    const satelliteStyle = buildOsmRasterStyle('satellite');
    expect(satelliteStyle.layers[0]).toMatchObject({ layout: { visibility: 'none' } });
    expect(satelliteStyle.layers[1]).toMatchObject({ layout: { visibility: 'visible' } });
  });

  it('attributes OpenStreetMap contributors', () => {
    const source = style.sources.osm as { attribution: string };
    expect(source.attribution).toBe(OSM_ATTRIBUTION);
    expect(source.attribution).toContain('OpenStreetMap');
    const satellite = style.sources.satellite as { attribution: string };
    expect(satellite.attribution).toBe(SATELLITE_ATTRIBUTION);
  });
});
