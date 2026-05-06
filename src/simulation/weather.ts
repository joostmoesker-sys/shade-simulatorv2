import type { SolarPosition } from './solarPosition';

export interface WeatherInput {
  ghiWm2?: number;
  dniWm2?: number;
  dhiWm2?: number;
  temperatureC?: number;
  windSpeedMs?: number;
}

export interface HourlyWeatherSample extends WeatherInput {
  timestamp: string;
  cloudCoverPct?: number;
}

interface OpenMeteoArchiveResponse {
  hourly?: {
    time?: string[];
    shortwave_radiation?: Array<number | null>;
    direct_normal_irradiance?: Array<number | null>;
    diffuse_radiation?: Array<number | null>;
    temperature_2m?: Array<number | null>;
    wind_speed_10m?: Array<number | null>;
    cloud_cover?: Array<number | null>;
  };
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

function finiteOrUndefined(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function mapOpenMeteoArchiveWeather(data: OpenMeteoArchiveResponse): HourlyWeatherSample[] {
  const hourly = data.hourly;
  const times = hourly?.time ?? [];
  return times.map((time, index) => ({
    timestamp: `${time}${time.endsWith('Z') ? '' : 'Z'}`,
    ghiWm2: finiteOrUndefined(hourly?.shortwave_radiation?.[index]),
    dniWm2: finiteOrUndefined(hourly?.direct_normal_irradiance?.[index]),
    dhiWm2: finiteOrUndefined(hourly?.diffuse_radiation?.[index]),
    temperatureC: finiteOrUndefined(hourly?.temperature_2m?.[index]),
    windSpeedMs: finiteOrUndefined(hourly?.wind_speed_10m?.[index]),
    cloudCoverPct: finiteOrUndefined(hourly?.cloud_cover?.[index]),
  }));
}

export async function fetchOpenMeteoArchiveWeather(
  location: { lat: number; lon: number },
  year = 2025,
): Promise<HourlyWeatherSample[]> {
  const params = new URLSearchParams({
    latitude: location.lat.toFixed(5),
    longitude: location.lon.toFixed(5),
    start_date: `${year}-01-01`,
    end_date: `${year}-12-31`,
    hourly: [
      'shortwave_radiation',
      'direct_normal_irradiance',
      'diffuse_radiation',
      'temperature_2m',
      'wind_speed_10m',
      'cloud_cover',
    ].join(','),
    timezone: 'UTC',
    wind_speed_unit: 'ms',
  });
  const response = await fetch(`https://archive-api.open-meteo.com/v1/archive?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Open-Meteo archive request failed (${response.status})`);
  }
  return mapOpenMeteoArchiveWeather((await response.json()) as OpenMeteoArchiveResponse);
}
