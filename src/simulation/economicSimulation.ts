import type { Battery, ElectricVehicleProfile, LoadProfile, Project, TariffProfile } from '../model/schema';
import type { HourlyWeatherSample } from './weather';

const SOC_STEPS = 96;
const TERMINAL_PENALTY_EUR_PER_KWH = 1000;
const EPSILON_KWH = 1e-7;
const TARGET_SOC_FRACTION = 0.5;
const DEFAULT_GRID_EXPORT_KW = 17;

// 2025 NL EPEX Spot / ENTSO-E day-ahead actual monthly average prices (EUR/MWh).
// Source: ENTSO-E Transparency Platform, Netherlands bidding zone (BZN|NL), 2025.
const NL_MONTHLY_AVG_EUR_MWH_2025 = [
  105.26, // Jan – cold winter, high gas demand
  121.56, // Feb – peak winter prices
   88.61, // Mar
   74.46, // Apr
   61.36, // May
   67.84, // Jun
   83.21, // Jul
   73.26, // Aug
   73.82, // Sep
   39.91, // Oct
    7.41, // Nov – unusually low (mild weather + renewables surplus)
   64.19, // Dec
] as const;

// Intra-day shape profiles (dimensionless) per calendar month (0=Jan … 11=Dec).
// Calibrated from observed 2025 NL EPEX Spot daily price patterns:
//   - Winter: pronounced double peak (morning 7–8h, evening 18–20h).
//   - Summer: near-zero midday (10–14h) due to solar PV overproduction.
//   - November: near-flat at very low absolute level.
// Weekend prices are typically ~10% lower; applied in generateEconomicTariffs().
const NL_INTRADAY_SHAPE_2025 = [
  // Jan – winter double peak
  [0.62, 0.56, 0.52, 0.50, 0.52, 0.68, 1.03, 1.39, 1.36, 1.16, 1.03, 0.96, 0.93, 0.91, 0.93, 1.06, 1.27, 1.54, 1.60, 1.47, 1.30, 1.10, 0.89, 0.73],
  // Feb – peak winter
  [0.60, 0.54, 0.51, 0.49, 0.51, 0.66, 1.01, 1.41, 1.39, 1.19, 1.06, 0.98, 0.95, 0.93, 0.95, 1.08, 1.30, 1.58, 1.64, 1.51, 1.33, 1.13, 0.92, 0.75],
  // Mar – transitional
  [0.64, 0.58, 0.54, 0.52, 0.55, 0.72, 0.95, 1.22, 1.16, 0.98, 0.82, 0.74, 0.70, 0.68, 0.74, 0.94, 1.20, 1.45, 1.54, 1.44, 1.26, 1.06, 0.88, 0.72],
  // Apr – spring, solar midday dip developing
  [0.66, 0.59, 0.55, 0.53, 0.56, 0.74, 0.96, 1.18, 1.08, 0.88, 0.70, 0.60, 0.56, 0.54, 0.60, 0.82, 1.12, 1.42, 1.52, 1.42, 1.22, 1.02, 0.86, 0.72],
  // May – solar strongly drives midday prices near zero
  [0.68, 0.60, 0.56, 0.54, 0.57, 0.76, 0.98, 1.12, 0.96, 0.74, 0.54, 0.44, 0.40, 0.40, 0.50, 0.76, 1.08, 1.44, 1.56, 1.46, 1.26, 1.06, 0.88, 0.74],
  // Jun – summer, near-zero midday prices (solar surplus)
  [0.74, 0.66, 0.62, 0.60, 0.64, 0.82, 0.96, 0.90, 0.70, 0.44, 0.22, 0.10, 0.06, 0.06, 0.16, 0.50, 0.98, 1.50, 1.72, 1.62, 1.46, 1.24, 1.04, 0.90],
  // Jul – peak summer, strong evening peak
  [0.72, 0.64, 0.60, 0.58, 0.62, 0.80, 0.94, 0.88, 0.68, 0.42, 0.20, 0.08, 0.04, 0.04, 0.14, 0.48, 0.96, 1.52, 1.74, 1.64, 1.48, 1.26, 1.06, 0.92],
  // Aug – late summer
  [0.73, 0.65, 0.61, 0.59, 0.63, 0.81, 0.95, 0.90, 0.72, 0.48, 0.26, 0.12, 0.07, 0.07, 0.17, 0.52, 1.00, 1.52, 1.73, 1.63, 1.46, 1.24, 1.04, 0.90],
  // Sep – early autumn, moderate solar effect
  [0.68, 0.60, 0.56, 0.54, 0.57, 0.76, 0.96, 1.10, 1.04, 0.90, 0.76, 0.66, 0.62, 0.60, 0.66, 0.86, 1.14, 1.44, 1.54, 1.44, 1.26, 1.06, 0.88, 0.74],
  // Oct – autumn
  [0.68, 0.62, 0.58, 0.56, 0.58, 0.74, 0.94, 1.14, 1.10, 0.97, 0.84, 0.77, 0.74, 0.72, 0.77, 0.94, 1.20, 1.47, 1.57, 1.47, 1.30, 1.10, 0.92, 0.76],
  // Nov – near-zero average; shape retained but absolute values are tiny
  [0.72, 0.66, 0.62, 0.60, 0.62, 0.78, 0.98, 1.14, 1.10, 1.00, 0.90, 0.84, 0.80, 0.78, 0.80, 0.92, 1.12, 1.38, 1.48, 1.40, 1.24, 1.06, 0.92, 0.80],
  // Dec – return to winter
  [0.61, 0.55, 0.51, 0.49, 0.51, 0.67, 1.01, 1.37, 1.34, 1.14, 1.01, 0.94, 0.91, 0.89, 0.91, 1.04, 1.24, 1.51, 1.57, 1.44, 1.27, 1.07, 0.87, 0.71],
] as const;

