import type { BuildingObject, LatLon } from '../model/schema';

const THREE_D_BAG_ITEMS_URL = 'https://api.3dbag.nl/collections/pand/items';
const PDOK_BAG_WFS_URL = 'https://geodata.nationaalgeoregister.nl/bag/wfs/v1_1';
const OPENSTREETMAP_OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
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

export function buildPdokBagWfsUrl(location: LatLon, radiusM = DEFAULT_RADIUS_M, limit = DEFAULT_LIMIT): string {
  const center = wgs84ToRd(location);
  const url = new URL(PDOK_BAG_WFS_URL);
  url.searchParams.set('service', 'WFS');
  url.searchParams.set('version', '1.1.0');
  url.searchParams.set('request', 'GetFeature');
  url.searchParams.set('typeName', 'bag:pand');
  url.searchParams.set('outputFormat', 'application/json');
  url.searchParams.set(
    'bbox',
    [
      center.x - radiusM,
      center.y - radiusM,
      center.x + radiusM,
      center.y + radiusM,
      'urn:ogc:def:crs:EPSG::28992',
    ].join(','),
  );
  url.searchParams.set('maxFeatures', String(limit));
  return url.toString();
}

export function buildOpenStreetMapOverpassUrl(
  location: LatLon,
  radiusM = DEFAULT_RADIUS_M,
  limit = DEFAULT_LIMIT,
): string {
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.cos((location.lat * Math.PI) / 180));
  const south = location.lat - dLat;
  const west = location.lon - dLon;
  const north = location.lat + dLat;
  const east = location.lon + dLon;
  const url = new URL(OPENSTREETMAP_OVERPASS_URL);
  url.searchParams.set(
    'data',
    `[out:json][timeout:25];(way["building"](${south},${west},${north},${east}););out geom qt ${limit};`,
  );
  return url.toString();
}

export async function fetchDutchBuildingObjects(
  location: LatLon,
  options: FetchBuildingsOptions = {},
): Promise<ImportedBuilding[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const errors: string[] = [];
  try {
    const data = await fetchJson(buildThreeDBagItemsUrl(location, options.radiusM, options.limit), fetchImpl, '3D BAG');
    return parseDutchBuildingResponse(data);
  } catch (primaryError) {
    errors.push(`3D BAG: ${messageOf(primaryError)}`);
    try {
      const data = await fetchJson(buildPdokBagWfsUrl(location, options.radiusM, options.limit), fetchImpl, 'PDOK BAG');
      return parsePdokBagResponse(data);
    } catch (fallbackError) {
      errors.push(`PDOK BAG: ${messageOf(fallbackError)}`);
      try {
        const data = await fetchJson(
          buildOpenStreetMapOverpassUrl(location, options.radiusM, options.limit),
          fetchImpl,
          'OpenStreetMap',
        );
        return parseOpenStreetMapBuildingsResponse(data);
      } catch (openStreetMapError) {
        errors.push(`OpenStreetMap: ${messageOf(openStreetMapError)}`);
        throw new Error(`Gebouwen ophalen mislukt via 3D BAG, PDOK BAG en OpenStreetMap. ${errors.join('. ')}`);
      }
    }
  }
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

export function parsePdokBagResponse(data: unknown): ImportedBuilding[] {
  return parseDutchBuildingResponse(data).map((building) => ({
    ...building,
    name: building.name.replace(/^3D BAG/, 'BAG'),
  }));
}

export function parseOpenStreetMapBuildingsResponse(data: unknown): ImportedBuilding[] {
  const record = asRecord(data);
  if (!record || !Array.isArray(record.elements)) return [];
  return record.elements.flatMap((element, index) => {
    const way = asRecord(element);
    if (!way || way.type !== 'way' || !Array.isArray(way.geometry)) return [];
    const footprint = normalizeRing(
      way.geometry.map((point) => {
        const recordPoint = asRecord(point);
        return [recordPoint?.lon, recordPoint?.lat];
      }),
    );
    if (!footprint) return [];
    const tags = asRecord(way.tags);
    return [
      {
        kind: 'building' as const,
        name: extractOpenStreetMapName(way, tags, index),
        position: centroid(footprint),
        footprint,
        heightM: extractOpenStreetMapHeightM(tags),
      },
    ];
  });
}

async function fetchJson(url: string, fetchImpl: typeof fetch, label: string): Promise<unknown> {
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json, application/geo+json' },
  });
  if (!response.ok) throw new Error(`${label} gaf HTTP ${response.status}`);
  return response.json();
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
    const point = normalizeCoordinate(raw[0], raw[1]);
    return point ? [point] : [];
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

