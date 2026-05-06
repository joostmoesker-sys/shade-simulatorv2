import { describe, expect, it } from 'vitest';

import type { Inverter, MPPT, PanelType } from '../../src/model/schema';
import {
  buildMPPTIVCurve,
  buildPanelIVCurve,
  calculateInverterElectricalOutput,
  calculateMPPTElectricalOutput,
  calculatePanelElectricalOutput,
  calculateStringElectricalOutput,
} from '../../src/simulation/pvPerformance';

const panelType: PanelType = {
  id: 'panel',
  manufacturer: 'Test',
  model: '400',
  pmaxW: 400,
  vmpV: 34,
  impA: 11.8,
  vocV: 41,
  iscA: 12.6,
  tempCoeffPmaxPctPerC: -0.35,
  tempCoeffVocPctPerC: -0.28,
  cells: 108,
  bypassDiodes: 3,
  widthM: 1.13,
  heightM: 1.72,
};

const mppt: MPPT = {
  id: 'mppt',
  name: 'MPPT',
  vMinV: 100,
  vMaxV: 500,
  vStartV: 75,
  iMaxA: 13,
  iScMaxA: 16,
  pMaxW: 6000,
};

const inverter: Inverter = {
  id: 'inv',
  name: 'Inverter',
  pAcNomW: 5000,
  pAcMaxW: 5000,
  pDcMaxW: 7000,
  pBatteryMaxW: 0,
  efficiency: 0.97,
  standbyW: 5,
  mppts: [mppt],
};

function countPowerPeaks(points: Array<{ p: number }>): number {
  const maxPower = Math.max(...points.map((point) => point.p));
  return points.reduce((count, point, index) => {
    const prev = points[index - 1];
    const next = points[index + 1];
    return prev && next && point.p > prev.p && point.p > next.p && point.p > maxPower * 0.05 ? count + 1 : count;
  }, 0);
}

