/**
 * Location helpers: NL bounds checks and OpenStreetMap (Nominatim) geocoding.
 *
 * Geocoding is intentionally a thin wrapper that takes an injectable `fetch`
 * implementation, which makes it trivially testable without mocking globals.
 */
import { NL_BOUNDS, type LatLon } from '../model/schema';

export const NETHERLANDS_VIEWBOX = {
  // [west, south, east, north]
  minLon: NL_BOUNDS.minLon,
  minLat: NL_BOUNDS.minLat,
  maxLon: NL_BOUNDS.maxLon,
  maxLat: NL_BOUNDS.maxLat,
} as const;

/** Default centre of the Netherlands – roughly Lunteren. */
export const NL_DEFAULT_CENTER: LatLon = { lat: 52.1, lon: 5.6 };

export function isInsideNetherlands(point: LatLon): boolean {
  return (
    point.lat >= NL_BOUNDS.minLat &&
    point.lat <= NL_BOUNDS.maxLat &&
    point.lon >= NL_BOUNDS.minLon &&
    point.lon <= NL_BOUNDS.maxLon
  );
}

export interface GeocodeResult {
  /** Human-readable label, e.g. "Dam, Amsterdam, Noord-Holland". */
  label: string;
  lat: number;
  lon: number;
}

export interface GeocodeOptions {
  /** Search query, e.g. "Dam 1, Amsterdam". */
  query: string;
  /** Maximum number of results to return (Nominatim hard cap is 50). */
  limit?: number;
  /** Custom fetch implementation (for tests / non-browser environments). */
  fetchImpl?: typeof fetch;
  /**
   * User-Agent / Referer to send. Nominatim's usage policy requires a
   * descriptive User-Agent. Browser-side fetch ignores the header, but
   * server-side or Node-side callers should set it.
   */
  userAgent?: string;
  /** Override the Nominatim endpoint (useful for self-hosted or tests). */
  endpoint?: string;
}

const DEFAULT_ENDPOINT = 'https://nominatim.openstreetmap.org/search';

/**
 * Build the URL used to query Nominatim. Exposed for testing so that
 * callers can verify all required parameters (countrycodes, viewbox, ...)
 * are present without performing an actual network request.
 */
export function buildNominatimUrl(query: string, limit = 5, endpoint = DEFAULT_ENDPOINT): string {
  if (!query.trim()) {
    throw new Error('geocode: query must not be empty');
  }
  if (limit < 1 || limit > 50 || !Number.isInteger(limit)) {
    throw new Error('geocode: limit must be an integer in [1, 50]');
  }
  const url = new URL(endpoint);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '0');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('countrycodes', 'nl');
  url.searchParams.set(
    'viewbox',
    [
      NETHERLANDS_VIEWBOX.minLon,
      NETHERLANDS_VIEWBOX.maxLat,
      NETHERLANDS_VIEWBOX.maxLon,
      NETHERLANDS_VIEWBOX.minLat,
    ].join(','),
  );
  url.searchParams.set('bounded', '1');
  return url.toString();
}

interface NominatimRawResult {
  display_name?: unknown;
  lat?: unknown;
  lon?: unknown;
}

/** Parse Nominatim's response, filtering out malformed or out-of-bounds rows. */
export function parseNominatimResponse(raw: unknown): GeocodeResult[] {
  if (!Array.isArray(raw)) return [];
  const results: GeocodeResult[] = [];
  for (const item of raw as NominatimRawResult[]) {
    if (!item || typeof item !== 'object') continue;
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    const label = typeof item.display_name === 'string' ? item.display_name : '';
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !label) continue;
    if (!isInsideNetherlands({ lat, lon })) continue;
    results.push({ label, lat, lon });
  }
  return results;
}

/**
 * Look up a free-form address inside the Netherlands using Nominatim.
 * Returns an empty array on no matches; throws on network/HTTP errors.
 */
export async function geocode(options: GeocodeOptions): Promise<GeocodeResult[]> {
  const limit = options.limit ?? 5;
  const url = buildNominatimUrl(options.query, limit, options.endpoint);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error('geocode: no fetch implementation available');
  }
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.userAgent) headers['User-Agent'] = options.userAgent;
  const response = await fetchImpl(url, { headers });
  if (!response.ok) {
    throw new Error(`geocode: HTTP ${response.status} ${response.statusText}`);
  }
  const json: unknown = await response.json();
  return parseNominatimResponse(json);
}
