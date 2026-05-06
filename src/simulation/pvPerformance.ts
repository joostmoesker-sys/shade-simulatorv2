import type { Inverter, MPPT, PanelType, Project, PVArray, WiringString } from '../model/schema';
import type { PlaneOfArrayIrradiance } from './irradiance';

export interface PanelElectricalResult {
  pDcW: number;
  vmpV: number;
  impA: number;
  cellTemperatureC: number;
  unshadedPDcW: number;
}

export interface StringElectricalResult {
  pDcW: number;
  vmpV: number;
  impA: number;
  unshadedPDcW: number;
  mismatchLossW: number;
}

export interface MPPTElectricalResult {
  pDcW: number;
  clippingLossW: number;
  mismatchLossW: number;
  voltageLimitedLossW: number;
  currentLimitedLossW: number;
  stringCount: number;
}

export interface InverterElectricalResult {
  pAcW: number;
  pDcW: number;
  clippingLossW: number;
  mismatchLossW: number;
  voltageLimitedLossW: number;
  currentLimitedLossW: number;
  standbyLossW: number;
}

export interface ProjectElectricalHourResult extends InverterElectricalResult {
  shadeLossW: number;
  arrayDcW: Record<string, number>;
}

const STC_IRRADIANCE_WM2 = 1000;
const CURVE_INTERPOLATION_EPSILON = 1e-9;
const BYPASS_DIODE_DROP_V = 0.5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function panelCellTemperatureC(poaWm2: number, ambientC: number, windSpeedMs: number): number {
  return ambientC + (poaWm2 / 800) * 25 - Math.min(8, windSpeedMs * 1.5);
}

export function calculatePanelElectricalOutput(
  panelType: PanelType,
  poa: PlaneOfArrayIrradiance,
  shadeFactor: number,
  ambientC: number,
  windSpeedMs: number,
): PanelElectricalResult {
  const usableIrradianceWm2 = Math.max(0, poa.totalWm2);
  const shadeMultiplier = 1 - clamp(shadeFactor, 0, 0.98);
  const cellTemperatureC = panelCellTemperatureC(usableIrradianceWm2, ambientC, windSpeedMs);
  const tempMultiplier = Math.max(0, 1 + (panelType.tempCoeffPmaxPctPerC / 100) * (cellTemperatureC - 25));
  const unshadedPDcW = panelType.pmaxW * (usableIrradianceWm2 / STC_IRRADIANCE_WM2) * tempMultiplier;
  const pDcW = unshadedPDcW * shadeMultiplier;
  const vmpTempCoeff = panelType.tempCoeffVocPctPerC * 0.8;
  const vmpV = Math.max(0.1, panelType.vmpV * (1 + (vmpTempCoeff / 100) * (cellTemperatureC - 25)));
  return {
    pDcW,
    vmpV,
    impA: pDcW / vmpV,
    cellTemperatureC,
    unshadedPDcW,
  };
}

export function calculateStringElectricalOutput(panels: PanelElectricalResult[]): StringElectricalResult {
  if (panels.length === 0) {
    return { pDcW: 0, vmpV: 0, impA: 0, unshadedPDcW: 0, mismatchLossW: 0 };
  }
  const vmpV = panels.reduce((sum, panel) => sum + panel.vmpV, 0);
  const impA = panels.reduce((min, panel) => Math.min(min, panel.impA), Number.POSITIVE_INFINITY);
  const rawPDcW = panels.reduce((sum, panel) => sum + panel.pDcW, 0);
  const unshadedPDcW = panels.reduce((sum, panel) => sum + panel.unshadedPDcW, 0);
  const pDcW = vmpV * (Number.isFinite(impA) ? impA : 0);
  return {
    pDcW,
    vmpV,
    impA: Number.isFinite(impA) ? impA : 0,
    unshadedPDcW,
    mismatchLossW: Math.max(0, rawPDcW - pDcW),
  };
}

