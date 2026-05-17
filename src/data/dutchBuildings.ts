import type { BuildingObject, LatLon } from '../model/schema';

const THREE_D_BAG_ITEMS_URL = 'https://api.3dbag.nl/collections/pand/items';
const PDOK_BAG_WFS_URL = 'https://geodata.nationaalgeoregister.nl/bag/wfs/v1_1';
const OPENSTREETMAP_OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const DEFAULT_RADIUS_M = 65;
const DEFAULT_LIMIT = 40;
const MIN_HEIGHT_M = 2;
const FALLBACK_HEIGHT_M = 6;
const MAX_HEIGHT_M = 80;

type ImportedBuilding = Pick<BuildingObject, 'kind' | 'name' | 'position' | 'footprint' | 'heightM' | 'roofSurfaces'>;

type JsonRecord = Record<string, unknown>;
type CityPoint = [number, number, number];
type CityPolygon = { ring: CityPoint[]; semanticType: string | null };

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
  // Request CityJSON so we receive LoD2.2 geometries (with sloped roof shapes),
  // not just the flat 2D footprints returned by the default GeoJSON output.
  url.searchParams.set('f', 'cityjson');
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
  const cityJsonBuildings = parseCityJsonDocument(data);
  if (cityJsonBuildings !== null) return cityJsonBuildings;
  const features = collectFeatures(data);
  return features.flatMap((feature, index) => {
    const geometry = extractBuildingGeometry(feature);
    if (!geometry) return [];
    const footprint = geometry.footprint;
    const position = centroid(footprint);
    const heightM = extractHeightM(feature, geometry.heightM);
    return [
      {
        kind: 'building' as const,
        name: extractName(feature, index),
        position,
        footprint,
        heightM,
        roofSurfaces: geometry.roofSurfaces,
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

function extractBuildingGeometry(
  feature: JsonRecord,
): { footprint: [number, number][]; heightM?: number; roofSurfaces?: BuildingObject['roofSurfaces'] } | null {
  const geoJsonGeometry = extractGeoJsonGeometry(asRecord(feature.geometry));
  if (geoJsonGeometry) return geoJsonGeometry;
  return extractCityJsonGeometry(feature);
}

function extractGeoJsonGeometry(
  geometry: JsonRecord | null,
): { footprint: [number, number][]; heightM?: number; roofSurfaces?: BuildingObject['roofSurfaces'] } | null {
  if (!geometry) return null;
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    return extractGeoJsonPolygonGeometry([geometry.coordinates]);
  }
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return extractGeoJsonPolygonGeometry(geometry.coordinates);
  }
  return null;
}

function extractGeoJsonPolygonGeometry(
  polygonsRaw: unknown[],
): { footprint: [number, number][]; heightM?: number; roofSurfaces?: BuildingObject['roofSurfaces'] } | null {
  const rings3d = polygonsRaw.flatMap((polygon) => {
    if (!Array.isArray(polygon)) return [];
    const exterior = Array.isArray(polygon[0]) ? polygon[0] : null;
    const ring = exterior ? normalizeCityRing(exterior) : null;
    return ring ? [ring] : [];
  });
  if (rings3d.length === 0) return null;
  const hasZ = rings3d.some((ring) => ring.some(([, , z]) => z !== 0));
  if (!hasZ) {
    const footprint = largestRing(rings3d.map(projectRing));
    return footprint ? { footprint } : null;
  }
  return buildGeometryFromPolygons(rings3d.map((ring) => ({ ring, semanticType: null })));
}

function extractCityJsonGeometry(
  feature: JsonRecord,
): { footprint: [number, number][]; heightM?: number; roofSurfaces?: BuildingObject['roofSurfaces'] } | null {
  if (!Array.isArray(feature.vertices)) return null;
  const transform = asRecord(feature.transform);
  const scale = readNumberTriple(transform?.scale, [1, 1, 1]);
  const translate = readNumberTriple(transform?.translate, [0, 0, 0]);
  const vertices: CityPoint[] = feature.vertices.flatMap((raw) => {
    if (!Array.isArray(raw)) return [];
    const x = readNumber(raw[0]);
    const y = readNumber(raw[1]);
    const z = readNumber(raw[2]) ?? 0;
    if (x === null || y === null) return [];
    const point = normalizeCoordinate(x * scale[0] + translate[0], y * scale[1] + translate[1]);
    return point ? [[point[0], point[1], z * scale[2] + translate[2]] as CityPoint] : [];
  });
  if (!vertices.every(([lon, lat]) => isDutchLonLat([lon, lat]))) return null;

  const cityObjects = asRecord(feature.CityObjects);
  const geometries = cityObjects
    ? Object.values(cityObjects).flatMap((object) => {
        const list = asRecord(object)?.geometry;
        return Array.isArray(list) ? list : [];
      })
    : [];
  const selected = selectHighestLodGeometries(geometries);
  const polygons = selected.flatMap((geometry) => extractCityPolygons(asRecord(geometry), vertices));
  return buildGeometryFromPolygons(
    polygons.length > 0 ? polygons : [{ ring: vertices, semanticType: null }],
  );
}

/**
 * Parse a top-level 3D BAG CityJSON document (returned by `?f=cityjson`).
 *
 * The document contains a shared `vertices` array, an optional `transform`, and
 * a `CityObjects` map. Each top-level Building object may delegate its
 * geometry to one or more BuildingPart children listed in `children`. Every
 * Building/BuildingPart can carry multiple geometries at different levels of
 * detail (LoD 0, 1.2, 1.3, 2.2); we pick the highest available LoD per
 * building so sloped LoD2.2 roof surfaces are preserved.
 *
 * Returns `null` when the input is not a CityJSON document so the GeoJSON
 * code path can be used instead.
 */
function parseCityJsonDocument(data: unknown): ImportedBuilding[] | null {
  const record = asRecord(data);
  if (!record || record.type !== 'CityJSON') return null;
  if (!Array.isArray(record.vertices)) return [];
  const transform = asRecord(record.transform);
  const scale = readNumberTriple(transform?.scale, [1, 1, 1]);
  const translate = readNumberTriple(transform?.translate, [0, 0, 0]);
  const vertices: CityPoint[] = record.vertices.flatMap((raw) => {
    if (!Array.isArray(raw)) return [];
    const x = readNumber(raw[0]);
    const y = readNumber(raw[1]);
    const z = readNumber(raw[2]) ?? 0;
    if (x === null || y === null) return [];
    const point = normalizeCoordinate(x * scale[0] + translate[0], y * scale[1] + translate[1]);
    return point ? [[point[0], point[1], z * scale[2] + translate[2]] as CityPoint] : [];
  });
  if (vertices.length === 0) return [];

  const cityObjects = asRecord(record.CityObjects);
  if (!cityObjects) return [];

  return Object.entries(cityObjects).flatMap(([id, value], index) => {
    const object = asRecord(value);
    if (!object || object.type !== 'Building') return [];
    // Skip BuildingParts referenced from another Building.
    if (Array.isArray(object.parents) && object.parents.length > 0) return [];

    const childIds = Array.isArray(object.children)
      ? object.children.filter((child): child is string => typeof child === 'string')
      : [];
    const geometryGroup: JsonRecord[] = [];
    for (const objectId of [id, ...childIds]) {
      const co = asRecord(cityObjects[objectId]);
      if (!co || !Array.isArray(co.geometry)) continue;
      for (const geometry of co.geometry) {
        const geometryRecord = asRecord(geometry);
        if (geometryRecord) geometryGroup.push(geometryRecord);
      }
    }
    const selected = selectHighestLodGeometries(geometryGroup);
    if (selected.length === 0) return [];

    const polygons = selected.flatMap((geometry) => extractCityPolygons(geometry, vertices));
    if (polygons.length === 0) return [];
    const geometry = buildGeometryFromPolygons(polygons);
    if (!geometry) return [];

    const attributes = asRecord(object.attributes) ?? {};
    const syntheticFeature: JsonRecord = { id, properties: attributes };
    return [
      {
        kind: 'building' as const,
        name: extractName(syntheticFeature, index),
        position: centroid(geometry.footprint),
        footprint: geometry.footprint,
        heightM: extractHeightM(syntheticFeature, geometry.heightM),
        roofSurfaces: geometry.roofSurfaces,
      },
    ];
  });
}

/**
 * Pick the highest available LoD from a list of CityJSON geometries. The 3D
 * BAG ships block models (LoD 1.2, 1.3) alongside the sloped LoD 2.2 roof
 * model; we only want one LoD per building, otherwise the parser would mix
 * flat block tops with the real roof surfaces.
 */
function selectHighestLodGeometries(geometries: JsonRecord[]): JsonRecord[] {
  if (geometries.length === 0) return [];
  const groups = new Map<number, JsonRecord[]>();
  const unlabelled: JsonRecord[] = [];
  for (const geometry of geometries) {
    const lod = readNumberLike(geometry.lod);
    if (lod === null) {
      unlabelled.push(geometry);
    } else {
      const bucket = groups.get(lod) ?? [];
      bucket.push(geometry);
      groups.set(lod, bucket);
    }
  }
  if (groups.size === 0) return unlabelled;
  const highest = [...groups.keys()].reduce((a, b) => (a > b ? a : b));
  return groups.get(highest) ?? unlabelled;
}

function buildGeometryFromPolygons(
  polygons: CityPolygon[],
): { footprint: [number, number][]; heightM?: number; roofSurfaces?: BuildingObject['roofSurfaces'] } | null {
  const vertices = polygons.flatMap((polygon) => polygon.ring);
  if (vertices.length < 3) return null;
  const minZ = Math.min(...vertices.map(([, , z]) => z));
  const maxZ = Math.max(...vertices.map(([, , z]) => z));
  const projectedVertices = vertices.map(([lon, lat]) => [lon, lat] as [number, number]);
  const groundPolygons = polygons.filter((polygon) => polygon.semanticType === 'GroundSurface' || minHeight(polygon) <= minZ + 0.5);
  const footprint = largestRing(groundPolygons.map((polygon) => projectRing(polygon.ring))) ?? convexHull(projectedVertices);
  if (!footprint) return null;
  const roofSurfaces = polygons
    .filter((polygon) => polygon.semanticType === 'RoofSurface' || maxHeight(polygon) > minZ + 1)
    .map((polygon) => ({
      footprint: projectRing(polygon.ring),
      vertices: polygon.ring.map(([lon, lat, z]) => [lon, lat, clampNonNegative(z - minZ)] as [number, number, number]),
      baseHeightM: clampNonNegative(minHeight(polygon) - minZ),
      heightM: clampHeight(maxHeight(polygon) - minZ),
    }))
    .filter((surface) => surface.footprint.length >= 3 && surface.heightM > surface.baseHeightM + 0.1);

  return {
    footprint,
    heightM: clampHeight(maxZ - minZ),
    roofSurfaces: roofSurfaces.length > 0 ? roofSurfaces : undefined,
  };
}

function extractCityPolygons(geometry: JsonRecord | null, vertices: CityPoint[]): CityPolygon[] {
  if (!geometry || !Array.isArray(geometry.boundaries)) return [];
  const semanticTypes = readSemanticTypes(asRecord(geometry.semantics));
  const semanticValues = asRecord(geometry.semantics)?.values;
  const polygons: CityPolygon[] = [];
  collectCityPolygons(geometry.boundaries, semanticValues, semanticTypes, vertices, polygons);
  return polygons;
}

function collectCityPolygons(
  value: unknown,
  semanticValue: unknown,
  semanticTypes: string[],
  vertices: CityPoint[],
  polygons: CityPolygon[],
): void {
  if (isCityPolygonRings(value)) {
    const ring = value[0].flatMap((index) => {
      const point = vertices[index];
      return point ? [point] : [];
    });
    const openRing = stripClosingCityPoint(ring);
    if (openRing.length >= 3) {
      polygons.push({ ring: openRing, semanticType: semanticTypes[firstSemanticIndex(semanticValue) ?? -1] ?? null });
    }
    return;
  }
  if (!Array.isArray(value)) return;
  value.forEach((item, index) => {
    collectCityPolygons(item, childSemanticValue(semanticValue, index), semanticTypes, vertices, polygons);
  });
}

function isCityPolygonRings(value: unknown): value is number[][] {
  return (
    Array.isArray(value) &&
    Array.isArray(value[0]) &&
    value[0].length >= 3 &&
    value[0].every((index) => typeof index === 'number' && Number.isInteger(index))
  );
}

function readSemanticTypes(semantics: JsonRecord | null): string[] {
  if (!semantics || !Array.isArray(semantics.surfaces)) return [];
  return semantics.surfaces.map((surface) => {
    const record = asRecord(surface);
    return typeof record?.type === 'string' ? record.type : '';
  });
}

function firstSemanticIndex(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (!Array.isArray(value)) return null;
  for (const item of value) {
    const index = firstSemanticIndex(item);
    if (index !== null) return index;
  }
  return null;
}

function childSemanticValue(value: unknown, index: number): unknown {
  return Array.isArray(value) ? value[index] : value;
}

function stripClosingCityPoint(ring: CityPoint[]): CityPoint[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last) return ring;
  return first[0] === last[0] && first[1] === last[1] && first[2] === last[2] ? ring.slice(0, -1) : ring;
}

function projectRing(ring: CityPoint[]): [number, number][] {
  return ring.map(([lon, lat]) => [lon, lat]);
}

function minHeight(polygon: CityPolygon): number {
  return Math.min(...polygon.ring.map(([, , z]) => z));
}

function maxHeight(polygon: CityPolygon): number {
  return Math.max(...polygon.ring.map(([, , z]) => z));
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

function normalizeCityRing(rawRing: unknown): CityPoint[] | null {
  if (!Array.isArray(rawRing)) return null;
  const ring = rawRing.flatMap((raw) => {
    if (!Array.isArray(raw)) return [];
    const point = normalizeCoordinate(raw[0], raw[1]);
    const z = readNumber(raw[2]) ?? 0;
    return point ? [[point[0], point[1], z] as CityPoint] : [];
  });
  const openRing = stripClosingCityPoint(ring);
  return openRing.length >= 3 ? openRing : null;
}

function extractHeightM(feature: JsonRecord, fallbackHeightM: number | undefined): number {
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
    readFirstNumber(feature, ['height', 'heightM']) ??
    fallbackHeightM ??
    null;
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

function clampNonNegative(value: number): number {
  return Math.max(0, Number(value.toFixed(1)));
}

function readNumberTriple(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(value)) return fallback;
  return [
    readNumber(value[0]) ?? fallback[0],
    readNumber(value[1]) ?? fallback[1],
    readNumber(value[2]) ?? fallback[2],
  ];
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
