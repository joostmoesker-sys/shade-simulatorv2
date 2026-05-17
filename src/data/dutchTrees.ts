import { fromArrayBuffer } from 'geotiff';

import type { LatLon, TreeObject } from '../model/schema';
import { rdToWgs84, wgs84ToRd } from './rdProjection';

const OPENSTREETMAP_OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const AHN_WCS_URL = 'https://service.pdok.nl/rws/ahn/wcs/v1_0';
export const AHN_DSM_COVERAGE_ID = 'dsm_05m';
export const AHN_DTM_COVERAGE_ID = 'dtm_05m';

const DEFAULT_RADIUS_M = 65;
const DEFAULT_LIMIT = 80;
const FALLBACK_TREE_HEIGHT_M = 8;
const FALLBACK_CROWN_RADIUS_M = 3;
const MIN_TREE_HEIGHT_M = 3.0;
const MIN_TREE_SPACING_M = 2.5;
/** Minimum drop-off from the peak to its neighbours, in meters; suppresses flat building roofs. */
const TREE_TAPER_MIN_DROP_M = 0.6;
/** Max number of trees per import, to keep the scene manageable. */
const DEFAULT_MAX_TREES = 80;

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

// =====================================================================
//  AHN canopy-height tree detection (primary source)
// =====================================================================

/**
 * Build a PDOK AHN WCS `GetCoverage` URL for a small bbox around the given
 * location, in RD (EPSG:28992) coordinates. Pass either {@link AHN_DSM_COVERAGE_ID}
 * for the surface model (top of canopy) or {@link AHN_DTM_COVERAGE_ID} for the
 * bare terrain; their difference is the canopy height model used for tree
 * detection.
 */
export function buildAhnCoverageUrl(
  coverageId: string,
  location: LatLon,
  radiusM = DEFAULT_RADIUS_M,
): string {
  const rd = wgs84ToRd(location);
  const url = new URL(AHN_WCS_URL);
  url.searchParams.set('service', 'WCS');
  url.searchParams.set('version', '2.0.1');
  url.searchParams.set('request', 'GetCoverage');
  url.searchParams.set('coverageId', coverageId);
  url.searchParams.set('format', 'image/tiff');
  url.searchParams.append('subset', `X(${(rd.x - radiusM).toFixed(2)},${(rd.x + radiusM).toFixed(2)})`);
  url.searchParams.append('subset', `Y(${(rd.y - radiusM).toFixed(2)},${(rd.y + radiusM).toFixed(2)})`);
  return url.toString();
}

/**
 * Top-down canopy height model: `values[row * cols + col]` holds height in m
 * above ground for the cell whose centre is at
 * `(xllRd + (col + 0.5) * cellSizeM, yulRd - (row + 0.5) * cellSizeM)`.
 * NaN cells are treated as nodata.
 */
export interface CanopyHeightModel {
  values: Float32Array;
  cols: number;
  rows: number;
  /** RD X coordinate of the left edge (in meters). */
  xllRd: number;
  /** RD Y coordinate of the top edge (in meters). */
  yulRd: number;
  cellSizeM: number;
}

export interface DetectTreesOptions {
  minHeightM?: number;
  minSpacingM?: number;
  maxTrees?: number;
}

/**
 * Find tree-like local maxima in a canopy height model. A cell counts as a
 * tree when:
 *  - its height is at least `minHeightM` (default 3 m), and
 *  - it strictly dominates its 3×3 neighbourhood, and
 *  - it tapers off by at least {@link TREE_TAPER_MIN_DROP_M} m around it
 *    (rejects flat building tops, which the AHN DSM also contains), and
 *  - it is not within `minSpacingM` of an already accepted, taller peak.
 */