// Pre-compute hour × month reference prices (EUR/kWh) from the real 2025 NL data.
// Each row is normalised so its mean equals the actual monthly average.
const NL_DAY_AHEAD_2025_EUR_KWH: ReadonlyArray<ReadonlyArray<number>> = NL_INTRADAY_SHAPE_2025.map(
  (shape, month) => {
    const shapeSum = (shape as readonly number[]).reduce((a, b) => a + b, 0);
    const avgEurKwh = NL_MONTHLY_AVG_EUR_MWH_2025[month] / 1000;
    return (shape as readonly number[]).map((s) => Math.max(0, (s / shapeSum) * 24 * avgEurKwh));
  },
);

export interface EconomicSimulationResult {
  version: 'v4-euro-optimizer';
  annualSavingsEur: number;
  baselineCostEur: number;
  importCostEur: number;
  exportRevenueEur: number;
  importKwh: number;
  exportKwh: number;
  selfConsumedKwh: number;
  selfConsumptionPct: number;
  batteryChargedKwh: number;
  batteryDischargedKwh: number;
  batteryCycles: number;
  monthlySavingsEur: number[];
  monthlyImportCostEur: number[];
  monthlyRevenueEur: number[];
  dispatchSample: Array<{ hour: number; socKwh: number; chargeKwh: number; dischargeKwh: number; priceEurPerKwh: number; action: string }>;
  diagnostics: {
    finalSocKwh: number;
    socStepKwh: number;
    curtailedPvKwh: number;
    evLoadKwh: number;
    baseLoadKwh: number;
    heatPumpLoadKwh: number;
  };
}

interface TransitionParams {
  batCapKwh: number;
  socMinKwh: number;
  socMaxKwh: number;
  allowGridPrecharge: boolean;
  allowGridExport: boolean;
  chargePowerKw: number;
  dischargePowerKw: number;
  chargeEff: number;
  dischargeEff: number;
  maxGridExportKw: number;
}

function dayOfYear(date: Date): number {
  return Math.floor(
    (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) -
      Date.UTC(date.getUTCFullYear(), 0, 0)) /
      86_400_000,
  );
}

