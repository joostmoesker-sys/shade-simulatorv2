import { describe, expect, it, vi } from 'vitest';

import {
  buildNominatimUrl,
  geocode,
  isInsideNetherlands,
  NETHERLANDS_VIEWBOX,
  parseNominatimResponse,
} from '../../src/location/geocode';

describe('isInsideNetherlands', () => {
  it.each([
    [{ lat: 52.37, lon: 4.9 }, true], // Amsterdam
    [{ lat: 53.2, lon: 6.57 }, true], // Groningen
    [{ lat: 50.85, lon: 5.69 }, true], // Maastricht
    [{ lat: 48.85, lon: 2.35 }, false], // Paris
    [{ lat: 52.52, lon: 13.4 }, false], // Berlin
  ])('classifies %j as %s', (point, expected) => {
    expect(isInsideNetherlands(point)).toBe(expected);
  });
});

describe('buildNominatimUrl', () => {
  it('encodes the query and required parameters', () => {
    const url = new URL(buildNominatimUrl('Dam 1, Amsterdam', 5));
    expect(url.searchParams.get('q')).toBe('Dam 1, Amsterdam');
    expect(url.searchParams.get('format')).toBe('jsonv2');
    expect(url.searchParams.get('countrycodes')).toBe('nl');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.get('bounded')).toBe('1');
    expect(url.searchParams.get('viewbox')).toBe(
      [
        NETHERLANDS_VIEWBOX.minLon,
        NETHERLANDS_VIEWBOX.maxLat,
        NETHERLANDS_VIEWBOX.maxLon,
        NETHERLANDS_VIEWBOX.minLat,
      ].join(','),
    );
  });

  it('rejects empty queries and out-of-range limits', () => {
    expect(() => buildNominatimUrl('   ')).toThrow();
    expect(() => buildNominatimUrl('x', 0)).toThrow();
    expect(() => buildNominatimUrl('x', 51)).toThrow();
    expect(() => buildNominatimUrl('x', 1.5)).toThrow();
  });

  it('honours a custom endpoint', () => {
    const url = buildNominatimUrl('x', 1, 'https://nominatim.example/search');
    expect(url.startsWith('https://nominatim.example/search')).toBe(true);
  });
});

describe('parseNominatimResponse', () => {
  it('returns an empty array for non-array input', () => {
    expect(parseNominatimResponse(null)).toEqual([]);
    expect(parseNominatimResponse({})).toEqual([]);
    expect(parseNominatimResponse('boom')).toEqual([]);
  });

  it('keeps only well-formed rows inside NL', () => {
    const parsed = parseNominatimResponse([
      { display_name: 'Amsterdam', lat: '52.37', lon: '4.9' },
      { display_name: 'Berlin', lat: '52.52', lon: '13.4' },
      { display_name: '', lat: '52', lon: '5' },
      { lat: '52', lon: '5' },
      { display_name: 'NaN row', lat: 'foo', lon: '5' },
    ]);
    expect(parsed).toEqual([{ label: 'Amsterdam', lat: 52.37, lon: 4.9 }]);
  });
});

describe('geocode', () => {
  it('uses the injected fetch implementation', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify([{ display_name: 'Utrecht', lat: '52.09', lon: '5.12' }]),
        { status: 200 },
      ),
    );

    const results = await geocode({ query: 'Utrecht', fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(results).toEqual([{ label: 'Utrecht', lat: 52.09, lon: 5.12 }]);
    const calledUrl = String(fetchImpl.mock.calls[0]![0]);
    expect(calledUrl).toContain('q=Utrecht');
  });

  it('throws when the HTTP response is not ok', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response('rate limited', { status: 429, statusText: 'Too Many Requests' }),
    );
    await expect(geocode({ query: 'Utrecht', fetchImpl })).rejects.toThrow(/HTTP 429/);
  });

  it('throws when no fetch implementation is available', async () => {
    const original = globalThis.fetch;
    // @ts-expect-error – exercising the missing-fetch path
    globalThis.fetch = undefined;
    try {
      await expect(geocode({ query: 'x' })).rejects.toThrow(/no fetch/);
    } finally {
      globalThis.fetch = original;
    }
  });
});