export function detectTreesInCanopyHeightModel(
  chm: CanopyHeightModel,
  options: DetectTreesOptions = {},
): ImportedTree[] {
  const minHeightM = options.minHeightM ?? MIN_TREE_HEIGHT_M;
  const minSpacingM = options.minSpacingM ?? MIN_TREE_SPACING_M;
  const maxTrees = options.maxTrees ?? DEFAULT_MAX_TREES;
  const { values, cols, rows, cellSizeM, xllRd, yulRd } = chm;
  const taperRadius = Math.max(1, Math.round(2 / cellSizeM));

  interface Candidate {
    col: number;
    row: number;
    heightM: number;
  }
  const candidates: Candidate[] = [];

  for (let row = 1; row < rows - 1; row++) {
    for (let col = 1; col < cols - 1; col++) {
      const heightM = values[row * cols + col];
      if (!Number.isFinite(heightM) || heightM < minHeightM) continue;
      if (!isLocalMax3x3(values, cols, rows, col, row, heightM)) continue;
      if (!hasTreeLikeTaper(values, cols, rows, col, row, heightM, taperRadius)) continue;
      candidates.push({ col, row, heightM });
    }
  }

  candidates.sort((a, b) => b.heightM - a.heightM);

  const accepted: Candidate[] = [];
  const minSpacingCells = minSpacingM / cellSizeM;
  for (const candidate of candidates) {
    let tooClose = false;
    for (const other of accepted) {
      const dCol = candidate.col - other.col;
      const dRow = candidate.row - other.row;
      if (dCol * dCol + dRow * dRow < minSpacingCells * minSpacingCells) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;
    accepted.push(candidate);
    if (accepted.length >= maxTrees) break;
  }

  return accepted.map((candidate, index) => {
    const xRd = xllRd + (candidate.col + 0.5) * cellSizeM;
    const yRd = yulRd - (candidate.row + 0.5) * cellSizeM;
    const { lat, lon } = rdToWgs84(xRd, yRd);
    const heightM = clampPositive(candidate.heightM, FALLBACK_TREE_HEIGHT_M);
    const crownRadiusM = clampPositive(
      estimateCrownRadiusM(values, cols, rows, candidate.col, candidate.row, candidate.heightM, cellSizeM),
      FALLBACK_CROWN_RADIUS_M,
    );
    return {
      kind: 'tree' as const,
      name: `AHN boom ${index + 1}`,
      position: { lat, lon },
      heightM,
      crownRadiusM,
      trunkHeightM: clampPositive(
        Math.min(heightM * 0.35, Math.max(1.5, heightM - crownRadiusM * 2)),
        Math.max(1.5, heightM * 0.3),
      ),
      density: 0.7,
      undergrowth: 'grass' as const,
      deciduous: true,
    };
  });
}

function isLocalMax3x3(values: Float32Array, cols: number, rows: number, col: number, row: number, peak: number): boolean {
  for (let dRow = -1; dRow <= 1; dRow++) {
    for (let dCol = -1; dCol <= 1; dCol++) {
      if (dCol === 0 && dRow === 0) continue;
      const nc = col + dCol;
      const nr = row + dRow;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const neighbour = values[nr * cols + nc];
      if (Number.isFinite(neighbour) && neighbour > peak) return false;
    }
  }
  return true;
}

/**
 * Trees taper outward; flat building roofs do not. We require a noticeable
 * height drop in most surrounding probes to suppress building hits.
 */
function hasTreeLikeTaper(
  values: Float32Array,
  cols: number,
  rows: number,
  col: number,
  row: number,
  peak: number,
  taperRadius: number,
): boolean {
  const offsets: [number, number][] = [
    [taperRadius, 0],
    [-taperRadius, 0],
    [0, taperRadius],
    [0, -taperRadius],
    [taperRadius, taperRadius],
    [-taperRadius, -taperRadius],
    [taperRadius, -taperRadius],
    [-taperRadius, taperRadius],
  ];
  let drops = 0;
  let probes = 0;
  for (const [dCol, dRow] of offsets) {
    const nc = col + dCol;
    const nr = row + dRow;
    if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
    const value = values[nr * cols + nc];
    if (!Number.isFinite(value)) continue;
    probes += 1;
    if (peak - value >= TREE_TAPER_MIN_DROP_M) drops += 1;
  }
  // Require a strong majority of probes to taper off; rejects flat tops.
  return probes >= 4 && drops >= Math.max(4, probes - 2);
}

function estimateCrownRadiusM(
  values: Float32Array,
  cols: number,
  rows: number,
  col: number,
  row: number,
  peak: number,
  cellSizeM: number,
): number {
  const threshold = Math.max(1.5, peak * 0.5);
  let maxRadiusCells = 1;
  const probeOffsets: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (const [dCol, dRow] of probeOffsets) {
    let radius = 1;
    while (radius < 12) {
      const nc = col + dCol * radius;
      const nr = row + dRow * radius;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) break;
      const value = values[nr * cols + nc];
      if (!Number.isFinite(value) || value < threshold) break;
      radius += 1;
    }
    if (radius > maxRadiusCells) maxRadiusCells = radius;
  }
  return Math.min(8, Math.max(1.5, maxRadiusCells * cellSizeM));
}

