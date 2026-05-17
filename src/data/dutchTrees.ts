import type { LatLon, TreeObject } from '../model/schema';

const OPENSTREETMAP_OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const DEFAULT_RADIUS_M = 65;
const DEFAULT_LIMIT = 80;
const FALLBACK_TREE_HEIGHT_M = 8;
const FALLBACK_CROWN_RADIUS_M = 3;

type ImportedTree = Pick<
  TreeObject,
  'kind' | 'name' | 'position' | 'heightM' | 'crownRadiusM' | 'trunkHeightM' | 'density' | 'undergrowth' | 'deciduous'
>;

type JsonRecord = Record<string, unknown>;

interface FetchTreesOptions {
  radiusM?: number;
  limit?: number;
  fetchImpl?: typeof fetch;
}

export function buildOpenStreetMapTreesOverpassUrl(
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
    `[out:json][timeout:25];(node["natural"="tree"](${south},${west},${north},${east});way["natural"="tree"](${south},${west},${north},${east}););out geom qt ${limit};`,
  );
  return url.toString();
}

export async function fetchDutchTreeObjects(
  location: LatLon,
  options: FetchTreesOptions = {},
): Promise<ImportedTree[]> {
  const response = await (options.fetchImpl ?? fetch)(buildOpenStreetMapTreesOverpassUrl(location, options.radiusM, options.limit), {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`OpenStreetMap bomen gaf HTTP ${response.status}`);
  return parseOpenStreetMapTreesResponse(await response.json());
}

export function parseOpenStreetMapTreesResponse(data: unknown): ImportedTree[] {
  const record = asRecord(data);
  if (!record || !Array.isArray(record.elements)) return [];
  return record.elements.flatMap((element, index) => {
    const item = asRecord(element);
    if (!item) return [];
    const tags = asRecord(item.tags);
    const position = readTreePosition(item);
    if (!position) return [];
    const heightM = clampPositive(readDistanceMeters(tags?.height) ?? FALLBACK_TREE_HEIGHT_M, FALLBACK_TREE_HEIGHT_M);
    const crownRadiusM = clampPositive(
      readDistanceMeters(tags?.['diameter_crown']) !== null
        ? (readDistanceMeters(tags?.['diameter_crown']) ?? FALLBACK_CROWN_RADIUS_M * 2) / 2
        : (readDistanceMeters(tags?.['crown:radius']) ?? FALLBACK_CROWN_RADIUS_M),
      FALLBACK_CROWN_RADIUS_M,
    );
    return [
      {
        kind: 'tree' as const,
        name: extractTreeName(item, tags, index),
        position,
        heightM,
        crownRadiusM,
        trunkHeightM: Math.min(heightM * 0.35, Math.max(1.5, heightM - crownRadiusM * 2)),
        density: 0.7,
        undergrowth: 'grass' as const,
        deciduous: true,
      },
    ];
  });
}

function readTreePosition(item: JsonRecord): LatLon | null {
  const lat = readNumber(item.lat);
  const lon = readNumber(item.lon);
  if (lat !== null && lon !== null) return { lat, lon };
  if (!Array.isArray(item.geometry)) return null;
  const points = item.geometry.flatMap((point) => {
    const record = asRecord(point);
    const pointLat = readNumber(record?.lat);
    const pointLon = readNumber(record?.lon);
    return pointLat !== null && pointLon !== null ? [{ lat: pointLat, lon: pointLon }] : [];
  });
  if (points.length === 0) return null;
  return {
    lat: points.reduce((sum, point) => sum + point.lat, 0) / points.length,
    lon: points.reduce((sum, point) => sum + point.lon, 0) / points.length,
  };
}

function extractTreeName(item: JsonRecord, tags: JsonRecord | null, index: number): string {
  const label = readFirstString(tags ?? {}, ['name', 'species:nl', 'species']) ?? String(readNumber(item.id) ?? '');
  return label ? `OpenStreetMap boom ${label}` : `OpenStreetMap boom ${index + 1}`;
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

function clampPositive(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Number(value.toFixed(1));
}

function readFirstString(record: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}
