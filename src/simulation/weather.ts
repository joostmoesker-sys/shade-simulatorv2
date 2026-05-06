import type { SolarPosition } from './solarPosition';

export interface WeatherInput {
  ghiWm2?: number;
  dniWm2?: number;
  dhiWm2?: number;
  temperatureC?: number;
  windSpeedMs?: number;
}

export interface NormalizedWeather {
  ghiWm2: number;
  dniWm2: number;
  dhiWm2: number;
  temperatureC: number;
  windSpeedMs: number;
  source: 'measured' | 'clear-sky-preview';
}

function clampNonNegative(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : undefined;
}

function clearSkyGhi(solar: SolarPosition): number {
  const sinElevation = Math.sin((Math.max(0, solar.elevationDeg) * Math.PI) / 180);
  if (sinElevation <= 0) return 0;
  return 1050 * Math.pow(sinElevation, 1.15);
}

export function normalizeWeather(input: WeatherInput, solar: SolarPosition): NormalizedWeather {
  const inputGhi = clampNonNegative(input.ghiWm2);
  const inputDni = clampNonNegative(input.dniWm2);
  const inputDhi = clampNonNegative(input.dhiWm2);
  const ghiWm2 = inputGhi ?? clearSkyGhi(solar);
  const source = inputGhi === undefined ? 'clear-sky-preview' : 'measured';
  const diffuseFraction = solar.elevationDeg < 10 ? 0.45 : 0.18;
  const dhiWm2 = inputDhi ?? ghiWm2 * diffuseFraction;
  const sinElevation = Math.sin((Math.max(0.1, solar.elevationDeg) * Math.PI) / 180);
  const dniWm2 = inputDni ?? Math.max(0, (ghiWm2 - dhiWm2) / sinElevation);

  return {
    ghiWm2,
    dniWm2,
    dhiWm2,
    temperatureC: input.temperatureC ?? 20,
    windSpeedMs: input.windSpeedMs ?? 2,
    source,
  };
}
