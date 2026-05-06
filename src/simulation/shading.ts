import type { PanelType, PVArray, SceneObject } from '../model/schema';
import { arrayFootprintRing, METERS_PER_DEG_LAT, offsetPoint } from '../map/pvArrayGeometry';
import type { SolarPosition } from './solarPosition';

export interface ShadePreviewFeatureCollection {
  type: 'FeatureCollection';
  features: ShadePreviewFeature[];
}

export interface ShadePreviewFeature {
  type: 'Feature';
  id: string;
  properties: {
    id: string;
    objectId: string;
    kind: SceneObject['kind'];
    opacity: number;
  };
  geometry: {
    type: 'Polygon';
    coordinates: [[number, number][]];
  };
}

export interface ArrayShadeResult {
  arrayId: string;
  shadeFactor: number;
}

function circleRing(lat: number, lon: number, radiusM: number, steps = 32): [number, number][] {
  const dLat = radiusM / METERS_PER_DEG_LAT;
  const dLon = radiusM / (METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (2 * Math.PI * i) / steps;
    ring.push([lon + dLon * Math.cos(angle), lat + dLat * Math.sin(angle)]);
  }
  return ring;
}

function shadowLengthM(heightM: number, solar: SolarPosition): number {
  if (solar.elevationDeg <= 0) return 0;
  return Math.min(250, heightM / Math.tan((solar.elevationDeg * Math.PI) / 180));
}

function shiftRing(ring: [number, number][], bearingDeg: number, distanceM: number): [number, number][] {
  return ring.map(([lon, lat]) => {
    const shifted = offsetPoint({ lat, lon }, bearingDeg, distanceM);
    return [shifted.lon, shifted.lat];
  });
}

function buildingShadow(object: Extract<SceneObject, { kind: 'building' }>, solar: SolarPosition): ShadePreviewFeature | null {
  const lengthM = shadowLengthM(object.heightM, solar);
  if (lengthM <= 0) return null;
  const shadowBearing = (solar.azimuthDeg + 180) % 360;
  const footprint = [...object.footprint, object.footprint[0]];
  const shifted = shiftRing(footprint, shadowBearing, lengthM);
  const ring = [...footprint, ...shifted.slice().reverse(), footprint[0]];
  return {
    type: 'Feature',
    id: `shadow_${object.id}`,
    properties: { id: `shadow_${object.id}`, objectId: object.id, kind: object.kind, opacity: 0.55 },
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
}

function treeShadow(object: Extract<SceneObject, { kind: 'tree' }>, solar: SolarPosition): ShadePreviewFeature | null {
  const lengthM = shadowLengthM(object.heightM, solar);
  if (lengthM <= 0) return null;
  const shadowBearing = (solar.azimuthDeg + 180) % 360;
  const baseRing = circleRing(object.position.lat, object.position.lon, object.crownRadiusM, 24);
  const shiftedRing = shiftRing(baseRing, shadowBearing, lengthM);
  const ring = [...baseRing, ...shiftedRing.slice().reverse(), baseRing[0]];
  return {
    type: 'Feature',
    id: `shadow_${object.id}`,
    properties: {
      id: `shadow_${object.id}`,
      objectId: object.id,
      kind: object.kind,
      opacity: Math.max(0.15, Math.min(0.75, object.density * 0.65)),
    },
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
}

export function buildShadowFeatureCollection(
  objects: SceneObject[],
  solar: SolarPosition,
): ShadePreviewFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: objects.flatMap((object) => {
      if (object.kind === 'building') return buildingShadow(object, solar) ?? [];
      if (object.kind === 'tree') return treeShadow(object, solar) ?? [];
      return [];
    }),
  };
}

function pointInRing(point: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function estimateArrayShadeFactors(
  arrays: PVArray[],
  panelTypes: PanelType[],
  shadows: ShadePreviewFeatureCollection,
): ArrayShadeResult[] {
  const panelTypeById = new Map(panelTypes.map((panelType) => [panelType.id, panelType]));
  return arrays.map((array) => {
    const panelType = panelTypeById.get(array.panelTypeId);
    const testPoints: [number, number][] = panelType
      ? arrayFootprintRing(array, panelType).slice(0, 4)
      : [[array.position.lon, array.position.lat]];
    testPoints.push([array.position.lon, array.position.lat]);
    const shadeFactor = shadows.features.reduce((max, feature) => {
      const ring = feature.geometry.coordinates[0];
      const shaded = testPoints.some((point) => pointInRing(point, ring));
      return shaded ? Math.max(max, feature.properties.opacity) : max;
    }, 0);
    return { arrayId: array.id, shadeFactor };
  });
}
