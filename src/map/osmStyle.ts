/**
 * MapLibre style descriptor backed by the OpenStreetMap raster tile server.
 *
 * The OSM tile server is suitable for low-volume / development usage. For
 * heavier production traffic the style URL should be swapped to a hosted
 * tile provider that respects the OSM tile usage policy.
 */
import type { StyleSpecification } from 'maplibre-gl';

export const OSM_RASTER_TILE_URLS = [
  'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
  'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
  'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
] as const;

export const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export function buildOsmRasterStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      osm: {
        type: 'raster',
        tiles: [...OSM_RASTER_TILE_URLS],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 19,
        attribution: OSM_ATTRIBUTION,
      },
    },
    layers: [
      {
        id: 'osm',
        type: 'raster',
        source: 'osm',
      },
    ],
  };
}
