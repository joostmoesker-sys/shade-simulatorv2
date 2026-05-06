/**
 * Thin React wrapper around a MapLibre map showing OpenStreetMap tiles
 * and a single draggable / clickable location pin.
 *
 * Side effects (creating the map, attaching listeners) are isolated so
 * that the component is easy to unmount and re-mount in tests.
 */
import { useEffect, useRef } from 'react';
import maplibregl, { type Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { buildOsmRasterStyle } from './osmStyle';
import { isInsideNetherlands, NL_DEFAULT_CENTER } from '../location/geocode';
import type { LatLon } from '../model/schema';

export interface OsmMapProps {
  /** Currently selected pin location. `null` means no pin shown. */
  value: LatLon | null;
  /** Called when the user clicks on the map or drags the pin. */
  onChange: (location: LatLon) => void;
  /** Initial centre when no `value` is set. */
  initialCenter?: LatLon;
  initialZoom?: number;
  className?: string;
}

const DEFAULT_ZOOM = 7;
const FOCUSED_ZOOM = 16;

export function OsmMap({
  value,
  onChange,
  initialCenter = NL_DEFAULT_CENTER,
  initialZoom = DEFAULT_ZOOM,
  className,
}: OsmMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  // Latest onChange in a ref so the effect below doesn't have to re-init the
  // map every time the parent re-renders with a new callback identity.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;
    const center = value ?? initialCenter;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildOsmRasterStyle(),
      center: [center.lon, center.lat],
      zoom: value ? FOCUSED_ZOOM : initialZoom,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');

    map.on('click', (e) => {
      const point = { lat: e.lngLat.lat, lon: e.lngLat.lng };
      if (!isInsideNetherlands(point)) return;
      onChangeRef.current(point);
    });

    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // We deliberately depend only on the initial centre/zoom; subsequent
    // updates to `value` are handled by the second effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync the marker with the controlled `value` prop.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!value) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      const marker = new maplibregl.Marker({ draggable: true, color: '#d62728' })
        .setLngLat([value.lon, value.lat])
        .addTo(map);
      marker.on('dragend', () => {
        const lngLat = marker.getLngLat();
        const point = { lat: lngLat.lat, lon: lngLat.lng };
        if (!isInsideNetherlands(point)) {
          // Snap back to the previous valid location.
          marker.setLngLat([value.lon, value.lat]);
          return;
        }
        onChangeRef.current(point);
      });
      markerRef.current = marker;
    } else {
      markerRef.current.setLngLat([value.lon, value.lat]);
    }
    map.easeTo({ center: [value.lon, value.lat], zoom: FOCUSED_ZOOM, duration: 600 });
  }, [value]);

  return (
    <div
      ref={containerRef}
      className={className}
      data-testid="osm-map"
      style={{ width: '100%', height: '100%', minHeight: 320 }}
    />
  );
}
