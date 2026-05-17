import type { PanelType, PVArray, SceneObject } from '../model/schema';
import { arrayFootprintRing, offsetPoint } from '../map/pvArrayGeometry';
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
    part?: 'building' | 'crown' | 'undergrowth';
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

const MAX_SHADOW_LEN_M = 500;
const MAX_SHADOW_AXIS_M = 400;
const FOLIAGE_BY_MONTH = [0.25, 0.25, 0.25, 0.55, 1, 1, 1, 1, 1, 0.7, 0.3, 0.3] as const;

function shadowLengthM(heightM: number, solar: SolarPosition): number {
  if (solar.elevationDeg <= 0) return 0;
  return Math.min(MAX_SHADOW_LEN_M, heightM / Math.tan((solar.elevationDeg * Math.PI) / 180));
}

function shiftRing(ring: [number, number][], bearingDeg: number, distanceM: number): [number, number][] {
  return ring.map(([lon, lat]) => {
    const shifted = offsetPoint({ lat, lon }, bearingDeg, distanceM);
    return [shifted.lon, shifted.lat];
  });
}

function closeRing(ring: [number, number][]): [number, number][] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last) return ring;
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, first];
}

function convexHull(points: [number, number][]): [number, number][] {
  const sorted = [...points]
    .filter(([lon, lat], index, all) => all.findIndex(([x, y]) => x === lon && y === lat) === index)
    .sort(([lonA, latA], [lonB, latB]) => lonA - lonB || latA - latB);
  if (sorted.length <= 3) return closeRing(sorted);

  const cross = (origin: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - origin[0]) * (b[1] - origin[1]) - (a[1] - origin[1]) * (b[0] - origin[0]);

  const lower: [number, number][] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: [number, number][] = [];
  for (const point of sorted.slice().reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
      upper.pop();
    }
    upper.push(point);
  }

  return closeRing([...lower.slice(0, -1), ...upper.slice(0, -1)]);
}

function pointFromEnu(origin: { lat: number; lon: number }, eastM: number, northM: number): [number, number] {
  const northShifted = offsetPoint(origin, northM >= 0 ? 0 : 180, Math.abs(northM));
  const shifted = offsetPoint(northShifted, eastM >= 0 ? 90 : 270, Math.abs(eastM));
  return [shifted.lon, shifted.lat];
}

function treeOpacity(density: number): number {
  return Math.max(0.15, Math.min(0.75, density * 0.65));
}

function foliageFactor(object: Extract<SceneObject, { kind: 'tree' }>, date: Date): number {
  return object.deciduous ? FOLIAGE_BY_MONTH[date.getMonth()] : 1;
}

function undergrowthOpacity(object: Extract<SceneObject, { kind: 'tree' }>): number {
  if (object.undergrowth === 'none') return 0;
  const factor = object.undergrowth === 'grass' ? 0.5 : object.undergrowth === 'shrubs' ? 0.8 : 1;
  return treeOpacity(object.density) * factor;
}