function normalizedShape(shape: LoadProfile['shape']): number[] {
  const shapes: Record<LoadProfile['shape'], number[]> = {
    flat: Array.from({ length: 24 }, () => 1),
    morning_peak: [0.4, 0.35, 0.32, 0.32, 0.38, 0.7, 1.3, 1.8, 1.7, 1.2, 0.9, 0.8, 0.75, 0.75, 0.8, 0.9, 1.0, 1.15, 1.25, 1.15, 0.9, 0.75, 0.6, 0.5],
    evening_peak: [0.45, 0.36, 0.32, 0.32, 0.34, 0.45, 0.9, 1.25, 1.15, 0.95, 0.85, 0.8, 0.78, 0.78, 0.8, 0.9, 1.05, 1.3, 1.65, 1.8, 1.55, 1.25, 0.9, 0.65],
    work_from_home: [0.45, 0.36, 0.34, 0.34, 0.38, 0.5, 0.85, 1.05, 1.1, 1.15, 1.2, 1.15, 1.1, 1.1, 1.12, 1.15, 1.2, 1.25, 1.35, 1.3, 1.1, 0.85, 0.65, 0.5],
  };
  const values = shapes[shape];
  const sum = values.reduce((total, value) => total + value, 0);
  return values.map((value) => value / sum);
}

function isChargingHour(hour: number, ev: ElectricVehicleProfile): boolean {
  if (ev.chargeStartHour <= ev.chargeEndHour) {
    return hour >= ev.chargeStartHour && hour <= ev.chargeEndHour;
  }
  return hour >= ev.chargeStartHour || hour <= ev.chargeEndHour;
}

export function buildHourlyLoadProfile(project: Project, samples: HourlyWeatherSample[]): {
  loadKwh: number[];
  evLoadKwh: number;
  baseLoadKwh: number;
  heatPumpLoadKwh: number;
} {
  const loadKwh = Array.from({ length: samples.length }, () => 0);
  let baseLoadKwh = 0;
  let heatPumpLoadKwh = 0;
  let evLoadKwh = 0;

  for (const profile of project.loads.base) {
    const shape = normalizedShape(profile.shape);
    const dailyKwh = profile.annualKwh / 365;
    samples.forEach((sample, index) => {
      const date = new Date(sample.timestamp);
      const variation = 1 + 0.05 * Math.sin(dayOfYear(date) * 2.3 + 0.7);
      const kwh = dailyKwh * variation * shape[date.getUTCHours()];
      loadKwh[index] += kwh;
      baseLoadKwh += kwh;
    });
  }

  for (const heatPump of project.loads.heatPumps) {
    samples.forEach((sample, index) => {
      const date = new Date(sample.timestamp);
      const outdoor = sample.temperatureC ?? 10;
      const heatFrac = Math.max(0, Math.min(1.35, (heatPump.heatingBaseTempC - outdoor) / (heatPump.heatingBaseTempC + 5)));
      const hourShape = date.getUTCHours() >= 15 || date.getUTCHours() <= 8 ? 1.25 : 0.55;
      const kwh = (heatPump.winterDayKwh / 24) * heatFrac * hourShape;
      loadKwh[index] += kwh;
      heatPumpLoadKwh += kwh;
    });
  }

  for (const ev of project.loads.electricVehicles) {
    const days = new Map<string, number[]>();
    samples.forEach((sample, index) => {
      const day = sample.timestamp.slice(0, 10);
      days.set(day, [...(days.get(day) ?? []), index]);
    });
    for (const indexes of days.values()) {
      const date = new Date(samples[indexes[0]].timestamp);
      const dayUse = date.getUTCDay() === 0 || date.getUTCDay() === 6 ? ev.weekendUseKwh : ev.weekdayUseKwh;
      const chargeIndexes = indexes.filter((index) => isChargingHour(new Date(samples[index].timestamp).getUTCHours(), ev));
      const targetIndexes = chargeIndexes.length > 0 ? chargeIndexes : indexes;
      const perHour = dayUse / targetIndexes.length;
      for (const index of targetIndexes) {
        const capped = Math.min(ev.chargePowerKw, perHour);
        loadKwh[index] += capped;
        evLoadKwh += capped;
      }
    }
  }

  return { loadKwh, evLoadKwh, baseLoadKwh, heatPumpLoadKwh };
}

