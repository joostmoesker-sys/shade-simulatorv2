/**
 * MapLibre map overlay for the PV array editor.
 *
 * Renders all PV arrays as filled footprint rectangles and, for the selected
 * array, provides:
 *  - A draggable move handle (✛) to reposition the array.
 *  - A draggable rotate handle (↻) to change the azimuth.
 *  - An azimuth arrow centred on the array indicating the panel-facing direction.
 */
import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { buildOsmRasterStyle } from './osmStyle';
import { arrayFootprintRing, bearing, getArrayDimensions, offsetPoint } from './pvArrayGeometry';
import { NL_DEFAULT_CENTER } from '../location/geocode';
import type { LatLon, PanelType, PVArray } from '../model/schema';

export interface PVArrayMapProps {
  arrays: PVArray[];
  panelTypes: PanelType[];
  selectedId: string | null;
  /** Fallback centre when no arrays exist yet. Typically the project location. */
  center?: LatLon;
  onSelect: (id: string) => void;
  onMove: (id: string, position: LatLon) => void;
  onRotate: (id: string, azimuthDeg: number) => void;
}

/** Metres beyond the front edge of the array at which the rotate handle sits. */
const ROTATE_HANDLE_OFFSET_M = 4;

const DEFAULT_ZOOM = 19;

/** SVG arrow pointing upward (north). Rotated by CSS to match the azimuth. */
const ARROW_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">' +
  '<polygon points="12,0 0,16 7,16 7,36 17,36 17,16 24,16" fill="#FFD700" stroke="#444" stroke-width="1.5" stroke-linejoin="round"/>' +
  '</svg>';

/** Build a GeoJSON FeatureCollection from the given arrays. */
function buildFeatureCollection(
  arrays: PVArray[],
  panelTypes: PanelType[],
): Record<string, unknown> {
  const ptMap = new Map(panelTypes.map((pt) => [pt.id, pt]));
  return {
    type: 'FeatureCollection',
    features: arrays.flatMap((array) => {
      const pt = ptMap.get(array.panelTypeId);
      if (!pt) return [];
      return [
        {
          type: 'Feature',
          id: array.id,
          properties: { id: array.id, name: array.name },
          geometry: { type: 'Polygon', coordinates: [arrayFootprintRing(array, pt)] },
        },
      ];
    }),
  };
}