function shadowFromRing(
  object: Extract<SceneObject, { kind: 'building' }>,
  ringSource: [number, number][],
  heightM: number,
  solar: SolarPosition,
  idSuffix = '',
): ShadePreviewFeature | null {
  const lengthM = shadowLengthM(heightM, solar);
  if (lengthM <= 0) return null;
  const shadowBearing = (solar.azimuthDeg + 180) % 360;
  const footprint = closeRing(ringSource);
  const shifted = shiftRing(footprint, shadowBearing, lengthM);
  const ring = convexHull([...footprint, ...shifted]);
  return {
    type: 'Feature',
    id: `shadow_${object.id}${idSuffix}`,
    properties: { id: `shadow_${object.id}${idSuffix}`, objectId: object.id, kind: object.kind, part: 'building', opacity: 0.55 },
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
}

function buildingShadows(object: Extract<SceneObject, { kind: 'building' }>, solar: SolarPosition): ShadePreviewFeature[] {
  if (!object.roofSurfaces?.length) {
    return [shadowFromRing(object, object.footprint, object.heightM, solar)].filter(
      (feature): feature is ShadePreviewFeature => feature !== null,
    );
  }
  return object.roofSurfaces
    .map((surface, index) => shadowFromRing(object, surface.footprint, surface.heightM, solar, `_roof_${index}`))
    .filter((feature): feature is ShadePreviewFeature => feature !== null);
}

function treeCrownShadow(
  object: Extract<SceneObject, { kind: 'tree' }>,
  solar: SolarPosition,
  date: Date,
): ShadePreviewFeature | null {
  const lengthM = shadowLengthM(object.heightM, solar);
  if (lengthM <= 0) return null;
  const azimuthRad = (solar.azimuthDeg * Math.PI) / 180;
  const elevationRad = (solar.elevationDeg * Math.PI) / 180;
  const sinElevation = Math.sin(elevationRad);
  const radiusM = object.crownRadiusM * foliageFactor(object, date);
  if (radiusM <= 0 || sinElevation <= 0) return null;

  const ux = -Math.sin(azimuthRad);
  const uy = -Math.cos(azimuthRad);
  const vx = -uy;
  const vy = ux;
  const majorAxisM = Math.min(radiusM / sinElevation, MAX_SHADOW_AXIS_M);
  const minorAxisM = radiusM;
  const centerEastM = lengthM * ux;
  const centerNorthM = lengthM * uy;

  const ring: [number, number][] = [];
  for (let i = 0; i <= 32; i++) {
    const theta = (2 * Math.PI * i) / 32;
    const eastM = centerEastM + majorAxisM * Math.cos(theta) * ux + minorAxisM * Math.sin(theta) * vx;
    const northM = centerNorthM + majorAxisM * Math.cos(theta) * uy + minorAxisM * Math.sin(theta) * vy;
    ring.push(pointFromEnu(object.position, eastM, northM));
  }

  return {
    type: 'Feature',
    id: `shadow_${object.id}_crown`,
    properties: {
      id: `shadow_${object.id}_crown`,
      objectId: object.id,
      kind: object.kind,
      part: 'crown',
      opacity: treeOpacity(object.density),
    },
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
}

function treeUndergrowthShadow(
  object: Extract<SceneObject, { kind: 'tree' }>,
  solar: SolarPosition,
  date: Date,
): ShadePreviewFeature | null {
  const opacity = undergrowthOpacity(object);
  if (opacity <= 0 || solar.elevationDeg <= 0) return null;
  const tanElevation = Math.tan((solar.elevationDeg * Math.PI) / 180);
  if (tanElevation < 0.01) return null;

  const azimuthRad = (solar.azimuthDeg * Math.PI) / 180;
  const ux = -Math.sin(azimuthRad);
  const uy = -Math.cos(azimuthRad);
  const vx = -uy;
  const vy = ux;
  const radiusM = object.crownRadiusM * foliageFactor(object, date);
  const lengthM = Math.min((object.heightM / 2) / tanElevation, MAX_SHADOW_LEN_M);
  if (radiusM <= 0 || lengthM <= 0) return null;

  const nearEastM = 0;
  const nearNorthM = 0;
  const farEastM = lengthM * ux;
  const farNorthM = lengthM * uy;
  const ring: [number, number][] = [];
  const capSteps = 12;

  for (let i = 0; i <= capSteps; i++) {
    const angle = (i / capSteps) * Math.PI;
    ring.push(
      pointFromEnu(
        object.position,
        farEastM + radiusM * Math.cos(angle) * vx + radiusM * Math.sin(angle) * ux,
        farNorthM + radiusM * Math.cos(angle) * vy + radiusM * Math.sin(angle) * uy,
      ),
    );
  }
  for (let i = 0; i <= capSteps; i++) {
    const angle = Math.PI + (i / capSteps) * Math.PI;
    ring.push(
      pointFromEnu(
        object.position,
        nearEastM + radiusM * Math.cos(angle) * vx + radiusM * Math.sin(angle) * ux,
        nearNorthM + radiusM * Math.cos(angle) * vy + radiusM * Math.sin(angle) * uy,
      ),
    );
  }

  return {
    type: 'Feature',
    id: `shadow_${object.id}_undergrowth`,
    properties: {
      id: `shadow_${object.id}_undergrowth`,
      objectId: object.id,
      kind: object.kind,
      part: 'undergrowth',
      opacity,
    },
    geometry: { type: 'Polygon', coordinates: [closeRing(ring)] },
  };
}

export interface BuildShadowFeatureOptions {
  timestamp?: Date | string;
}

export function buildShadowFeatureCollection(
  objects: SceneObject[],
  solar: SolarPosition,
  options: BuildShadowFeatureOptions = {},
): ShadePreviewFeatureCollection {
  const date = options.timestamp instanceof Date ? options.timestamp : new Date(options.timestamp ?? Date.now());
  return {
    type: 'FeatureCollection',
    features: objects.flatMap((object) => {
      if (object.kind === 'building') return buildingShadows(object, solar);
      if (object.kind === 'tree') {
        return [treeCrownShadow(object, solar, date), treeUndergrowthShadow(object, solar, date)].filter(
          (feature): feature is ShadePreviewFeature => feature !== null,
        );
      }
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
