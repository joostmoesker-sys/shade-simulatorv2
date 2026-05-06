import { describe, expect, it } from 'vitest';

import {
  arrayFootprintRing,
  bearing,
  getArrayDimensions,
  METERS_PER_DEG_LAT,
  offsetPoint,
} from '../../src/map/pvArrayGeometry';
import type { PanelType, PVArray } from '../../src/model/schema';

const CENTER = { lat: 52.0, lon: 5.0 };

const PANEL_TYPE: PanelType = {
  id: 'pt_test',
  manufacturer: 'Test',
  model: 'M',
  pmaxW: 400,
  vmpV: 34,
  impA: 11.8,
  vocV: 41,
  iscA: 12.6,
  tempCoeffPmaxPctPerC: -0.35,
  tempCoeffVocPctPerC: -0.28,
  cells: 108,
  bypassDiodes: 3,
  widthM: 1.0,
  heightM: 2.0,
};

function makeArray(overrides: Partial<PVArray> = {}): PVArray {
  return {
    id: 'arr_test',
    name: 'Test',
    panelTypeId: PANEL_TYPE.id,
    position: CENTER,
    rows: 2,
    columns: 3,
    orientation: 'portrait',
    azimuthDeg: 180,
    tiltDeg: 35,
    baseHeightM: 0,
    panelGapM: 0,
    rowGapM: 0,
    ...overrides,
  };
}

describe('offsetPoint', () => {
  it('moves north correctly', () => {
    const p = offsetPoint(CENTER, 0, METERS_PER_DEG_LAT);
    expect(p.lat).toBeCloseTo(CENTER.lat + 1, 4);
    expect(p.lon).toBeCloseTo(CENTER.lon, 4);
  });

  it('moves south correctly', () => {
    const p = offsetPoint(CENTER, 180, METERS_PER_DEG_LAT);
    expect(p.lat).toBeCloseTo(CENTER.lat - 1, 4);
    expect(p.lon).toBeCloseTo(CENTER.lon, 4);
  });

  it('moves east by a known amount', () => {
    const cosLat = Math.cos((CENTER.lat * Math.PI) / 180);
    const p = offsetPoint(CENTER, 90, METERS_PER_DEG_LAT * cosLat);
    expect(p.lat).toBeCloseTo(CENTER.lat, 4);
    expect(p.lon).toBeCloseTo(CENTER.lon + 1, 4);
  });

  it('zero distance returns original point', () => {
    const p = offsetPoint(CENTER, 45, 0);
    expect(p.lat).toBe(CENTER.lat);
    expect(p.lon).toBe(CENTER.lon);
  });
});

describe('bearing', () => {
  it('north → 0°', () => {
    const north = { lat: CENTER.lat + 0.01, lon: CENTER.lon };
    expect(bearing(CENTER, north)).toBeCloseTo(0, 1);
  });

  it('south → 180°', () => {
    const south = { lat: CENTER.lat - 0.01, lon: CENTER.lon };
    expect(bearing(CENTER, south)).toBeCloseTo(180, 1);
  });

  it('east → 90°', () => {
    const east = { lat: CENTER.lat, lon: CENTER.lon + 0.01 };
    expect(bearing(CENTER, east)).toBeCloseTo(90, 1);
  });

  it('west → 270°', () => {
    const west = { lat: CENTER.lat, lon: CENTER.lon - 0.01 };
    expect(bearing(CENTER, west)).toBeCloseTo(270, 1);
  });

  it('identical points → 0', () => {
    expect(bearing(CENTER, CENTER)).toBe(0);
  });
});

describe('getArrayDimensions', () => {
  it('portrait: width uses panelType.widthM, depth uses heightM', () => {
    // 3 cols × 1.0 m panel + 0 gap = 3.0 m wide; 2 rows × 2.0 m panel + 0 gap = 4.0 m deep
    const dims = getArrayDimensions(makeArray(), PANEL_TYPE);
    expect(dims.widthM).toBeCloseTo(3.0, 5);
    expect(dims.depthM).toBeCloseTo(4.0, 5);
  });

  it('landscape: width uses panelType.heightM, depth uses widthM', () => {
    // 3 cols × 2.0 m (landscape height) = 6.0 m wide; 2 rows × 1.0 m = 2.0 m deep
    const dims = getArrayDimensions(makeArray({ orientation: 'landscape' }), PANEL_TYPE);
    expect(dims.widthM).toBeCloseTo(6.0, 5);
    expect(dims.depthM).toBeCloseTo(2.0, 5);
  });

  it('includes panel gaps in dimensions', () => {
    // 3 cols × 1.0 m + 2 × 0.02 m gap = 3.04 m wide
    const dims = getArrayDimensions(makeArray({ panelGapM: 0.02 }), PANEL_TYPE);
    expect(dims.widthM).toBeCloseTo(3.04, 5);
  });

  it('includes row gaps in dimensions', () => {
    const dims = getArrayDimensions(makeArray({ rowGapM: 0.3 }), PANEL_TYPE);
    // 2 rows × 2.0 m + 1 × 0.3 m gap = 4.3 m deep
    expect(dims.depthM).toBeCloseTo(4.3, 5);
  });
});

describe('arrayFootprintRing', () => {
  it('returns 5 coordinates (closed ring)', () => {
    const ring = arrayFootprintRing(makeArray(), PANEL_TYPE);
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
  });

  it('centroid of corners is approximately the array position', () => {
    const ring = arrayFootprintRing(makeArray(), PANEL_TYPE);
    const lons = ring.slice(0, 4).map(([lon]) => lon);
    const lats = ring.slice(0, 4).map(([, lat]) => lat);
    const centerLon = lons.reduce((s, v) => s + v, 0) / 4;
    const centerLat = lats.reduce((s, v) => s + v, 0) / 4;
    expect(centerLon).toBeCloseTo(CENTER.lon, 5);
    expect(centerLat).toBeCloseTo(CENTER.lat, 5);
  });

  it('south-facing (azimuth=180) footprint spans correct east-west width', () => {
    // portrait: 3 cols × 1.0 m = 3.0 m width (east-west)
    const ring = arrayFootprintRing(makeArray({ azimuthDeg: 180 }), PANEL_TYPE);
    const lons = ring.slice(0, 4).map(([lon]) => lon);
    const cosLat = Math.cos((CENTER.lat * Math.PI) / 180);
    const lonSpanM = (Math.max(...lons) - Math.min(...lons)) * METERS_PER_DEG_LAT * cosLat;
    expect(lonSpanM).toBeCloseTo(3.0, 1);
  });

  it('north-facing (azimuth=0) footprint spans correct north-south depth', () => {
    // portrait: 2 rows × 2.0 m = 4.0 m depth (north-south)
    const ring = arrayFootprintRing(makeArray({ azimuthDeg: 0 }), PANEL_TYPE);
    const lats = ring.slice(0, 4).map(([, lat]) => lat);
    const latSpanM = (Math.max(...lats) - Math.min(...lats)) * METERS_PER_DEG_LAT;
    expect(latSpanM).toBeCloseTo(4.0, 1);
  });
});
