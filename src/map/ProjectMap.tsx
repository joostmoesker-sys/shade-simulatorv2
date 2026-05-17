import { useEffect, useRef, useState } from 'react';
import maplibregl, {
  type CustomLayerInterface,
  type GeoJSONSource,
  type Map as MapLibreMap,
  Marker,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { isInsideNetherlands } from '../location/geocode';
import { sceneObjectKindLabel } from '../model/sceneObjectLabels';
import type { BuildingObject, LatLon, PanelType, PVArray, SceneObject } from '../model/schema';
import { buildShadowFeatureCollection } from '../simulation/shading';
import { calculateSolarPosition } from '../simulation/solarPosition';
import { useProjectStore } from '../store/projectStore';
import { buildOsmRasterStyle, type MapBaseLayer } from './osmStyle';
import { arrayFootprintRing, bearing, getArrayDimensions, METERS_PER_DEG_LAT, offsetPoint } from './pvArrayGeometry';

const DEFAULT_ZOOM = 18;
const LOCATION_ZOOM = 16;
const ROTATE_HANDLE_OFFSET_M = 4;
const TREE_CENTER_MARKER_RADIUS = 6;
const ROOF_VERTEX_SHADER =
  'uniform mat4 u_matrix;' +
  'attribute vec3 a_pos;' +
  'void main() {' +
  '  gl_Position = u_matrix * vec4(a_pos, 1.0);' +
  '}';
const ROOF_FRAGMENT_SHADER =
  'precision mediump float;' +
  'void main() {' +
  '  gl_FragColor = vec4(0.61, 0.34, 0.16, 0.92);' +
  '}';

const ARROW_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">' +
  '<polygon points="12,0 0,16 7,16 7,36 17,36 17,16 24,16" fill="#FFD700" stroke="#444" stroke-width="1.5" stroke-linejoin="round"/>' +
  '</svg>';

function buildPVFeatureCollection(arrays: PVArray[], panelTypes: PanelType[]): Record<string, unknown> {
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

function buildSceneFeatureCollection(objects: SceneObject[]): Record<string, unknown> {
  return {
    type: 'FeatureCollection',
    features: objects.map((object) => ({
      type: 'Feature',
      id: object.id,
      properties: {
        id: object.id,
        name: object.name,
        kind: object.kind,
        heightM:
          object.kind === 'building' && object.roofSurfaces?.length
            ? Math.min(...object.roofSurfaces.map((surface) => surface.baseHeightM))
            : object.kind === 'tree' || object.kind === 'building'
              ? object.heightM
              : 0,
        trunkHeightM: object.kind === 'tree' ? object.trunkHeightM : 0,
      },
      geometry:
        object.kind === 'building'
          ? { type: 'Polygon', coordinates: [[...object.footprint, object.footprint[0]]] }
          : { type: 'Point', coordinates: [object.position.lon, object.position.lat] },
    })),
  };
}

interface BuildingRoofMeshLayer extends CustomLayerInterface {
  setObjects: (objects: SceneObject[]) => void;
}

function createBuildingRoofMeshLayer(): BuildingRoofMeshLayer {
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let vertexCount = 0;
  let currentGl: WebGLRenderingContext | null = null;

  function setObjects(objects: SceneObject[]) {
    if (!currentGl || !buffer) return;
    const vertices = buildRoofMeshVertices(objects);
    vertexCount = vertices.length / 3;
    currentGl.bindBuffer(currentGl.ARRAY_BUFFER, buffer);
    currentGl.bufferData(currentGl.ARRAY_BUFFER, new Float32Array(vertices), currentGl.STATIC_DRAW);
  }

  return {
    id: 'building-roofs-mesh',
    type: 'custom',
    renderingMode: '3d',
    setObjects,
    onAdd: (_map, gl) => {
      currentGl = gl;
      program = createRoofProgram(gl);
      buffer = gl.createBuffer();
    },
    render: (gl, matrix) => {
      if (!program || !buffer || vertexCount === 0) return;
      const positionLocation = gl.getAttribLocation(program, 'a_pos');
      const matrixLocation = gl.getUniformLocation(program, 'u_matrix');
      gl.useProgram(program);
      gl.uniformMatrix4fv(matrixLocation, false, matrix);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
    },
    onRemove: (_map, gl) => {
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      buffer = null;
      program = null;
      currentGl = null;
      vertexCount = 0;
    },
  };
}

function createRoofProgram(gl: WebGLRenderingContext): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, ROOF_VERTEX_SHADER);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, ROOF_FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (!program) throw new Error('Kon dakshader niet aanmaken');
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) ?? 'Kon dakshader niet linken');
  }
  return program;
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Kon dakshader niet aanmaken');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader) ?? 'Kon dakshader niet compileren');
  }
  return shader;
}

