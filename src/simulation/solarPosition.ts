import type { LatLon } from '../model/schema';

export interface SolarPosition {
  /** Compass direction of the sun, clockwise from north. */
  azimuthDeg: number;
  /** Solar elevation above the horizon. */
  elevationDeg: number;
  zenithDeg: number;
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  return Math.floor((date.getTime() - start) / 86_400_000);
}

/**
 * NOAA-style solar position approximation.
 *
 * Accuracy is sufficient for an interactive phase-4 preview and keeps the
 * simulator fully client-side without adding a solar ephemeris dependency.
 */
export function calculateSolarPosition(date: Date, location: LatLon): SolarPosition {
  const minutesUtc =
    date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const gamma =
    ((2 * Math.PI) / 365) *
    (dayOfYear(date) - 1 + (minutesUtc / 60 - 12) / 24);

  const equationOfTimeMin =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  const declinationRad =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  const trueSolarTimeMin = (minutesUtc + equationOfTimeMin + 4 * location.lon + 1440) % 1440;
  const hourAngleDeg = trueSolarTimeMin / 4 < 0 ? trueSolarTimeMin / 4 + 180 : trueSolarTimeMin / 4 - 180;
  const hourAngleRad = hourAngleDeg * DEG_TO_RAD;
  const latRad = location.lat * DEG_TO_RAD;

  const cosZenith =
    Math.sin(latRad) * Math.sin(declinationRad) +
    Math.cos(latRad) * Math.cos(declinationRad) * Math.cos(hourAngleRad);
  const zenithDeg = Math.acos(Math.min(1, Math.max(-1, cosZenith))) * RAD_TO_DEG;
  const elevationDeg = 90 - zenithDeg;

  const azimuthRad =
    Math.atan2(
      Math.sin(hourAngleRad),
      Math.cos(hourAngleRad) * Math.sin(latRad) -
        Math.tan(declinationRad) * Math.cos(latRad),
    ) + Math.PI;

  return {
    azimuthDeg: normalizeDegrees(azimuthRad * RAD_TO_DEG),
    elevationDeg,
    zenithDeg,
  };
}

export function isSunAboveHorizon(solar: SolarPosition): boolean {
  return solar.elevationDeg > 0;
}