export function calculateMPPTElectricalOutput(mppt: MPPT, strings: StringElectricalResult[]): MPPTElectricalResult {
  let voltageLimitedLossW = 0;
  let usablePowerW = 0;
  let parallelCurrentA = 0;
  let mismatchLossW = 0;

  for (const string of strings) {
    mismatchLossW += string.mismatchLossW;
    if (string.vmpV < mppt.vMinV || string.vmpV > mppt.vMaxV || string.vmpV < mppt.vStartV) {
      voltageLimitedLossW += string.pDcW;
      continue;
    }
    usablePowerW += string.pDcW;
    parallelCurrentA += string.impA;
  }

  const currentMultiplier = parallelCurrentA > mppt.iMaxA ? mppt.iMaxA / parallelCurrentA : 1;
  const currentLimitedPowerW = usablePowerW * currentMultiplier;
  const currentLimitedLossW = Math.max(0, usablePowerW - currentLimitedPowerW);
  const pDcW = Math.min(currentLimitedPowerW, mppt.pMaxW);

  return {
    pDcW,
    clippingLossW: Math.max(0, currentLimitedPowerW - pDcW),
    mismatchLossW,
    voltageLimitedLossW,
    currentLimitedLossW,
    stringCount: strings.length,
  };
}

export function calculateInverterElectricalOutput(
  inverter: Inverter,
  mppts: MPPTElectricalResult[],
): InverterElectricalResult {
  const rawDcW = mppts.reduce((sum, mppt) => sum + mppt.pDcW, 0);
  const dcLimitedW = Math.min(rawDcW, inverter.pDcMaxW);
  const acBeforeLimitW = dcLimitedW * inverter.efficiency;
  const pAcW = Math.min(acBeforeLimitW, inverter.pAcMaxW);
  return {
    pAcW,
    pDcW: dcLimitedW,
    clippingLossW:
      mppts.reduce((sum, mppt) => sum + mppt.clippingLossW, 0) +
      Math.max(0, rawDcW - dcLimitedW) +
      Math.max(0, acBeforeLimitW - pAcW),
    mismatchLossW: mppts.reduce((sum, mppt) => sum + mppt.mismatchLossW, 0),
    voltageLimitedLossW: mppts.reduce((sum, mppt) => sum + mppt.voltageLimitedLossW, 0),
    currentLimitedLossW: mppts.reduce((sum, mppt) => sum + mppt.currentLimitedLossW, 0),
    standbyLossW: rawDcW > 0 ? 0 : inverter.standbyW,
  };
}

export function simulateProjectElectricalHour(
  project: Project,
  arrayInputs: Map<string, { poa: PlaneOfArrayIrradiance; shadeFactor: number }>,
  ambientC: number,
  windSpeedMs: number,
): ProjectElectricalHourResult {
  const panelTypes = new Map(project.pv.panelTypes.map((panelType) => [panelType.id, panelType]));
  const arrays = new Map(project.pv.arrays.map((array) => [array.id, array]));
  const panelCache = new Map<string, PanelElectricalResult>();
  const arrayDcW: Record<string, number> = {};
  let shadeLossW = 0;

  const panelForRef = (array: PVArray, row: number, column: number): PanelElectricalResult | null => {
    const key = `${array.id}:${row}:${column}`;
    const cached = panelCache.get(key);
    if (cached) return cached;
    const panelType = panelTypes.get(array.panelTypeId);
    const input = arrayInputs.get(array.id);
    if (!panelType || !input) return null;
    const result = calculatePanelElectricalOutput(panelType, input.poa, input.shadeFactor, ambientC, windSpeedMs);
    panelCache.set(key, result);
    arrayDcW[array.id] = (arrayDcW[array.id] ?? 0) + result.pDcW;
    shadeLossW += Math.max(0, result.unshadedPDcW - result.pDcW);
    return result;
  };

  const stringOutput = (string: WiringString): StringElectricalResult => {
    const panels = string.panels.flatMap((panelRef) => {
      const array = arrays.get(panelRef.arrayId);
      const panel = array ? panelForRef(array, panelRef.row, panelRef.column) : null;
      return panel ? [panel] : [];
    });
    return calculateStringElectricalOutput(panels);
  };

  const inverterResults = project.electrical.inverters.map((inverter) => {
    const mpptResults = inverter.mppts.map((mppt) => {
      const wiring = project.electrical.wiring.find((item) => item.inverterId === inverter.id && item.mpptId === mppt.id);
      return calculateMPPTElectricalOutput(mppt, wiring?.strings.map(stringOutput) ?? []);
    });
    return calculateInverterElectricalOutput(inverter, mpptResults);
  });

  return {
    pAcW: inverterResults.reduce((sum, result) => sum + result.pAcW, 0),
    pDcW: inverterResults.reduce((sum, result) => sum + result.pDcW, 0),
    clippingLossW: inverterResults.reduce((sum, result) => sum + result.clippingLossW, 0),
    mismatchLossW: inverterResults.reduce((sum, result) => sum + result.mismatchLossW, 0),
    voltageLimitedLossW: inverterResults.reduce((sum, result) => sum + result.voltageLimitedLossW, 0),
    currentLimitedLossW: inverterResults.reduce((sum, result) => sum + result.currentLimitedLossW, 0),
    standbyLossW: inverterResults.reduce((sum, result) => sum + result.standbyLossW, 0),
    shadeLossW,
    arrayDcW,
  };
}