describe('PV electrical performance', () => {
  it('applies irradiance, temperature and shade to panel output', () => {
    const sunny = calculatePanelElectricalOutput(
      panelType,
      { beamWm2: 800, diffuseWm2: 120, groundReflectedWm2: 20, totalWm2: 940, incidenceAngleDeg: 10 },
      0,
      20,
      2,
    );
    const shaded = calculatePanelElectricalOutput(
      panelType,
      { beamWm2: 800, diffuseWm2: 120, groundReflectedWm2: 20, totalWm2: 940, incidenceAngleDeg: 10 },
      0.5,
      20,
      2,
    );

    expect(sunny.pDcW).toBeGreaterThan(300);
    expect(shaded.pDcW).toBeCloseTo(sunny.pDcW * 0.5);
    expect(sunny.cellTemperatureC).toBeGreaterThan(20);
  });

  it('limits a string to the weakest panel current and records mismatch loss', () => {
    const string = calculateStringElectricalOutput([
      { pDcW: 340, vmpV: 34, impA: 10, cellTemperatureC: 35, unshadedPDcW: 340 },
      { pDcW: 170, vmpV: 34, impA: 5, cellTemperatureC: 35, unshadedPDcW: 340 },
    ]);

    expect(string.impA).toBe(5);
    expect(string.pDcW).toBe(340);
    expect(string.mismatchLossW).toBe(170);
  });

  it('applies MPPT and inverter limits', () => {
    const mpptResult = calculateMPPTElectricalOutput(mppt, [
      { pDcW: 4000, vmpV: 340, impA: 12, unshadedPDcW: 4000, mismatchLossW: 0 },
      { pDcW: 4000, vmpV: 340, impA: 12, unshadedPDcW: 4000, mismatchLossW: 0 },
    ]);
    const inverterResult = calculateInverterElectricalOutput(inverter, [mpptResult]);

    expect(mpptResult.currentLimitedLossW).toBeGreaterThan(0);
    expect(mpptResult.pDcW).toBeLessThan(8000);
    expect(inverterResult.pAcW).toBeLessThanOrEqual(inverter.pAcMaxW);
  });

  it('builds I–V / P–V curve with correct Isc, Voc and MPP properties', () => {
    const poa = { beamWm2: 800, diffuseWm2: 120, groundReflectedWm2: 20, totalWm2: 940, incidenceAngleDeg: 10 };
    const curve = buildPanelIVCurve(panelType, poa, 0, 20, 2);

    // Must produce curve points
    expect(curve.unshaded.length).toBeGreaterThan(0);
    // First point is near Isc at V≈0
    expect(curve.unshaded[0].v).toBeCloseTo(0, 0);
    expect(curve.unshaded[0].i).toBeCloseTo(curve.iscA, 1);
    // Last point is near Voc at I≈0
    const last = curve.unshaded[curve.unshaded.length - 1];
    expect(last.v).toBeCloseTo(curve.vocV, 0);
    expect(last.i).toBeCloseTo(0, 1);
    // Power curve has its peak somewhere in the middle
    const pmpp = Math.max(...curve.unshaded.map((pt) => pt.p));
    expect(pmpp).toBeGreaterThan(300);
    const vmppPoint = curve.unshaded.find((pt) => pt.p === pmpp);
    expect(vmppPoint!.v).toBeGreaterThan(0);
    expect(vmppPoint!.v).toBeLessThan(curve.vocV);
  });

  it('reduces Isc on shaded curve without changing Voc', () => {
    const poa = { beamWm2: 800, diffuseWm2: 120, groundReflectedWm2: 20, totalWm2: 940, incidenceAngleDeg: 10 };
    const unshaded = buildPanelIVCurve(panelType, poa, 0, 20, 2);
    const shaded = buildPanelIVCurve(panelType, poa, 0.5, 20, 2);

    // Isc should be halved
    expect(shaded.iscShadedA).toBeCloseTo(unshaded.iscA * 0.5, 2);
    // Voc is kept the same in the simplified model
    expect(shaded.vocV).toBeCloseTo(unshaded.vocV, 1);
    // Shaded curve has lower maximum power
    const pmppUnshaded = Math.max(...unshaded.unshaded.map((pt) => pt.p));
    const pmppShaded = Math.max(...shaded.shaded.map((pt) => pt.p));
    expect(pmppShaded).toBeLessThan(pmppUnshaded);
  });

  it('scales voltage axis proportionally for series string', () => {
    const poa = { beamWm2: 800, diffuseWm2: 120, groundReflectedWm2: 20, totalWm2: 940, incidenceAngleDeg: 10 };
    const single = buildPanelIVCurve(panelType, poa, 0, 20, 2, 1);
    const series10 = buildPanelIVCurve(panelType, poa, 0, 20, 2, 10);

    expect(series10.vocV).toBeCloseTo(single.vocV * 10, 0);
    expect(series10.vmppV).toBeCloseTo(single.vmppV * 10, 0);
    // Current axis unchanged
    expect(series10.iscA).toBeCloseTo(single.iscA, 2);
  });

  it('builds combined I–V / P–V curves per MPPT wiring', () => {
    const project = {
      pv: {
        panelTypes: [panelType],
        arrays: [
          {
            id: 'array',
            name: 'Dak',
            panelTypeId: panelType.id,
            position: { lat: 52, lon: 5 },
            rows: 1,
            columns: 4,
            orientation: 'portrait',
            azimuthDeg: 180,
            tiltDeg: 30,
            baseHeightM: 0,
            panelGapM: 0.02,
            rowGapM: 0.02,
          },
        ],
      },
      electrical: {
        inverters: [inverter],
        wiring: [
          {
            inverterId: inverter.id,
            mpptId: mppt.id,
            strings: [
              {
                id: 's1',
                panels: [
                  { arrayId: 'array', row: 0, column: 0 },
                  { arrayId: 'array', row: 0, column: 1 },
                ],
              },
              {
                id: 's2',
                panels: [
                  { arrayId: 'array', row: 0, column: 2 },
                  { arrayId: 'array', row: 0, column: 3 },
                ],
              },
            ],
          },
        ],
      },
    } as never;
    const curve = buildMPPTIVCurve(
      project,
      inverter.id,
      mppt.id,
      new Map([
        [
          'array',
          {
            poa: { beamWm2: 800, diffuseWm2: 120, groundReflectedWm2: 20, totalWm2: 940, incidenceAngleDeg: 10 },
            shadeFactor: 0.25,
          },
        ],
      ]),
      20,
      2,
    );

    expect(curve).not.toBeNull();
    expect(curve!.unshaded.length).toBeGreaterThan(0);
    expect(curve!.shaded.length).toBeGreaterThan(0);
    expect(curve!.mppW).toBeGreaterThan(0);
    expect(curve!.mppA).toBeGreaterThan(panelType.impA);
  });

  it('models bypass diode multi-peak P–V behavior for shaded MPPT strings', () => {
    const project = {
      pv: {
        panelTypes: [panelType],
        arrays: [
          {
            id: 'sunny',
            name: 'Sunny',
            panelTypeId: panelType.id,
            position: { lat: 52, lon: 5 },
            rows: 1,
            columns: 2,
            orientation: 'portrait',
            azimuthDeg: 180,
            tiltDeg: 30,
            baseHeightM: 0,
            panelGapM: 0.02,
            rowGapM: 0.02,
          },
          {
            id: 'shaded',
            name: 'Shaded',
            panelTypeId: panelType.id,
            position: { lat: 52, lon: 5 },
            rows: 1,
            columns: 2,
            orientation: 'portrait',
            azimuthDeg: 180,
            tiltDeg: 30,
            baseHeightM: 0,
            panelGapM: 0.02,
            rowGapM: 0.02,
          },
        ],
      },
      electrical: {
        inverters: [inverter],
        wiring: [
          {
            inverterId: inverter.id,
            mpptId: mppt.id,
            strings: [
              {
                id: 's1',
                panels: [
                  { arrayId: 'sunny', row: 0, column: 0 },
                  { arrayId: 'sunny', row: 0, column: 1 },
                  { arrayId: 'shaded', row: 0, column: 0 },
                  { arrayId: 'shaded', row: 0, column: 1 },
                ],
              },
            ],
          },
        ],
      },
    } as never;
    const poa = { beamWm2: 800, diffuseWm2: 120, groundReflectedWm2: 20, totalWm2: 940, incidenceAngleDeg: 10 };
    const curve = buildMPPTIVCurve(
      project,
      inverter.id,
      mppt.id,
      new Map([
        ['sunny', { poa, shadeFactor: 0 }],
        ['shaded', { poa, shadeFactor: 0.65 }],
      ]),
      20,
      2,
      240,
    );

    expect(curve).not.toBeNull();
    expect(countPowerPeaks(curve!.shaded)).toBeGreaterThanOrEqual(2);
  });
});