function buildRoofMeshVertices(objects: SceneObject[]): number[] {
  const vertices: number[] = [];
  for (const object of objects) {
    if (object.kind !== 'building' || !object.roofSurfaces?.length) continue;
    for (const surface of object.roofSurfaces) {
      const ring = surface.vertices ?? surface.footprint.map(([lon, lat]) => [lon, lat, surface.heightM] as [number, number, number]);
      for (let index = 1; index < ring.length - 1; index++) {
        for (const point of [ring[0], ring[index], ring[index + 1]]) {
          const mercator = maplibregl.MercatorCoordinate.fromLngLat({ lng: point[0], lat: point[1] }, point[2]);
          vertices.push(mercator.x, mercator.y, mercator.z);
        }
      }
    }
  }
  return vertices;
}

/**
 * Approximate a geographic circle as a GeoJSON polygon ring.
 * 1° latitude ≈ 111 320 m everywhere; 1° longitude shrinks by cos(lat).
 */
function crownCircleRing(lat: number, lon: number, radiusM: number, steps = 32): [number, number][] {
  const dLat = radiusM / METERS_PER_DEG_LAT;
  const dLon = radiusM / (METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (2 * Math.PI * i) / steps;
    ring.push([lon + dLon * Math.cos(angle), lat + dLat * Math.sin(angle)]);
  }
  return ring;
}

function buildTreeCrownFeatureCollection(objects: SceneObject[]): Record<string, unknown> {
  return {
    type: 'FeatureCollection',
    features: objects.flatMap((object) => {
      if (object.kind !== 'tree') return [];
      return [
        {
          type: 'Feature',
          id: object.id,
          properties: { id: object.id, heightM: object.heightM, trunkHeightM: object.trunkHeightM },
          geometry: {
            type: 'Polygon',
            coordinates: [crownCircleRing(object.position.lat, object.position.lon, object.crownRadiusM)],
          },
        },
      ];
    }),
  };
}

function buildTreeTrunkFeatureCollection(objects: SceneObject[]): Record<string, unknown> {
  return {
    type: 'FeatureCollection',
    features: objects.flatMap((object) => {
      if (object.kind !== 'tree') return [];
      const trunkRadiusM = Math.max(0.15, Math.min(0.45, object.crownRadiusM * 0.16));
      return [
        {
          type: 'Feature',
          id: `${object.id}-trunk`,
          properties: { id: object.id, heightM: object.trunkHeightM },
          geometry: {
            type: 'Polygon',
            coordinates: [crownCircleRing(object.position.lat, object.position.lon, trunkRadiusM, 16)],
          },
        },
      ];
    }),
  };
}

function translateFootprint(
  building: BuildingObject,
  nextPosition: LatLon,
): [number, number][] {
  const dLon = nextPosition.lon - building.position.lon;
  const dLat = nextPosition.lat - building.position.lat;
  return building.footprint.map(([lon, lat]) => [lon + dLon, lat + dLat]);
}

function translateRoofSurfaces(
  building: BuildingObject,
  nextPosition: LatLon,
): BuildingObject['roofSurfaces'] {
  const dLon = nextPosition.lon - building.position.lon;
  const dLat = nextPosition.lat - building.position.lat;
  return building.roofSurfaces?.map((surface) => ({
    ...surface,
    footprint: surface.footprint.map(([lon, lat]) => [lon + dLon, lat + dLat]),
  }));
}