export function PVArrayMap({
  arrays,
  panelTypes,
  selectedId,
  center = NL_DEFAULT_CENTER,
  onSelect,
  onMove,
  onRotate,
}: PVArrayMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Always-current callback refs so drag event closures are never stale.
  const onSelectRef = useRef(onSelect);
  const onMoveRef = useRef(onMove);
  const onRotateRef = useRef(onRotate);
  onSelectRef.current = onSelect;
  onMoveRef.current = onMove;
  onRotateRef.current = onRotate;

  // Marker refs for the selected array's interactive handles.
  const moveMarkerRef = useRef<Marker | null>(null);
  const rotateHandleRef = useRef<Marker | null>(null);
  const azimuthMarkerRef = useRef<Marker | null>(null);

  // Always-current reference to the selected array, read inside drag callbacks.
  const selectedArrayRef = useRef<PVArray | null>(null);

  // Track the previous selectedId so we know when a new array is selected.
  const prevSelectedIdRef = useRef<string | null>(null);

  // ── Effect 1: initialise MapLibre ────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const initCenter =
      arrays.find((a) => a.id === selectedId)?.position ?? arrays[0]?.position ?? center;

    let mounted = true;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildOsmRasterStyle(),
      center: [initCenter.lon, initCenter.lat],
      zoom: DEFAULT_ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'top-right');

    map.on('load', () => {
      if (!mounted) return;

      // Single shared GeoJSON source for all array footprints.
      map.addSource('pv-arrays', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Base fill – all arrays.
      map.addLayer({
        id: 'pv-arrays-fill',
        type: 'fill',
        source: 'pv-arrays',
        paint: { 'fill-color': '#1f5fa6', 'fill-opacity': 0.6 },
      });

      // Selected-array fill overlay (gold), starts with no-match filter.
      map.addLayer({
        id: 'pv-arrays-selected-fill',
        type: 'fill',
        source: 'pv-arrays',
        filter: ['==', ['get', 'id'], ''],
        paint: { 'fill-color': '#ffd700', 'fill-opacity': 0.75 },
      });

      // Outline – all arrays.
      map.addLayer({
        id: 'pv-arrays-outline',
        type: 'line',
        source: 'pv-arrays',
        paint: { 'line-color': '#0d3d6e', 'line-width': 2 },
      });

      // Selected-array outline.
      map.addLayer({
        id: 'pv-arrays-selected-outline',
        type: 'line',
        source: 'pv-arrays',
        filter: ['==', ['get', 'id'], ''],
        paint: { 'line-color': '#cc8800', 'line-width': 2.5 },
      });

      // Click on any array footprint to select it.
      map.on('click', 'pv-arrays-fill', (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) onSelectRef.current(id);
      });

      map.on('mouseenter', 'pv-arrays-fill', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'pv-arrays-fill', () => {
        map.getCanvas().style.cursor = '';
      });

      setMapLoaded(true);
    });

    return () => {
      mounted = false;
      moveMarkerRef.current?.remove();
      moveMarkerRef.current = null;
      rotateHandleRef.current?.remove();
      rotateHandleRef.current = null;
      azimuthMarkerRef.current?.remove();
      azimuthMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // Intentionally runs only once; subsequent prop changes handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Effect 2: keep GeoJSON source data in sync ───────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const src = map.getSource('pv-arrays') as GeoJSONSource | undefined;
    if (!src) return;
    // Cast through unknown to avoid @types/geojson version friction; the
    // runtime value is always a valid GeoJSON FeatureCollection.
    src.setData(
      buildFeatureCollection(arrays, panelTypes) as unknown as Parameters<
        GeoJSONSource['setData']
      >[0],
    );
  }, [arrays, panelTypes, mapLoaded]);

  // ── Effect 3: update selection highlight filters ──────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    // FilterSpecification is a deep tagged-union; cast through unknown to avoid
    // verbose type gymnastics while preserving the correct runtime value.
    const filter = ['==', ['get', 'id'], selectedId ?? ''] as unknown as maplibregl.FilterSpecification;
    map.setFilter('pv-arrays-selected-fill', filter);
    map.setFilter('pv-arrays-selected-outline', filter);
  }, [selectedId, mapLoaded]);

  // ── Effect 4: sync move / rotate / azimuth markers ───────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const array = arrays.find((a) => a.id === selectedId) ?? null;
    const panelType = array
      ? (panelTypes.find((pt) => pt.id === array.panelTypeId) ?? null)
      : null;

    // Always keep the ref current so drag callbacks read the latest position.
    selectedArrayRef.current = array;

    const selectionChanged = prevSelectedIdRef.current !== selectedId;
    prevSelectedIdRef.current = selectedId;

    if (!array || !panelType) {
      moveMarkerRef.current?.remove();
      moveMarkerRef.current = null;
      rotateHandleRef.current?.remove();
      rotateHandleRef.current = null;
      azimuthMarkerRef.current?.remove();
      azimuthMarkerRef.current = null;
      return;
    }

    const c = array.position;
    const { depthM } = getArrayDimensions(array, panelType);
    const rotPos = offsetPoint(c, array.azimuthDeg, depthM / 2 + ROTATE_HANDLE_OFFSET_M);
    const arrayId = array.id;

    if (selectionChanged) {
      // Remove stale markers whose drag callbacks captured the old arrayId.
      moveMarkerRef.current?.remove();
      moveMarkerRef.current = null;
      rotateHandleRef.current?.remove();
      rotateHandleRef.current = null;
      azimuthMarkerRef.current?.remove();
      azimuthMarkerRef.current = null;

      // ── Move handle ──────────────────────────────────────────────────────
      const moveEl = document.createElement('div');
      moveEl.className = 'move-handle';
      moveEl.title = 'Sleep om de array te verplaatsen';
      const moveMarker = new Marker({ element: moveEl, anchor: 'center', draggable: true })
        .setLngLat([c.lon, c.lat])
        .addTo(map);
      moveMarker.on('dragend', () => {
        const ll = moveMarker.getLngLat();
        onMoveRef.current(arrayId, { lat: ll.lat, lon: ll.lng });
      });
      moveMarkerRef.current = moveMarker;

      // ── Rotate handle ────────────────────────────────────────────────────
      const rotEl = document.createElement('div');
      rotEl.className = 'rotate-handle';
      rotEl.title = 'Sleep om de array te draaien';
      const rotMarker = new Marker({ element: rotEl, anchor: 'center', draggable: true })
        .setLngLat([rotPos.lon, rotPos.lat])
        .addTo(map);
      rotMarker.on('dragend', () => {
        const ll = rotMarker.getLngLat();
        const cur = selectedArrayRef.current;
        if (!cur || cur.id !== arrayId) return;
        const newAz = bearing(cur.position, { lat: ll.lat, lon: ll.lng });
        onRotateRef.current(arrayId, Math.round(newAz));
      });
      rotateHandleRef.current = rotMarker;

      // ── Azimuth arrow ────────────────────────────────────────────────────
      // Outer element receives MapLibre's positioning transform.
      // Inner element is rotated so the arrow tip points in the azimuth direction.
      const azOuter = document.createElement('div');
      azOuter.className = 'azimuth-arrow-marker';
      azOuter.setAttribute('aria-hidden', 'true');
      const azInner = document.createElement('div');
      azInner.style.transformOrigin = '50% 100%';
      azInner.style.transform = `rotate(${array.azimuthDeg}deg)`;
      azInner.innerHTML = ARROW_SVG;
      azOuter.appendChild(azInner);
      const azMarker = new Marker({ element: azOuter, anchor: 'bottom', draggable: false })
        .setLngLat([c.lon, c.lat])
        .addTo(map);
      azimuthMarkerRef.current = azMarker;

      // Ease to the newly-selected array.
      map.easeTo({ center: [c.lon, c.lat], duration: 400 });
    } else {
      // Same selection – just update marker positions and rotation.
      moveMarkerRef.current?.setLngLat([c.lon, c.lat]);
      rotateHandleRef.current?.setLngLat([rotPos.lon, rotPos.lat]);
      if (azimuthMarkerRef.current) {
        azimuthMarkerRef.current.setLngLat([c.lon, c.lat]);
        const inner = azimuthMarkerRef.current.getElement().firstElementChild as HTMLElement | null;
        if (inner) inner.style.transform = `rotate(${array.azimuthDeg}deg)`;
      }
    }
  }, [arrays, panelTypes, selectedId, mapLoaded]);

  return (
    <div
      ref={containerRef}
      data-testid="pv-array-map"
      style={{ width: '100%', height: '100%' }}
    />
  );
}