// ---------------------------------------------------------------------------
// I–V / P–V curve generation
// ---------------------------------------------------------------------------

export interface IVPoint {
  /** Voltage (V) */
  v: number;
  /** Current (A) */
  i: number;
  /** Power (W) */
  p: number;
}

export interface IVCurveResult {
  /** Unshaded I–V / P–V operating points. */
  unshaded: IVPoint[];
  /** Shaded I–V / P–V operating points (shade factor applied). */
  shaded: IVPoint[];
  /** Temperature- and irradiance-corrected Voc (V). */
  vocV: number;
  /** Unshaded short-circuit current (A). */
  iscA: number;
  /** Unshaded maximum-power voltage (V). */
  vmppV: number;
  /** Unshaded maximum-power current (A). */
  imppA: number;
  /** Shaded short-circuit current (A). */
  iscShadedA: number;
  /** Number of panels in the series string (used to scale the voltage axis). */
  panelsInSeries: number;
  /** Actual maximum-power voltage (V) of the shaded/operating curve. */
  mppV: number;
  /** Actual maximum-power current (A) of the shaded/operating curve. */
  mppA: number;
  /** Actual maximum power (W) of the shaded/operating curve. */
  mppW: number;
}

/**
 * Build an I–V / P–V curve for a single panel (or a uniform series string of
 * identical panels) using the simplified single-diode approximation.
 *
 * The shaded curve is produced by scaling Isc and Impp down by
 * `(1 − shadeFactor)`, which is the physical effect of proportional
 * irradiance reduction across all cells in the string (bypass-diode model
 * simplification). Voc is kept constant for visualisation purposes
 * (its actual log-scale decrease is < 2 % at 50 % shade and invisible on a
 * chart).
 *
 * @param panelsInSeries – number of identical panels wired in series; scales
 *   the voltage axis while keeping the current axis unchanged.
 * @param pointCount – number of (V, I, P) samples to generate; 80 gives a
 *   smooth curve while remaining lightweight.
 */
export function buildPanelIVCurve(
  panelType: PanelType,
  poa: PlaneOfArrayIrradiance,
  shadeFactor: number,
  ambientC: number,
  windSpeedMs: number,
  panelsInSeries = 1,
  pointCount = 80,
): IVCurveResult {
  const emptyResult: IVCurveResult = {
    unshaded: [],
    shaded: [],
    vocV: 0,
    iscA: 0,
    vmppV: 0,
    imppA: 0,
    iscShadedA: 0,
    panelsInSeries,
    mppV: 0,
    mppA: 0,
    mppW: 0,
  };

  const irr = Math.max(0, poa.totalWm2);
  if (irr < 5) return emptyResult;

  const irrFrac = irr / STC_IRRADIANCE_WM2;
  const cellTemp = panelCellTemperatureC(irr, ambientC, windSpeedMs);
  const dT = cellTemp - 25;

  // Temperature-corrected voltages (current has a negligible temp coefficient
  // for the purposes of a visual curve – typically +0.04 %/°C for Isc).
  const vmpTempCoeff = panelType.tempCoeffVocPctPerC * 0.8;
  const vocSingle = Math.max(0.1, panelType.vocV * (1 + (panelType.tempCoeffVocPctPerC / 100) * dT));
  const vmppSingle = Math.max(0.05, panelType.vmpV * (1 + (vmpTempCoeff / 100) * dT));

  // String voltages
  const vocV = vocSingle * panelsInSeries;
  const vmppV = vmppSingle * panelsInSeries;

  // Irradiance-scaled currents (temperature effect on Isc ≈ 0.04 %/°C – omitted)
  const iscA = panelType.iscA * irrFrac;
  const imppA = panelType.impA * irrFrac;
  const shadeMultiplier = 1 - clamp(shadeFactor, 0, 0.98);
  const iscShadedA = iscA * shadeMultiplier;
  const imppShadedA = imppA * shadeMultiplier;

  const unshaded = buildSingleDiodeCurve(vocV, vmppV, iscA, imppA, pointCount);
  const shaded =
    shadeFactor > 0 && panelType.bypassDiodes > 1
      ? buildBypassPanelCurve(
          panelType.bypassDiodes,
          vocSingle,
          vmppSingle,
          iscA,
          imppA,
          shadeMultiplier,
          shadeFactor,
          panelsInSeries,
          pointCount,
        )
      : buildSingleDiodeCurve(vocV, vmppV, iscShadedA, imppShadedA, pointCount);
  const mpp = findCurveMPP(shaded.length > 0 ? shaded : unshaded);

  return {
    unshaded,
    shaded,
    vocV,
    iscA,
    vmppV,
    imppA,
    iscShadedA,
    panelsInSeries,
    mppV: mpp.v,
    mppA: mpp.i,
    mppW: mpp.p,
  };
}

