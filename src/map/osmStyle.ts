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

export type MapBaseLayer = 'osm' | 'satellite';

export const SATELLITE_RASTER_TILE_URLS = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
] as const;

export const SATELLITE_ATTRIBUTION =
  'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community';

export function buildOsmRasterStyle(initialBaseLayer: MapBaseLayer = 'osm'): StyleSpecification {
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
      satellite: {
        type: 'raster',
        tiles: [...SATELLITE_RASTER_TILE_URLS],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 19,
        attribution: SATELLITE_ATTRIBUTION,
      },
    },
    layers: [
      {
        id: 'osm',
        type: 'raster',
        source: 'osm',
        layout: { visibility: initialBaseLayer === 'osm' ? 'visible' : 'none' },
      },
      {
        id: 'satellite',
        type: 'raster',
        source: 'satellite',
        layout: { visibility: initialBaseLayer === 'satellite' ? 'visible' : 'none' },
      },
    ],
  };
}