/**
 * Fetch the AHN DSM and DTM GeoTIFFs from PDOK, compute the canopy height
 * model, and return the detected trees. Throws when either coverage cannot
 * be fetched or decoded so callers can fall back to other sources.
 */
export async function fetchDutchTreeObjectsFromAhn(
  location: LatLon,
  options: FetchTreesOptions = {},
): Promise<ImportedTree[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const radiusM = options.radiusM ?? DEFAULT_RADIUS_M;
  const [dsm, dtm] = await Promise.all([
    fetchAhnRaster(buildAhnCoverageUrl(AHN_DSM_COVERAGE_ID, location, radiusM), fetchImpl),
    fetchAhnRaster(buildAhnCoverageUrl(AHN_DTM_COVERAGE_ID, location, radiusM), fetchImpl),
  ]);
  if (dsm.cols !== dtm.cols || dsm.rows !== dtm.rows || dsm.cellSizeM !== dtm.cellSizeM) {
    throw new Error('AHN DSM en DTM hebben verschillende dimensies; kan canopy height niet berekenen');
  }
  const values = new Float32Array(dsm.values.length);
  for (let index = 0; index < values.length; index++) {
    const dsmValue = dsm.values[index];
    const dtmValue = dtm.values[index];
    values[index] = Number.isFinite(dsmValue) && Number.isFinite(dtmValue) ? dsmValue - dtmValue : Number.NaN;
  }
  return detectTreesInCanopyHeightModel(
    { values, cols: dsm.cols, rows: dsm.rows, xllRd: dsm.xllRd, yulRd: dsm.yulRd, cellSizeM: dsm.cellSizeM },
    { maxTrees: options.limit ?? DEFAULT_MAX_TREES },
  );
}

interface AhnRaster {
  values: Float32Array;
  cols: number;
  rows: number;
  xllRd: number;
  yulRd: number;
  cellSizeM: number;
}

async function fetchAhnRaster(url: string, fetchImpl: typeof fetch): Promise<AhnRaster> {
  const response = await fetchImpl(url, { headers: { Accept: 'image/tiff' } });
  if (!response.ok) throw new Error(`AHN gaf HTTP ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  const tiff = await fromArrayBuffer(arrayBuffer);
  const image = await tiff.getImage();
  const cols = image.getWidth();
  const rows = image.getHeight();
  const [originX, originY] = image.getOrigin();
  const [resX, resY] = image.getResolution();
  const cellSizeM = Math.abs(resX);
  const nodata = readNumberLike(image.getGDALNoData());
  const rasters = await image.readRasters({ interleave: true });
  const raw = rasters as unknown as ArrayLike<number>;
  const values = new Float32Array(cols * rows);
  for (let i = 0; i < values.length; i++) {
    const value = raw[i];
    values[i] = !Number.isFinite(value) || (nodata !== null && value === nodata) ? Number.NaN : value;
  }
  return {
    values,
    cols,
    rows,
    xllRd: originX,
    yulRd: resY < 0 ? originY : originY + rows * Math.abs(resY),
    cellSizeM,
  };
}

// =====================================================================
//  OpenStreetMap Overpass tree query (fallback)
// =====================================================================

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

/**
 * Fetch trees around a location. Tries the AHN canopy height model first
 * (covers the entire Netherlands with sub-meter detail), and falls back to
 * OpenStreetMap `natural=tree` data if the AHN service cannot be reached or
 * returned no trees.
 */
export async function fetchDutchTreeObjects(
  location: LatLon,
  options: FetchTreesOptions = {},
): Promise<ImportedTree[]> {
  try {
    const ahnTrees = await fetchDutchTreeObjectsFromAhn(location, options);
    if (ahnTrees.length > 0) return ahnTrees;
  } catch {
    // fall through to OpenStreetMap when the AHN service is unavailable
  }
  return fetchDutchTreesFromOpenStreetMap(location, options);
}

async function fetchDutchTreesFromOpenStreetMap(
  location: LatLon,
  options: FetchTreesOptions,
): Promise<ImportedTree[]> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(
    buildOpenStreetMapTreesOverpassUrl(location, options.radiusM, options.limit),
    { headers: { Accept: 'application/json' } },
  );
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
