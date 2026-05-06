/**
 * Geometric utilities for computing PV array footprints and related spatial
 * operations needed by the map overlay editor.
 *
 * All bearings use the standard compass convention:
 *   0° = north, 90° = east, 180° = south, 270° = west.
 */
import type { LatLon, PanelType, PVArray } from '../model/schema';

/** Approximate metres per degree of latitude (constant at any latitude). */
export const METERS_PER_DEG_LAT = 111_319;

/**
 * Offset a coordinate by `distM` metres in compass direction `bearingDeg`.
 * Handles the latitude-dependent scale of longitude degrees.
 */
export function offsetPoint(center: LatLon, bearingDeg: number, distM: number): LatLon {
  const rad = (bearingDeg * Math.PI) / 180;
  const cosLat = Math.cos((center.lat * Math.PI) / 180);
  return {
    lat: center.lat + (Math.cos(rad) * distM) / METERS_PER_DEG_LAT,
    lon: center.lon + (Math.sin(rad) * distM) / (METERS_PER_DEG_LAT * cosLat),
  };
}

/**
 * Compass bearing from `a` to `b`, in degrees [0, 360).
 * Returns 0 when both points are identical.
 */
export function bearing(a: LatLon, b: LatLon): number {
  const cosLat = Math.cos((a.lat * Math.PI) / 180);
  const dEast = (b.lon - a.lon) * METERS_PER_DEG_LAT * cosLat;
  const dNorth = (b.lat - a.lat) * METERS_PER_DEG_LAT;
  if (dEast === 0 && dNorth === 0) return 0;
  return ((Math.atan2(dEast, dNorth) * 180) / Math.PI + 360) % 360;
}

/** Physical dimensions of a PV array in metres. */
export interface ArrayDimensions {
  /** Extent in the direction perpendicular to the azimuth (left–right across the array). */
  widthM: number;
  /** Extent in the azimuth direction (front–back, where front faces the sun). */
  depthM: number;
}

/** Compute the physical footprint dimensions of an array from its config and panel type. */
export function getArrayDimensions(array: PVArray, panelType: PanelType): ArrayDimensions {
  const panelW = array.orientation === 'portrait' ? panelType.widthM : panelType.heightM;
  const panelH = array.orientation === 'portrait' ? panelType.heightM : panelType.widthM;
  return {
    widthM: array.columns * panelW + Math.max(0, array.columns - 1) * array.panelGapM,
    depthM: array.rows * panelH + Math.max(0, array.rows - 1) * array.rowGapM,
  };
}

/**
 * Compute the four corners of a PV array as a closed GeoJSON coordinate ring.
 *
 * The array is centred on `array.position`. The width axis is perpendicular
 * to the azimuth direction (east–west when azimuth = 180°). The depth axis is
 * along the azimuth direction (north–south when azimuth = 180°). The ring is
 * wound clockwise when viewed from above (GeoJSON exterior ring convention).
 * Coordinates are [longitude, latitude] in GeoJSON order.
 */
export function arrayFootprintRing(array: PVArray, panelType: PanelType): [number, number][] {
  const { widthM, depthM } = getArrayDimensions(array, panelType);
  const c = array.position;
  const az = array.azimuthDeg;
  const perp = (az + 90) % 360;

  const ahead = (d: number) => offsetPoint(c, az, d);
  const side = (pt: LatLon, d: number) => offsetPoint(pt, perp, d);

  const hW = widthM / 2;
  const hD = depthM / 2;

  const frontRight = side(ahead(hD), hW);
  const backRight = side(ahead(-hD), hW);
  const backLeft = side(ahead(-hD), -hW);
  const frontLeft = side(ahead(hD), -hW);

  // Clockwise ring, closed (first point repeated).
  return [
    [frontRight.lon, frontRight.lat],
    [backRight.lon, backRight.lat],
    [backLeft.lon, backLeft.lat],
    [frontLeft.lon, frontLeft.lat],
    [frontRight.lon, frontRight.lat],
  ];
}
