import type { PVArray } from '../model/schema';
import type { SolarPosition } from './solarPosition';
import type { NormalizedWeather } from './weather';

export interface PlaneOfArrayIrradiance {
  beamWm2: number;
  diffuseWm2: number;
  groundReflectedWm2: number;
  totalWm2: number;
  incidenceAngleDeg: number;
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export function calculatePlaneOfArrayIrradiance(
  weather: NormalizedWeather,
  solar: SolarPosition,
  surface: Pick<PVArray, 'tiltDeg' | 'azimuthDeg'>,
  albedo = 0.2,
): PlaneOfArrayIrradiance {
  if (solar.elevationDeg <= 0) {
    return { beamWm2: 0, diffuseWm2: 0, groundReflectedWm2: 0, totalWm2: 0, incidenceAngleDeg: 90 };
  }

  const zenithRad = solar.zenithDeg * DEG_TO_RAD;
  const tiltRad = surface.tiltDeg * DEG_TO_RAD;
  const azimuthDeltaRad = (solar.azimuthDeg - surface.azimuthDeg) * DEG_TO_RAD;
  const cosIncidence =
    Math.cos(zenithRad) * Math.cos(tiltRad) +
    Math.sin(zenithRad) * Math.sin(tiltRad) * Math.cos(azimuthDeltaRad);
  const usableCosIncidence = Math.max(0, cosIncidence);
  const beamWm2 = weather.dniWm2 * usableCosIncidence;
  const diffuseWm2 = weather.dhiWm2 * (1 + Math.cos(tiltRad)) / 2;
  const groundReflectedWm2 = weather.ghiWm2 * albedo * (1 - Math.cos(tiltRad)) / 2;

  return {
    beamWm2,
    diffuseWm2,
    groundReflectedWm2,
    totalWm2: beamWm2 + diffuseWm2 + groundReflectedWm2,
    incidenceAngleDeg: Math.acos(Math.min(1, Math.max(-1, usableCosIncidence))) * RAD_TO_DEG,
  };
}
