import type { BuildingObject, LatLon } from '../model/schema';

const THREE_D_BAG_ITEMS_URL = 'https://api.3dbag.nl/collections/pand/items';
const DEFAULT_RADIUS_M = 65;
const DEFAULT_LIMIT = 40;
const MIN_HEIGHT_M = 2;
const FALLBACK_HEIGHT_M = 6;
const MAX_HEIGHT_M = 80;

type ImportedBuilding = Pick<BuildingObject, 'kind' | 'name' | 'position' | 'footprint' | 'heightM'>;

type JsonRecord = Record<string, unknown>;

interface FetchBuildingsOptions {
  radiusM?: number;
  limit?: number;
  fetchImpl?: typeof fetch;
}

export function buildThreeDBagItemsUrl(location: LatLon, radiusM = DEFAULT_RADIUS_M, limit = DEFAULT_LIMIT): string {
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.cos((location.lat * Math.PI) / 180));
  const url = new URL(THREE_D_BAG_ITEMS_URL);
  url.searchParams.set('bbox', [location.lon - dLon, location.lat - dLat, location.lon + dLon, location.lat + dLat].join(','));
  url.searchParams.set('limit', String(limit));
  return url.toString();
}

export async function fetchDutchBuildingObjects(
  location: LatLon,
  options: FetchBuildingsOptions = {},
): Promise<ImportedBuilding[]> {
  const url = buildThreeDBagItemsUrl(location, options.radiusM, options.limit);
  const response = await (options.fetchImpl ?? fetch)(url, {
    headers: { Accept: 'application/json, application/geo+json' },
  });
  if (!response.ok) {
    throw new Error(`3D BAG gebouwen ophalen mislukt (${response.status})`);
  }
  return parseDutchBuildingResponse(await response.json());
}

export function parseDutchBuildingResponse(data: unknown): ImportedBuilding[] {
  const features = collectFeatures(data);
  return features.flatMap((feature, index) => {
    const footprint = extractFootprint(feature);
    if (!footprint) return [];
    const position = centroid(footprint);
    const heightM = extractHeightM(feature);
    return [
      {
        kind: 'building' as const,
        name: extractName(feature, index),
        position,
        footprint,
        heightM,
      },
    ];
  });
}

function collectFeatures(data: unknown): JsonRecord[] {
  const record = asRecord(data);
  if (!record) return [];
  if (Array.isArray(record.features)) {
    return record.features.flatMap((item) => {
      const feature = asRecord(item);
      return feature ? [feature] : [];
    });
  }
  if (record.type === 'CityJSONFeature' || record.type === 'Feature') return [record];
  return [];
}

function extractFootprint(feature: JsonRecord): [number, number][] | null {
  const geoJsonFootprint = extractGeoJsonFootprint(asRecord(feature.geometry));
  if (geoJsonFootprint) return geoJsonFootprint;
  return extractCityJsonFootprint(feature);
}

function extractGeoJsonFootprint(geometry: JsonRecord | null): [number, number][] | null {
  if (!geometry) return null;
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    return normalizeRing(geometry.coordinates[0]);
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    const rings = geometry.coordinates.flatMap((polygon) => {
      if (!Array.isArray(polygon)) return [];
      const ring = normalizeRing(polygon[0]);
      return ring ? [ring] : [];
    });
    return largestRing(rings);
  }
  return null;
}

function extractCityJsonFootprint(feature: JsonRecord): [number, number][] | null {
  if (!Array.isArray(feature.vertices)) return null;
  const transform = asRecord(feature.transform);
  const scale = readNumberPair(transform?.scale, [1, 1]);
  const translate = readNumberPair(transform?.translate, [0, 0]);
  const vertices = feature.vertices.flatMap((raw) => {
    if (!Array.isArray(raw)) return [];
    const lon = readNumber(raw[0]);
    const lat = readNumber(raw[1]);
    if (lon === null || lat === null) return [];
    return [[lon * scale[0] + translate[0], lat * scale[1] + translate[1]] as [number, number]];
  });
  if (!vertices.every(isDutchLonLat)) return null;

  const cityObjects = asRecord(feature.CityObjects);
  const boundaries = cityObjects
    ? Object.values(cityObjects).flatMap((object) => {
        const geometries = asRecord(object)?.geometry;
        if (!Array.isArray(geometries)) return [];
        return geometries.flatMap((geometry) => asRecord(geometry)?.boundaries ?? []);
      })
    : [];
  const indices = new Set<number>();
  for (const boundary of boundaries) collectVertexIndices(boundary, indices);
  const points = [...indices].flatMap((index) => {
    const point = vertices[index];
    return point ? [point] : [];
  });
  return convexHull(points.length >= 3 ? points : vertices);
}

