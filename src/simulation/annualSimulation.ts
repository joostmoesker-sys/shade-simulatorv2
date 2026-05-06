import type { Project } from '../model/schema';
import { calculatePlaneOfArrayIrradiance } from './irradiance';
import { estimateArrayShadeFactors, buildShadowFeatureCollection } from './shading';
import { calculateSolarPosition } from './solarPosition';
import { fetchOpenMeteoArchiveWeather, normalizeWeather, type HourlyWeatherSample } from './weather';
import { simulateProjectElectricalHour } from './pvPerformance';

const WATT_HOURS_TO_KWH = 1 / 1000;

export interface AnnualSimulationOptions {
  year?: number;
  weatherSamples?: HourlyWeatherSample[];
}

export interface AnnualSimulationResult {
  year: number;
  acKwh: number;
  dcKwh: number;
  shadeLossKwh: number;
  mismatchLossKwh: number;
  clippingLossKwh: number;
  voltageCurrentLossKwh: number;
  standbyLossKwh: number;
  monthlyAcKwh: number[];
  samples: number;
  weatherSource: 'open-meteo-archive' | 'provided';
  elapsedMs: number;
}

function sampleDurationHours(samples: HourlyWeatherSample[], index: number): number {
  const current = Date.parse(samples[index].timestamp);
  const next = Date.parse(samples[index + 1]?.timestamp ?? '');
  if (Number.isFinite(current) && Number.isFinite(next) && next > current) {
    return Math.min(2, Math.max(0.25, (next - current) / 3_600_000));
  }
  return 1;
}

export async function simulateProjectYear(
  project: Project,
  options: AnnualSimulationOptions = {},
): Promise<AnnualSimulationResult> {
  const startedAt = performance.now();
  const year = options.year ?? 2025;
  const weatherSamples = options.weatherSamples ?? (await fetchOpenMeteoArchiveWeather(project.location, year));
  const monthlyAcKwh = Array.from({ length: 12 }, () => 0);
  const totals = {
    acKwh: 0,
    dcKwh: 0,
    shadeLossKwh: 0,
    mismatchLossKwh: 0,
    clippingLossKwh: 0,
    voltageCurrentLossKwh: 0,
    standbyLossKwh: 0,
  };

  for (let index = 0; index < weatherSamples.length; index++) {
    const sample = weatherSamples[index];
    const date = new Date(sample.timestamp);
    if (date.getUTCFullYear() !== year) continue;
    const solar = calculateSolarPosition(date, project.location);
    const weather = normalizeWeather(sample, solar);
    const shadows = buildShadowFeatureCollection(project.scene.objects, solar, { timestamp: date });
    const shadeResults = estimateArrayShadeFactors(project.pv.arrays, project.pv.panelTypes, shadows);
    const arrayInputs = new Map(
      project.pv.arrays.map((array) => [
        array.id,
        {
          poa: calculatePlaneOfArrayIrradiance(weather, solar, array),
          shadeFactor: shadeResults.find((item) => item.arrayId === array.id)?.shadeFactor ?? 0,
        },
      ]),
    );
    const electrical = simulateProjectElectricalHour(project, arrayInputs, weather.temperatureC, weather.windSpeedMs);
    const hours = sampleDurationHours(weatherSamples, index);
    const month = date.getUTCMonth();
    const acKwh = electrical.pAcW * hours * WATT_HOURS_TO_KWH;

    totals.acKwh += acKwh;
    totals.dcKwh += electrical.pDcW * hours * WATT_HOURS_TO_KWH;
    totals.shadeLossKwh += electrical.shadeLossW * hours * WATT_HOURS_TO_KWH;
    totals.mismatchLossKwh += electrical.mismatchLossW * hours * WATT_HOURS_TO_KWH;
    totals.clippingLossKwh += electrical.clippingLossW * hours * WATT_HOURS_TO_KWH;
    totals.voltageCurrentLossKwh +=
      (electrical.voltageLimitedLossW + electrical.currentLimitedLossW) * hours * WATT_HOURS_TO_KWH;
    totals.standbyLossKwh += electrical.standbyLossW * hours * WATT_HOURS_TO_KWH;
    monthlyAcKwh[month] += acKwh;
  }

  return {
    year,
    ...totals,
    monthlyAcKwh,
    samples: weatherSamples.length,
    weatherSource: options.weatherSamples ? 'provided' : 'open-meteo-archive',
    elapsedMs: performance.now() - startedAt,
  };
}

export async function runAnnualSimulation(
  project: Project,
  options: AnnualSimulationOptions & { useWorker?: boolean } = {},
): Promise<AnnualSimulationResult> {
  if (options.useWorker === false || typeof Worker === 'undefined') {
    return simulateProjectYear(project, options);
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./annualSimulation.worker.ts', import.meta.url), { type: 'module' });
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error('Jaarberekening duurde te lang'));
    }, 60_000);

    worker.onmessage = (event: MessageEvent<{ result?: AnnualSimulationResult; error?: string }>) => {
      window.clearTimeout(timeout);
      worker.terminate();
      if (event.data.error) reject(new Error(event.data.error));
      else if (event.data.result) resolve(event.data.result);
      else reject(new Error('Ongeldig worker-resultaat'));
    };
    worker.onerror = (event) => {
      window.clearTimeout(timeout);
      worker.terminate();
      reject(new Error(event.message));
    };
    worker.postMessage({ project, options: { year: options.year ?? 2025 } });
  });
}