export function generateEconomicTariffs(samples: HourlyWeatherSample[], tariff?: TariffProfile): {
  buy: number[];
  sell: number[];
} {
  const buy: number[] = [];
  const sell: number[] = [];
  for (const sample of samples) {
    const date = new Date(sample.timestamp);
    if (!tariff || tariff.dynamic) {
      const month = date.getUTCMonth();
      const hour = date.getUTCHours();
      // Weekends typically ~10% lower than weekdays in 2025 NL day-ahead market.
      const weekendFactor = date.getUTCDay() === 0 || date.getUTCDay() === 6 ? 0.90 : 1.0;
      const apx = NL_DAY_AHEAD_2025_EUR_KWH[month][hour] * weekendFactor;
      buy.push(apx + (tariff?.energyTaxEurPerKwh ?? 0.1316) + 0.04);
      sell.push(apx + (tariff?.staticExportEurPerKwh ?? 0));
    } else {
      buy.push(tariff.staticImportEurPerKwh + tariff.energyTaxEurPerKwh);
      sell.push(tariff.staticExportEurPerKwh);
    }
  }
  return { buy, sell };
}

function evaluateTransition(
  pv: number,
  load: number,
  buyPrice: number,
  sellPrice: number,
  curSoc: number,
  nextSoc: number,
  params: TransitionParams,
) {
  if (nextSoc < params.socMinKwh - EPSILON_KWH || nextSoc > params.socMaxKwh + EPSILON_KWH) return null;
  const delta = nextSoc - curSoc;
  const selfDirect = Math.min(pv, load);
  let loadDeficit = Math.max(0, load - selfDirect);
  let surplusPv = Math.max(0, pv - selfDirect);
  let importGrid = loadDeficit;
  let importCost = importGrid * buyPrice;
  let revenue = 0;
  let pvExport = 0;
  let batteryExport = 0;
  let batteryExportRequest = 0;
  let selfBattery = 0;
  let pvChargeInput = 0;
  let gridChargeInput = 0;
  let batteryChargeStored = 0;
  let batteryDischargeDrawn = 0;
  let curtailedPv = 0;

  if (delta > EPSILON_KWH) {
    const totalStoreCap = Math.min(params.chargePowerKw * params.chargeEff, Math.max(0, params.socMaxKwh - curSoc));
    const pvStoreCap = Math.min(surplusPv * params.chargeEff, totalStoreCap);
    const gridStoreCap = params.allowGridPrecharge ? Math.min(params.chargePowerKw * params.chargeEff, totalStoreCap) : 0;
    if (delta > Math.min(totalStoreCap, pvStoreCap + gridStoreCap) + EPSILON_KWH) return null;
    let remainingStore = delta;
    let remainingInputCap = params.chargePowerKw;
    let pvStore = 0;
    let gridStore = 0;
    const pvOpportunityCost = params.allowGridExport && sellPrice > 0 ? sellPrice / params.chargeEff : 0;
    const gridStoredCost = buyPrice / params.chargeEff;
    if (gridStoredCost < pvOpportunityCost) {
      gridStore = Math.min(remainingStore, gridStoreCap, remainingInputCap * params.chargeEff);
      remainingStore -= gridStore;
      remainingInputCap -= gridStore / params.chargeEff;
    }
    pvStore = Math.min(remainingStore, pvStoreCap, remainingInputCap * params.chargeEff);
    remainingStore -= pvStore;
    remainingInputCap -= pvStore / params.chargeEff;
    gridStore += Math.min(remainingStore, gridStoreCap - gridStore, remainingInputCap * params.chargeEff);
    if (pvStore + gridStore + EPSILON_KWH < delta) return null;
    pvChargeInput = pvStore / params.chargeEff;
    gridChargeInput = gridStore / params.chargeEff;
    surplusPv = Math.max(0, surplusPv - pvChargeInput);
    importGrid += gridChargeInput;
    importCost += gridChargeInput * buyPrice;
    batteryChargeStored = delta;
  } else if (delta < -EPSILON_KWH) {
    const draw = -delta;
    if (draw > Math.max(0, curSoc - params.socMinKwh) + EPSILON_KWH) return null;
    const delivered = draw * params.dischargeEff;
    if (delivered > params.dischargePowerKw + EPSILON_KWH) return null;
    selfBattery = Math.min(delivered, loadDeficit);
    loadDeficit -= selfBattery;
    importGrid = loadDeficit;
    importCost = importGrid * buyPrice;
    const remainingDelivered = delivered - selfBattery;
    if (remainingDelivered > EPSILON_KWH) {
      if (!params.allowGridExport || loadDeficit > EPSILON_KWH || sellPrice <= 0) return null;
      batteryExportRequest = remainingDelivered;
    }
    batteryDischargeDrawn = draw;
  }

  let remainingGridExportCap = params.allowGridExport ? params.maxGridExportKw : 0;
  if (params.allowGridExport && sellPrice > 0 && surplusPv > EPSILON_KWH) {
    pvExport = Math.min(surplusPv, remainingGridExportCap);
    revenue += pvExport * sellPrice;
    remainingGridExportCap -= pvExport;
    curtailedPv = Math.max(0, surplusPv - pvExport);
  } else {
    curtailedPv = surplusPv;
  }
  if (batteryExportRequest > EPSILON_KWH) {
    if (batteryExportRequest > remainingGridExportCap + EPSILON_KWH) return null;
    batteryExport = batteryExportRequest;
    revenue += batteryExport * sellPrice;
  }

  return {
    cashflow: revenue - importCost,
    selfDirect,
    selfBattery,
    pvExport,
    batteryExport,
    importGrid,
    importCost,
    revenue,
    pvChargeInput,
    gridChargeInput,
    batteryChargeStored,
    batteryDischargeDrawn,
    curtailedPv,
  };
}