export function ProjectMap() {
  const project = useProjectStore((s) => s.project);
  const activeTab = useProjectStore((s) => s.activeTab);
  const selectedSceneObjectId = useProjectStore((s) => s.selectedSceneObjectId);
  const selectedPVArrayId = useProjectStore((s) => s.selectedPVArrayId);
  const objectMapAddKind = useProjectStore((s) => s.objectMapAddKind);
  const simulationPreviewTimestamp = useProjectStore((s) => s.simulationPreviewTimestamp);
  const setLocation = useProjectStore((s) => s.setLocation);
  const addSceneObject = useProjectStore((s) => s.addSceneObject);
  const updateSceneObject = useProjectStore((s) => s.updateSceneObject);
  const setSelectedSceneObjectId = useProjectStore((s) => s.setSelectedSceneObjectId);
  const updatePVArray = useProjectStore((s) => s.updatePVArray);
  const setSelectedPVArrayId = useProjectStore((s) => s.setSelectedPVArrayId);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const buildingRoofMeshLayerRef = useRef<BuildingRoofMeshLayer | null>(null);
  const locationMarkerRef = useRef<Marker | null>(null);
  const objectMarkerRef = useRef<Marker | null>(null);
  const moveMarkerRef = useRef<Marker | null>(null);
  const rotateHandleRef = useRef<Marker | null>(null);
  const azimuthMarkerRef = useRef<Marker | null>(null);
  const previousObjectIdRef = useRef<string | null>(null);
  const previousArrayIdRef = useRef<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [baseLayer, setBaseLayer] = useState<MapBaseLayer>('osm');

  const refs = useRef({
    activeTab,
    objectMapAddKind,
    project,
  });
  refs.current = { activeTab, objectMapAddKind, project };

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildOsmRasterStyle(baseLayer),
      center: [project.location.lon, project.location.lat],
      zoom: project.location ? LOCATION_ZOOM : DEFAULT_ZOOM,
      pitch: 55,
      bearing: -20,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    map.on('load', () => {
      map.addSource('pv-arrays', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addSource('shade-shadows', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'shade-shadows-fill',
        type: 'fill',
        source: 'shade-shadows',
        paint: {
          'fill-color': '#1a1a1a',
          'fill-opacity': ['get', 'opacity'],
        },
      });
      map.addLayer({
        id: 'shade-shadows-outline',
        type: 'line',
        source: 'shade-shadows',
        paint: { 'line-color': '#1a1a1a', 'line-width': 1, 'line-opacity': 0.35 },
      });
      map.addLayer({
        id: 'pv-arrays-fill',
        type: 'fill',
        source: 'pv-arrays',
        paint: { 'fill-color': '#1f5fa6', 'fill-opacity': 0.55 },
      });
      map.addLayer({
        id: 'pv-arrays-selected-fill',
        type: 'fill',
        source: 'pv-arrays',
        filter: ['==', ['get', 'id'], ''],
        paint: { 'fill-color': '#ffd700', 'fill-opacity': 0.75 },
      });
      map.addLayer({
        id: 'pv-arrays-outline',
        type: 'line',
        source: 'pv-arrays',
        paint: { 'line-color': '#0d3d6e', 'line-width': 2 },
      });

      map.addSource('scene-objects', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'buildings-fill',
        type: 'fill',
        source: 'scene-objects',
        filter: ['==', ['get', 'kind'], 'building'],
        paint: { 'fill-color': '#7b5a3a', 'fill-opacity': 0.2 },
      });
      map.addLayer({
        id: 'buildings-extrusion',
        type: 'fill-extrusion',
        source: 'scene-objects',
        filter: ['==', ['get', 'kind'], 'building'],
        paint: {
          'fill-extrusion-color': '#8a6847',
          'fill-extrusion-height': ['get', 'heightM'],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.72,
        },
      });
      const roofMeshLayer = createBuildingRoofMeshLayer();
      buildingRoofMeshLayerRef.current = roofMeshLayer;
      map.addLayer(roofMeshLayer);
      map.addLayer({
        id: 'buildings-outline',
        type: 'line',
        source: 'scene-objects',
        filter: ['==', ['get', 'kind'], 'building'],
        paint: { 'line-color': '#4c321f', 'line-width': 2 },
      });
      map.addSource('tree-crowns', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addSource('tree-trunks', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'tree-trunks-extrusion',
        type: 'fill-extrusion',
        source: 'tree-trunks',
        paint: {
          'fill-extrusion-color': '#7a4b20',
          'fill-extrusion-height': ['get', 'heightM'],
          'fill-extrusion-base': 0,
          'fill-extrusion-opacity': 0.85,
        },
      });
      map.addLayer({
        id: 'tree-crowns-fill',
        type: 'fill',
        source: 'tree-crowns',
        paint: { 'fill-color': '#2f7d32', 'fill-opacity': 0.25 },
      });
      map.addLayer({
        id: 'tree-crowns-outline',
        type: 'line',
        source: 'tree-crowns',
        paint: { 'line-color': '#145a18', 'line-width': 1.5, 'line-dasharray': [3, 2] },
      });
      map.addLayer({
        id: 'tree-crowns-extrusion',
        type: 'fill-extrusion',
        source: 'tree-crowns',
        paint: {
          'fill-extrusion-color': '#2f7d32',
          'fill-extrusion-height': ['get', 'heightM'],
          'fill-extrusion-base': ['get', 'trunkHeightM'],
          'fill-extrusion-opacity': 0.38,
        },
      });
      map.addLayer({
        id: 'tree-crowns-selected',
        type: 'fill',
        source: 'tree-crowns',
        filter: ['==', ['get', 'id'], ''],
        paint: { 'fill-color': '#76c442', 'fill-opacity': 0.45 },
      });

      map.addLayer({
        id: 'trees-circle',
        type: 'circle',
        source: 'scene-objects',
        filter: ['==', ['get', 'kind'], 'tree'],
        paint: {
          'circle-radius': TREE_CENTER_MARKER_RADIUS,
          'circle-color': '#2f7d32',
          'circle-opacity': 0.9,
          'circle-stroke-color': '#145a18',
          'circle-stroke-width': 1.5,
        },
      });
      map.addLayer({
        id: 'scene-selected',
        type: 'line',
        source: 'scene-objects',
        filter: ['==', ['get', 'id'], ''],
        paint: { 'line-color': '#ff8c00', 'line-width': 3 },
      });

      map.on('click', 'pv-arrays-fill', (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) setSelectedPVArrayId(id);
      });
      for (const layer of ['buildings-fill', 'trees-circle', 'tree-crowns-fill']) {
        map.on('click', layer, (e) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (id) setSelectedSceneObjectId(id);
        });
        map.on('mouseenter', layer, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layer, () => {
          map.getCanvas().style.cursor = '';
        });
      }

      map.on('click', (e) => {
        const point = { lat: e.lngLat.lat, lon: e.lngLat.lng };
        if (!isInsideNetherlands(point)) return;
        const current = refs.current;
        if (current.activeTab === 'objecten' && current.objectMapAddKind) {
          const created = addSceneObject({ kind: current.objectMapAddKind, position: point });
          setSelectedSceneObjectId(created.id);
          return;
        }
        if (current.activeTab === 'locatie') {
          setLocation({ ...point, timezone: current.project.location.timezone });
        }
      });

      setMapLoaded(true);
    });

    return () => {
      locationMarkerRef.current?.remove();
      objectMarkerRef.current?.remove();
      moveMarkerRef.current?.remove();
      rotateHandleRef.current?.remove();
      azimuthMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
      buildingRoofMeshLayerRef.current = null;
    };
    // Intentionally initialise once; prop/state updates are synchronised below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    map.setLayoutProperty('osm', 'visibility', baseLayer === 'osm' ? 'visible' : 'none');
    map.setLayoutProperty('satellite', 'visibility', baseLayer === 'satellite' ? 'visible' : 'none');
  }, [baseLayer, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    (map.getSource('pv-arrays') as GeoJSONSource).setData(
      buildPVFeatureCollection(project.pv.arrays, project.pv.panelTypes) as unknown as Parameters<
        GeoJSONSource['setData']
      >[0],
    );
    (map.getSource('scene-objects') as GeoJSONSource).setData(
      buildSceneFeatureCollection(project.scene.objects) as unknown as Parameters<
        GeoJSONSource['setData']
      >[0],
    );
    buildingRoofMeshLayerRef.current?.setObjects(project.scene.objects);
    map.triggerRepaint();
    (map.getSource('tree-crowns') as GeoJSONSource).setData(
      buildTreeCrownFeatureCollection(project.scene.objects) as unknown as Parameters<
        GeoJSONSource['setData']
      >[0],
    );
    (map.getSource('tree-trunks') as GeoJSONSource).setData(
      buildTreeTrunkFeatureCollection(project.scene.objects) as unknown as Parameters<
        GeoJSONSource['setData']
      >[0],
    );
    const solar = calculateSolarPosition(new Date(simulationPreviewTimestamp), project.location);
    (map.getSource('shade-shadows') as GeoJSONSource).setData(
      buildShadowFeatureCollection(project.scene.objects, solar, { timestamp: simulationPreviewTimestamp }) as unknown as Parameters<
        GeoJSONSource['setData']
      >[0],
    );
  }, [
    project.location,
    project.pv.arrays,
    project.pv.panelTypes,
    project.scene.objects,
    simulationPreviewTimestamp,
    mapLoaded,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const pvFilter = ['==', ['get', 'id'], selectedPVArrayId ?? ''] as unknown as maplibregl.FilterSpecification;
    const sceneFilter = ['==', ['get', 'id'], selectedSceneObjectId ?? ''] as unknown as maplibregl.FilterSpecification;
    map.setFilter('pv-arrays-selected-fill', pvFilter);
    map.setFilter('scene-selected', sceneFilter);
    map.setFilter('tree-crowns-selected', sceneFilter);
  }, [selectedPVArrayId, selectedSceneObjectId, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const value = project.location;
    if (!locationMarkerRef.current) {
      locationMarkerRef.current = new Marker({ draggable: true, color: '#d62728' })
        .setLngLat([value.lon, value.lat])
        .addTo(map);
      locationMarkerRef.current.on('dragend', () => {
        const lngLat = locationMarkerRef.current?.getLngLat();
        if (!lngLat) return;
        const point = { lat: lngLat.lat, lon: lngLat.lng };
        if (!isInsideNetherlands(point)) {
          locationMarkerRef.current?.setLngLat([value.lon, value.lat]);
          return;
        }
        setLocation({ ...point, timezone: value.timezone });
      });
    } else {
      locationMarkerRef.current.setLngLat([value.lon, value.lat]);
    }
  }, [project.location, setLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const object = project.scene.objects.find((item) => item.id === selectedSceneObjectId) ?? null;
    if (previousObjectIdRef.current !== selectedSceneObjectId) {
      objectMarkerRef.current?.remove();
      objectMarkerRef.current = null;
      previousObjectIdRef.current = selectedSceneObjectId;
    }
    if (!object) {
      objectMarkerRef.current?.remove();
      objectMarkerRef.current = null;
      return;
    }
    if (!objectMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'object-move-handle';
      el.title = 'Sleep om het object te verplaatsen';
      const marker = new Marker({ element: el, anchor: 'center', draggable: true })
        .setLngLat([object.position.lon, object.position.lat])
        .addTo(map);
      marker.on('dragend', () => {
        const current = refs.current.project.scene.objects.find((item) => item.id === selectedSceneObjectId);
        const ll = marker.getLngLat();
        const position = { lat: ll.lat, lon: ll.lng };
        if (!current || !isInsideNetherlands(position)) return;
        updateSceneObject(current.id, {
          position,
          ...(current.kind === 'building'
            ? { footprint: translateFootprint(current, position), roofSurfaces: translateRoofSurfaces(current, position) }
            : {}),
        });
      });
      objectMarkerRef.current = marker;
      map.easeTo({ center: [object.position.lon, object.position.lat], duration: 300 });
    } else {
      objectMarkerRef.current.setLngLat([object.position.lon, object.position.lat]);
    }
  }, [project.scene.objects, selectedSceneObjectId, updateSceneObject, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const array = project.pv.arrays.find((item) => item.id === selectedPVArrayId) ?? null;
    const panelType = array
      ? (project.pv.panelTypes.find((item) => item.id === array.panelTypeId) ?? null)
      : null;
    if (previousArrayIdRef.current !== selectedPVArrayId) {
      moveMarkerRef.current?.remove();
      rotateHandleRef.current?.remove();
      azimuthMarkerRef.current?.remove();
      moveMarkerRef.current = null;
      rotateHandleRef.current = null;
      azimuthMarkerRef.current = null;
      previousArrayIdRef.current = selectedPVArrayId;
    }
    if (!array || !panelType) {
      moveMarkerRef.current?.remove();
      rotateHandleRef.current?.remove();
      azimuthMarkerRef.current?.remove();
      moveMarkerRef.current = null;
      rotateHandleRef.current = null;
      azimuthMarkerRef.current = null;
      return;
    }
    const center = array.position;
    const { depthM } = getArrayDimensions(array, panelType);
    const rotatePosition = offsetPoint(center, array.azimuthDeg, depthM / 2 + ROTATE_HANDLE_OFFSET_M);
    if (!moveMarkerRef.current) {
      const moveEl = document.createElement('div');
      moveEl.className = 'move-handle';
      const moveMarker = new Marker({ element: moveEl, anchor: 'center', draggable: true })
        .setLngLat([center.lon, center.lat])
        .addTo(map);
      moveMarker.on('dragend', () => {
        const ll = moveMarker.getLngLat();
        updatePVArray(array.id, { position: { lat: ll.lat, lon: ll.lng } });
      });
      moveMarkerRef.current = moveMarker;
    } else {
      moveMarkerRef.current.setLngLat([center.lon, center.lat]);
    }
    if (!rotateHandleRef.current) {
      const rotEl = document.createElement('div');
      rotEl.className = 'rotate-handle';
      const rotateMarker = new Marker({ element: rotEl, anchor: 'center', draggable: true })
        .setLngLat([rotatePosition.lon, rotatePosition.lat])
        .addTo(map);
      rotateMarker.on('dragend', () => {
        const ll = rotateMarker.getLngLat();
        updatePVArray(array.id, { azimuthDeg: Math.round(bearing(array.position, { lat: ll.lat, lon: ll.lng })) });
      });
      rotateHandleRef.current = rotateMarker;
    } else {
      rotateHandleRef.current.setLngLat([rotatePosition.lon, rotatePosition.lat]);
    }
    if (!azimuthMarkerRef.current) {
      const azOuter = document.createElement('div');
      azOuter.className = 'azimuth-arrow-marker';
      azOuter.setAttribute('aria-hidden', 'true');
      const azInner = document.createElement('div');
      azInner.style.transformOrigin = '50% 100%';
      azInner.innerHTML = ARROW_SVG;
      azOuter.appendChild(azInner);
      azimuthMarkerRef.current = new Marker({ element: azOuter, anchor: 'bottom' })
        .setLngLat([center.lon, center.lat])
        .addTo(map);
    } else {
      azimuthMarkerRef.current.setLngLat([center.lon, center.lat]);
    }
    const inner = azimuthMarkerRef.current.getElement().firstElementChild as HTMLElement | null;
    if (inner) inner.style.transform = `rotate(${array.azimuthDeg}deg)`;
  }, [project.pv.arrays, project.pv.panelTypes, selectedPVArrayId, updatePVArray, mapLoaded]);

  return (
    <div className="project-map-wrap">
      <div className="map-toolbar" aria-label="Kaartweergave">
        <button
          type="button"
          aria-pressed={baseLayer === 'osm'}
          onClick={() => setBaseLayer('osm')}
        >
          Kaart
        </button>
        <button
          type="button"
          aria-pressed={baseLayer === 'satellite'}
          onClick={() => setBaseLayer('satellite')}
        >
          Satelliet
        </button>
      </div>
      {activeTab === 'objecten' && objectMapAddKind && (
        <div className="map-mode-banner" role="status">
          Klik op de kaart om een {sceneObjectKindLabel(objectMapAddKind).toLowerCase()} te plaatsen.
        </div>
      )}
      <div
        ref={containerRef}
        className="project-map"
        data-testid="project-map"
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}
