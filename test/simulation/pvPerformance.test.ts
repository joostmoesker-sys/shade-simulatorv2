import { describe, expect, it } from 'vitest';

import type { Inverter, MPPT, PanelType } from '../../src/model/schema';
import {
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
});