/**
 * Simplified single-diode model:
 *   I(V) = Isc · (1 − exp((V − Voc) / Vt))
 * where Vt is derived from the MPP constraint:
 *   Vt = (Voc − Vmpp) / ln(Isc / (Isc − Impp))
 */
function buildSingleDiodeCurve(vocV: number, vmppV: number, iscA: number, imppA: number, pointCount: number): IVPoint[] {
  if (iscA < 1e-6 || imppA < 1e-6 || imppA >= iscA) return [];
  const vt = (vocV - vmppV) / Math.log(iscA / (iscA - imppA));
  if (!Number.isFinite(vt) || vt <= 0) return [];
  const pts: IVPoint[] = [];
  for (let k = 0; k <= pointCount; k++) {
    const v = (k / pointCount) * vocV;
    const i = Math.max(0, iscA * (1 - Math.exp((v - vocV) / vt)));
    pts.push({ v, i, p: v * i });
  }
  return pts;
}

function buildBypassPanelCurve(
  bypassDiodes: number,
  vocSingle: number,
  vmppSingle: number,
  iscA: number,
  imppA: number,
  shadeMultiplier: number,
  shadeFactor: number,
  panelsInSeries: number,
  pointCount: number,
): IVPoint[] {
  const sections = Math.max(1, Math.round(bypassDiodes));
  const totalSections = Math.max(1, Math.round(panelsInSeries) * sections);
  const shadedSections = Math.min(totalSections, Math.max(1, Math.ceil(clamp(shadeFactor, 0, 0.98) * totalSections)));
  const sectionVoc = vocSingle / sections;
  const sectionVmpp = vmppSingle / sections;
  const sectionCurves = Array.from({ length: totalSections }, (_, sectionIndex) => {
    const currentMultiplier = sectionIndex < shadedSections ? shadeMultiplier : 1;
    return buildSingleDiodeCurve(sectionVoc, sectionVmpp, iscA * currentMultiplier, imppA * currentMultiplier, pointCount);
  });
  return seriesCurve(sectionCurves, pointCount, BYPASS_DIODE_DROP_V);
}

function findCurveMPP(points: IVPoint[]): IVPoint {
  return points.reduce<IVPoint>((best, point) => (point.p > best.p ? point : best), { v: 0, i: 0, p: 0 });
}

function safeDivide(numerator: number, denominator: number): number {
  return numerator / Math.max(CURVE_INTERPOLATION_EPSILON, denominator);
}

function currentAtVoltage(sorted: IVPoint[], voltage: number): number {
  if (voltage <= sorted[0].v) return sorted[0].i;
  if (voltage >= sorted[sorted.length - 1].v) return 0;
  for (let index = 0; index < sorted.length - 1; index++) {
    const left = sorted[index];
    const right = sorted[index + 1];
    if (voltage >= left.v && voltage <= right.v) {
      const fraction = safeDivide(voltage - left.v, right.v - left.v);
      return left.i + fraction * (right.i - left.i);
    }
  }
  return 0;
}