function collectVertexIndices(value: unknown, indices: Set<number>): void {
  if (typeof value === 'number' && Number.isInteger(value)) {
    indices.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectVertexIndices(item, indices);
  }
}

function normalizeRing(rawRing: unknown): [number, number][] | null {
  if (!Array.isArray(rawRing)) return null;
  const ring = rawRing.flatMap((raw) => {
    if (!Array.isArray(raw)) return [];
    const lon = readNumber(raw[0]);
    const lat = readNumber(raw[1]);
    if (lon === null || lat === null) return [];
    const point: [number, number] = [lon, lat];
    return isDutchLonLat(point) ? [point] : [];
  });
  const openRing =
    ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring;
  return openRing.length >= 3 ? openRing : null;
}

function extractHeightM(feature: JsonRecord): number {
  const properties = asRecord(feature.properties) ?? feature;
  const roof =
    readFirstNumber(properties, ['b3_h_dak_50p', 'b3_h_dak_70p', 'roof_height', 'roofHeightM']) ??
    readFirstNumber(feature, ['b3_h_dak_50p', 'b3_h_dak_70p']);
  const ground =
    readFirstNumber(properties, ['b3_h_maaiveld', 'ground_height', 'groundHeightM']) ??
    readFirstNumber(feature, ['b3_h_maaiveld']);
  const absoluteHeight = roof !== null && ground !== null ? roof - ground : null;
  const directHeight =
    absoluteHeight ??
    readFirstNumber(properties, ['height', 'heightM', 'gebouwhoogte', 'measuredHeight']) ??
    readFirstNumber(feature, ['height', 'heightM']);
  if (directHeight === null || directHeight < MIN_HEIGHT_M) return FALLBACK_HEIGHT_M;
  return Math.min(MAX_HEIGHT_M, Number(directHeight.toFixed(1)));
}

function extractName(feature: JsonRecord, index: number): string {
  const properties = asRecord(feature.properties);
  const id = readFirstString(properties ?? feature, ['identificatie', 'id', 'pand_id']) ?? readFirstString(feature, ['id']);
  return id ? `3D BAG ${id}` : `3D BAG gebouw ${index + 1}`;
}

function centroid(ring: [number, number][]): LatLon {
  const total = ring.reduce(
    (acc, [lon, lat]) => ({ lon: acc.lon + lon, lat: acc.lat + lat }),
    { lat: 0, lon: 0 },
  );
  return { lat: total.lat / ring.length, lon: total.lon / ring.length };
}

function largestRing(rings: [number, number][][]): [number, number][] | null {
  return rings.reduce<[number, number][] | null>((best, ring) => {
    if (!best) return ring;
    return Math.abs(polygonArea(ring)) > Math.abs(polygonArea(best)) ? ring : best;
  }, null);
}

function polygonArea(ring: [number, number][]): number {
  let area = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function convexHull(points: [number, number][]): [number, number][] | null {
  const unique = [...new Map(points.map((point) => [point.join(','), point])).values()].sort(
    ([ax, ay], [bx, by]) => ax - bx || ay - by,
  );
  if (unique.length < 3) return null;
  const lower: [number, number][] = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: [number, number][] = [];
  for (const point of [...unique].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  return hull.length >= 3 ? hull : null;
}

function cross(a: [number, number], b: [number, number], c: [number, number]): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function isDutchLonLat([lon, lat]: [number, number]): boolean {
  return lon >= 3.1 && lon <= 7.4 && lat >= 50.4 && lat <= 53.8;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readNumberPair(value: unknown, fallback: [number, number]): [number, number] {
  if (!Array.isArray(value)) return fallback;
  return [readNumber(value[0]) ?? fallback[0], readNumber(value[1]) ?? fallback[1]];
}

function readFirstNumber(record: JsonRecord, keys: string[]): number | null {
  for (const key of keys) {
    const value = readNumber(record[key]);
    if (value !== null) return value;
  }
  return null;
}

function readFirstString(record: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}