export function simulateV4Economics(
  pvKwh: number[],
  loadKwh: number[],
  buyTariffs: number[],
  sellTariffs: number[],
  battery: Battery | undefined,
  loadBreakdown = { evLoadKwh: 0, baseLoadKwh: 0, heatPumpLoadKwh: 0 },
): EconomicSimulationResult {
  const nH = Math.min(pvKwh.length, loadKwh.length, buyTariffs.length, sellTariffs.length);
  const baselineCost = loadKwh.slice(0, nH).reduce((sum, load, index) => sum + load * buyTariffs[index], 0);
  const batCapKwh = battery?.capacityKwh ?? 0;
  const useBattery = !!battery && batCapKwh > 0;
  const monthlyBaselineCost = Array.from({ length: 12 }, () => 0);
  const monthlyImportCost = Array.from({ length: 12 }, () => 0);
  const monthlyRevenue = Array.from({ length: 12 }, () => 0);
  const monthlySavings = Array.from({ length: 12 }, () => 0);

  if (!useBattery) {
    let importGrid = 0;
    let exportGrid = 0;
    let importCost = 0;
    let revenue = 0;
    let selfDirect = 0;
    for (let h = 0; h < nH; h++) {
      const month = new Date(Date.UTC(2025, 0, Math.floor(h / 24) + 1)).getUTCMonth();
      const direct = Math.min(pvKwh[h], loadKwh[h]);
      const imported = Math.max(0, loadKwh[h] - direct);
      const exported = Math.max(0, pvKwh[h] - direct);
      selfDirect += direct;
      importGrid += imported;
      exportGrid += exported;
      importCost += imported * buyTariffs[h];
      revenue += exported * sellTariffs[h];
      monthlyBaselineCost[month] += loadKwh[h] * buyTariffs[h];
      monthlyImportCost[month] += imported * buyTariffs[h];
      monthlyRevenue[month] += exported * sellTariffs[h];
    }
    for (let month = 0; month < 12; month++) monthlySavings[month] = monthlyBaselineCost[month] - (monthlyImportCost[month] - monthlyRevenue[month]);
    return {
      version: 'v4-euro-optimizer',
      annualSavingsEur: Math.round((baselineCost - (importCost - revenue)) * 100) / 100,
      baselineCostEur: Math.round(baselineCost * 100) / 100,
      importCostEur: Math.round(importCost * 100) / 100,
      exportRevenueEur: Math.round(revenue * 100) / 100,
      importKwh: importGrid,
      exportKwh: exportGrid,
      selfConsumedKwh: selfDirect,
      selfConsumptionPct: pvKwh.reduce((sum, pv) => sum + pv, 0) > 0 ? (100 * selfDirect) / pvKwh.reduce((sum, pv) => sum + pv, 0) : 0,
      batteryChargedKwh: 0,
      batteryDischargedKwh: 0,
      batteryCycles: 0,
      monthlySavingsEur: monthlySavings,
      monthlyImportCostEur: monthlyImportCost,
      monthlyRevenueEur: monthlyRevenue,
      dispatchSample: [],
      diagnostics: { finalSocKwh: 0, socStepKwh: 0, curtailedPvKwh: 0, ...loadBreakdown },
    };
  }

  const chargeEff = Math.sqrt(battery.roundTripEfficiency);
  const dischargeEff = Math.sqrt(battery.roundTripEfficiency);
  const states = SOC_STEPS + 1;
  const socStep = batCapKwh / SOC_STEPS;
  const minState = Math.ceil((batCapKwh * battery.socMin) / socStep);
  const maxState = Math.floor((batCapKwh * battery.socMax) / socStep);
  const initialState = Math.min(maxState, Math.max(minState, Math.round((batCapKwh * TARGET_SOC_FRACTION) / socStep)));
  const params: TransitionParams = {
    batCapKwh,
    socMinKwh: minState * socStep,
    socMaxKwh: maxState * socStep,
    allowGridPrecharge: battery.allowGridCharge,
    allowGridExport: battery.allowGridExport,
    chargePowerKw: battery.pChargeMaxKw,
    dischargePowerKw: battery.pDischargeMaxKw,
    chargeEff,
    dischargeEff,
    maxGridExportKw: DEFAULT_GRID_EXPORT_KW,
  };
  const maxChargeSteps = Math.min(states - 1, Math.ceil((battery.pChargeMaxKw * chargeEff) / socStep) + 1);
  const maxDischargeSteps = Math.min(states - 1, Math.ceil((battery.pDischargeMaxKw / dischargeEff) / socStep) + 1);
  let dpNext = new Float64Array(states);
  for (let state = 0; state < states; state++) {
    dpNext[state] = state < minState || state > maxState
      ? -1e15
      : -Math.abs(state - initialState) * socStep * TERMINAL_PENALTY_EUR_PER_KWH;
  }
  const policy = new Int16Array(nH * states);
  policy.fill(-1);

  for (let h = nH - 1; h >= 0; h--) {
    const dpCur = new Float64Array(states);
    dpCur.fill(-1e15);
    for (let state = minState; state <= maxState; state++) {
      const lo = Math.max(minState, state - maxDischargeSteps);
      const hi = Math.min(maxState, state + maxChargeSteps);
      let bestValue = -1e15;
      let bestNext = state;
      for (let nextState = lo; nextState <= hi; nextState++) {
        const flow = evaluateTransition(pvKwh[h], loadKwh[h], buyTariffs[h], sellTariffs[h], state * socStep, nextState * socStep, params);
        if (!flow) continue;
        const value = flow.cashflow + dpNext[nextState];
        if (value > bestValue) {
          bestValue = value;
          bestNext = nextState;
        }
      }
      dpCur[state] = bestValue;
      policy[h * states + state] = bestNext;
    }
    dpNext = dpCur;
  }

  let socState = initialState;
  let selfDirect = 0;
  let selfBattery = 0;
  let exportKwh = 0;
  let importKwh = 0;
  let batteryCharged = 0;
  let batteryDischarged = 0;
  let curtailedPv = 0;
  let revenue = 0;
  let importCost = 0;
  const dispatchSample: EconomicSimulationResult['dispatchSample'] = [];

  for (let h = 0; h < nH; h++) {
    const nextState = policy[h * states + socState] >= 0 ? policy[h * states + socState] : socState;
    const flow = evaluateTransition(pvKwh[h], loadKwh[h], buyTariffs[h], sellTariffs[h], socState * socStep, nextState * socStep, params);
    if (!flow) continue;
    const month = new Date(Date.UTC(2025, 0, Math.floor(h / 24) + 1)).getUTCMonth();
    monthlyBaselineCost[month] += loadKwh[h] * buyTariffs[h];
    monthlyImportCost[month] += flow.importCost;
    monthlyRevenue[month] += flow.revenue;
    selfDirect += flow.selfDirect;
    selfBattery += flow.selfBattery;
    exportKwh += flow.pvExport + flow.batteryExport;
    importKwh += flow.importGrid;
    batteryCharged += flow.batteryChargeStored;
    batteryDischarged += flow.batteryDischargeDrawn;
    curtailedPv += flow.curtailedPv;
    revenue += flow.revenue;
    importCost += flow.importCost;
    if (h >= 180 * 24 && h < 187 * 24) {
      dispatchSample.push({
        hour: h,
        socKwh: nextState * socStep,
        chargeKwh: flow.pvChargeInput + flow.gridChargeInput,
        dischargeKwh: flow.selfBattery + flow.batteryExport,
        priceEurPerKwh: buyTariffs[h],
        action: flow.selfBattery > 0 ? 'self' : flow.batteryExport > 0 ? 'export' : flow.gridChargeInput > 0 ? 'precharge' : flow.pvChargeInput > 0 ? 'charge' : 'idle',
      });
    }
    socState = nextState;
  }

  for (let month = 0; month < 12; month++) monthlySavings[month] = monthlyBaselineCost[month] - (monthlyImportCost[month] - monthlyRevenue[month]);
  const pvTotal = pvKwh.slice(0, nH).reduce((sum, pv) => sum + pv, 0);
  const selfConsumed = selfDirect + selfBattery;
  const batteryThroughput = (batteryCharged + batteryDischarged) / 2;

  return {
    version: 'v4-euro-optimizer',
    annualSavingsEur: Math.round((baselineCost - (importCost - revenue)) * 100) / 100,
    baselineCostEur: Math.round(baselineCost * 100) / 100,
    importCostEur: Math.round(importCost * 100) / 100,
    exportRevenueEur: Math.round(revenue * 100) / 100,
    importKwh,
    exportKwh,
    selfConsumedKwh: selfConsumed,
    selfConsumptionPct: pvTotal > 0 ? (100 * selfConsumed) / pvTotal : 0,
    batteryChargedKwh: batteryCharged,
    batteryDischargedKwh: batteryDischarged,
    batteryCycles: Math.round(batteryThroughput / (batCapKwh + 1e-9)),
    monthlySavingsEur: monthlySavings,
    monthlyImportCostEur: monthlyImportCost,
    monthlyRevenueEur: monthlyRevenue,
    dispatchSample,
    diagnostics: {
      finalSocKwh: Math.round(socState * socStep * 100) / 100,
      socStepKwh: Math.round(socStep * 100) / 100,
      curtailedPvKwh: Math.round(curtailedPv * 100) / 100,
      ...loadBreakdown,
    },
  };
}

export function simulateProjectEconomics(
  project: Project,
  pvKwh: number[],
  weatherSamples: HourlyWeatherSample[],
): EconomicSimulationResult {
  const load = buildHourlyLoadProfile(project, weatherSamples);
  const battery = project.storage.batteries[0];
  const standbyKwh = battery ? battery.standbyW / 1000 : 0;
  const loadKwh = load.loadKwh.map((value) => value + standbyKwh);
  const tariffs = generateEconomicTariffs(weatherSamples, project.tariffs[0]);
  return simulateV4Economics(pvKwh, loadKwh, tariffs.buy, tariffs.sell, battery, load);
}