function voltageAtCurrent(sorted: IVPoint[], current: number, bypassDropV = 0): number {
  if (current >= sorted[0].i) return bypassDropV > 0 ? -bypassDropV : sorted[0].v;
  if (current <= sorted[sorted.length - 1].i) return sorted[sorted.length - 1].v;
  for (let index = 0; index < sorted.length - 1; index++) {
    const high = sorted[index];
    const low = sorted[index + 1];
    if (current <= high.i && current >= low.i) {
      const fraction = safeDivide(high.i - current, high.i - low.i);
      return high.v + fraction * (low.v - high.v);
    }
  }
  return 0;
}

function seriesCurve(curves: IVPoint[][], pointCount: number, bypassDropV = BYPASS_DIODE_DROP_V): IVPoint[] {
  const usable = curves.filter((curve) => curve.length > 0);
  if (usable.length === 0) return [];
  const sortedCurves = usable.map((curve) => curve.slice().sort((a, b) => b.i - a.i));
  const maxCurrent = Math.max(...sortedCurves.map((curve) => curve[0].i));
  const points: IVPoint[] = [];
  for (let step = pointCount; step >= 0; step--) {
    const i = (step / pointCount) * maxCurrent;
    const v = Math.max(0, sortedCurves.reduce((sum, curve) => sum + voltageAtCurrent(curve, i, bypassDropV), 0));
    points.push({ v, i, p: v * i });
  }
  return points.sort((a, b) => a.v - b.v);
}

function parallelCurve(curves: IVPoint[][], pointCount: number): IVPoint[] {
  const usable = curves.filter((curve) => curve.length > 0);
  if (usable.length === 0) return [];
  const sortedCurves = usable.map((curve) => curve.slice().sort((a, b) => a.v - b.v));
  const maxVoltage = Math.min(...sortedCurves.map((curve) => curve[curve.length - 1].v));
  const points: IVPoint[] = [];
  for (let step = 0; step <= pointCount; step++) {
    const v = (step / pointCount) * maxVoltage;
    const i = sortedCurves.reduce((sum, curve) => sum + currentAtVoltage(curve, v), 0);
    points.push({ v, i, p: v * i });
  }
  return points;
}

export function buildMPPTIVCurve(
  project: Project,
  inverterId: string,
  mpptId: string,
  arrayInputs: Map<string, { poa: PlaneOfArrayIrradiance; shadeFactor: number }>,
  ambientC: number,
  windSpeedMs: number,
  pointCount = 80,
): IVCurveResult | null {
  const panelTypes = new Map(project.pv.panelTypes.map((panelType) => [panelType.id, panelType]));
  const arrays = new Map(project.pv.arrays.map((array) => [array.id, array]));
  const wiring = project.electrical.wiring.find((item) => item.inverterId === inverterId && item.mpptId === mpptId);
  if (!wiring || wiring.strings.length === 0) return null;
  const panelsInSeries = Math.max(...wiring.strings.map((string) => string.panels.length));

  const buildStringCurves = (shadeOverride?: number): IVPoint[][] =>
    wiring.strings.flatMap((string) => {
      const panelCurves = string.panels.flatMap((panelRef) => {
        const array = arrays.get(panelRef.arrayId);
        const panelType = array ? panelTypes.get(array.panelTypeId) : undefined;
        const input = arrayInputs.get(panelRef.arrayId);
        if (!panelType || !input) return [];
        const shadeFactor = shadeOverride ?? input.shadeFactor;
        return [buildPanelIVCurve(panelType, input.poa, shadeFactor, ambientC, windSpeedMs, 1, pointCount).shaded];
      });
      const curve = seriesCurve(panelCurves, pointCount);
      return curve.length > 0 ? [curve] : [];
    });

  const unshaded = parallelCurve(buildStringCurves(0), pointCount);
  const shaded = parallelCurve(buildStringCurves(), pointCount);
  if (unshaded.length === 0 || shaded.length === 0) return null;
  const mpp = findCurveMPP(shaded);
  return {
    unshaded,
    shaded,
    vocV: unshaded[unshaded.length - 1].v,
    iscA: unshaded[0].i,
    vmppV: findCurveMPP(unshaded).v,
    imppA: findCurveMPP(unshaded).i,
    iscShadedA: shaded[0].i,
    panelsInSeries,
    mppV: mpp.v,
    mppA: mpp.i,
    mppW: mpp.p,
  };
}