function extractOpenStreetMapName(way: JsonRecord, tags: JsonRecord | null, index: number): string {
  const label = readFirstString(tags ?? {}, ['name', 'ref']) ?? String(readNumber(way.id) ?? '');
  return label ? `OpenStreetMap ${label}` : `OpenStreetMap gebouw ${index + 1}`;
}

function extractOpenStreetMapHeightM(tags: JsonRecord | null): number {
  if (!tags) return FALLBACK_HEIGHT_M;
  const height = readDistanceMeters(tags.height) ?? readDistanceMeters(tags['building:height']);
  if (height !== null) return clampHeight(height);
  const levels = readNumberLike(tags['building:levels'] ?? tags.levels);
  if (levels !== null) return clampHeight(levels * 3);
  return FALLBACK_HEIGHT_M;
}

function normalizeCoordinate(xRaw: unknown, yRaw: unknown): [number, number] | null {
  const x = readNumber(xRaw);
  const y = readNumber(yRaw);
  if (x === null || y === null) return null;
  if (isDutchLonLat([x, y])) return [x, y];
  if (isRdCoordinate(x, y)) {
    const { lat, lon } = rdToWgs84(x, y);
    return [lon, lat];
  }
  return null;
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

function isRdCoordinate(x: number, y: number): boolean {
  return x >= 0 && x <= 300_000 && y >= 300_000 && y <= 625_000;
}

function wgs84ToRd(location: LatLon): { x: number; y: number } {
  const dLat = 0.36 * (location.lat - 52.1551744);
  const dLon = 0.36 * (location.lon - 5.38720621);
  const x =
    155_000 +
    [
      [0, 1, 190_094.945],
      [1, 1, -11_832.228],
      [2, 1, -114.221],
      [0, 3, -32.391],
      [1, 0, -0.705],
      [3, 1, -2.34],
      [1, 3, -0.608],
      [0, 2, -0.008],
      [2, 3, 0.148],
    ].reduce((sum, [p, q, k]) => sum + k * dLat ** p * dLon ** q, 0);
  const y =
    463_000 +
    [
      [1, 0, 309_056.544],
      [0, 2, 3_638.893],
      [2, 0, 73.077],
      [1, 2, -157.984],
      [3, 0, 59.788],
      [0, 1, 0.433],
      [2, 2, -6.439],
      [1, 1, -0.032],
      [0, 4, 0.092],
      [1, 4, -0.054],
    ].reduce((sum, [p, q, k]) => sum + k * dLat ** p * dLon ** q, 0);
  return { x, y };
}

function rdToWgs84(x: number, y: number): LatLon {
  const dX = (x - 155_000) * 1e-5;
  const dY = (y - 463_000) * 1e-5;
  const lat =
    52.1551744 +
    [
      [0, 1, 3_235.65389],
      [2, 0, -32.58297],
      [0, 2, -0.2475],
      [2, 1, -0.84978],
      [0, 3, -0.0655],
      [2, 2, -0.01709],
      [1, 0, -0.00738],
      [4, 0, 0.0053],
      [2, 3, -0.00039],
      [4, 1, 0.00033],
      [1, 1, -0.00012],
    ].reduce((sum, [p, q, k]) => sum + k * dX ** p * dY ** q, 0) /
      3600;
  const lon =
    5.38720621 +
    [
      [1, 0, 5_260.52916],
      [1, 1, 105.94684],
      [1, 2, 2.45656],
      [3, 0, -0.81885],
      [1, 3, 0.05594],
      [3, 1, -0.05607],
      [0, 1, 0.01199],
      [3, 2, -0.00256],
      [1, 4, 0.00128],
      [0, 2, 0.00022],
      [2, 0, -0.00022],
      [5, 0, 0.00026],
    ].reduce((sum, [p, q, k]) => sum + k * dX ** p * dY ** q, 0) /
      3600;
  return { lat, lon };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readNumberLike(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(',', '.');
  if (!normalized) return null;
  const match = normalized.match(/^-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function readDistanceMeters(value: unknown): number | null {
  const distance = readNumberLike(value);
  if (distance === null) return null;
  if (typeof value === 'string' && /\bft\b|'/i.test(value)) return distance * 0.3048;
  return distance;
}

function clampHeight(heightM: number): number {
  if (heightM < MIN_HEIGHT_M) return FALLBACK_HEIGHT_M;
  return Math.min(MAX_HEIGHT_M, Number(heightM.toFixed(1)));
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
