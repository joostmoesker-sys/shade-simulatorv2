import { describe, expect, it } from 'vitest';

import { createProject } from '../../src/model/project';
import {
  buildHourlyLoadProfile,
  generateEconomicTariffs,
  rawDayAheadPriceEurPerKwh,
  simulateProjectEconomics,
  simulateV4Economics,
} from '../../src/simulation/economicSimulation';
import { NL_DAY_AHEAD_PRICE_2025_EUR_MWH } from '../../src/simulation/nlDayAheadPrices2025';

const validLocation = { lat: 52.0, lon: 5.0, timezone: 'Europe/Amsterdam' };

describe('phase 4 economic simulation', () => {
  it('contains one finite raw NL day-ahead price for every UTC hour in 2025', () => {
    expect(NL_DAY_AHEAD_PRICE_2025_EUR_MWH).toHaveLength(8760);
    expect(NL_DAY_AHEAD_PRICE_2025_EUR_MWH.every((value) => Number.isFinite(value))).toBe(true);
  });

  it('builds household, heat pump and EV hourly load profiles', () => {
    const project = createProject({ name: 'Demo', location: validLocation });
    project.loads.base.push({ id: 'load', name: 'Basis', annualKwh: 3650, shape: 'flat' });
    project.loads.heatPumps.push({ id: 'hp', name: 'WP', winterDayKwh: 12, heatingBaseTempC: 15 });
    project.loads.electricVehicles.push({
      id: 'ev',
      name: 'EV',
      batteryCapacityKwh: 60,
      chargePowerKw: 11,
      weekdayUseKwh: 6,
      weekendUseKwh: 8,
      chargeStartHour: 18,
      chargeEndHour: 7,
      flexible: true,
    });
    const samples = Array.from({ length: 24 }, (_, hour) => ({
      timestamp: `2025-01-06T${hour.toString().padStart(2, '0')}:00:00Z`,
      temperatureC: 2,
    }));

    const load = buildHourlyLoadProfile(project, samples);

    expect(load.baseLoadKwh).toBeGreaterThan(9);
    expect(load.heatPumpLoadKwh).toBeGreaterThan(0);
    expect(load.evLoadKwh).toBeCloseTo(6);
    expect(load.loadKwh.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(load.baseLoadKwh);
  });

  it('generates 2025 NL day-ahead buy and sell tariffs from raw hourly prices', () => {
    const tariffs = generateEconomicTariffs([
      { timestamp: '2025-01-01T00:00:00Z' },
      { timestamp: '2025-12-31T23:00:00Z' },
    ]);

    // Raw source values are 6.24 and 63.44 EUR/MWh, exposed to tariffs as EUR/kWh.
    expect(rawDayAheadPriceEurPerKwh('2025-01-01T00:00:00Z')).toBeCloseTo(0.00624);
    expect(rawDayAheadPriceEurPerKwh('2025-12-31T23:00:00Z')).toBeCloseTo(0.06344);
    expect(tariffs.sell[0]).toBeCloseTo(0.00624);
    expect(tariffs.sell[1]).toBeCloseTo(0.06344);
    expect(tariffs.buy[0]).toBeCloseTo(0.00624 + 0.1316 + 0.03);
    expect(tariffs.buy[1]).toBeCloseTo(0.06344 + 0.1316 + 0.03);
    expect(tariffs.buy[0]).toBeGreaterThan(tariffs.sell[0]);
    expect(tariffs.buy[1]).toBeGreaterThan(tariffs.sell[1]);
  });

  it('returns no raw dynamic price outside the 2025 hourly dataset', () => {
    expect(rawDayAheadPriceEurPerKwh('invalid')).toBeNull();
    expect(rawDayAheadPriceEurPerKwh('2024-12-31T23:00:00Z')).toBeNull();
    expect(rawDayAheadPriceEurPerKwh('2026-01-01T00:00:00Z')).toBeNull();
    expect(() => generateEconomicTariffs([{ timestamp: '2026-01-01T00:00:00Z' }])).toThrow(
      'No raw 2025 NL day-ahead price available',
    );
  });

  it('applies configurable import and export opslag to dynamic tariffs', () => {
    const tariffs = generateEconomicTariffs([{ timestamp: '2025-01-01T00:00:00Z' }], {
      id: 'tariff',
      name: 'Dynamisch',
      dynamic: true,
      staticImportEurPerKwh: 0.3,
      staticExportEurPerKwh: 0.05,
      energyTaxEurPerKwh: 0.11,
      importMarkupEurPerKwh: 0.02,
      exportMarkupEurPerKwh: 0.01,
    });

    expect(tariffs.buy[0]).toBeCloseTo(0.00624 + 0.11 + 0.02);
    expect(tariffs.sell[0]).toBeCloseTo(0.00624 + 0.01);
  });

  it('optimizes battery dispatch with the V4 euro objective', () => {
    const result = simulateV4Economics(
      [0, 10, 0, 0],
      [2, 2, 2, 2],
      [0.2, 0.2, 0.45, 0.45],
      [0.05, 0.05, 0.35, 0.35],
      {
        id: 'bat',
        name: 'Accu',
        capacityKwh: 8,
        pChargeMaxKw: 4,
        pDischargeMaxKw: 4,
        roundTripEfficiency: 0.9,
        socMin: 0.1,
        socMax: 1,
        standbyW: 0,
        allowGridCharge: true,
        allowGridExport: true,
      },
    );

    expect(result.version).toBe('v4-euro-optimizer');
    expect(result.batteryChargedKwh).toBeGreaterThan(0);
    expect(result.annualSavingsEur).toBeGreaterThan(0);
  });

  it('simulates project economics from project phase 4 profiles', () => {
    const project = createProject({ name: 'Demo', location: validLocation });
    project.storage.batteries.push({
      id: 'bat',
      name: 'Accu',
      capacityKwh: 10,
      pChargeMaxKw: 5,
      pDischargeMaxKw: 5,
      roundTripEfficiency: 0.9,
      socMin: 0.1,
      socMax: 1,
      standbyW: 0,
      allowGridCharge: false,
      allowGridExport: true,
    });
    project.loads.base.push({ id: 'load', name: 'Basis', annualKwh: 3650, shape: 'evening_peak' });
    project.loads.electricVehicles.push({
      id: 'ev',
      name: 'EV',
      batteryCapacityKwh: 60,
      chargePowerKw: 11,
      weekdayUseKwh: 6,
      weekendUseKwh: 8,
      chargeStartHour: 18,
      chargeEndHour: 7,
      flexible: true,
    });
    const samples = Array.from({ length: 48 }, (_, index) => ({
      timestamp: `2025-06-${String(21 + Math.floor(index / 24)).padStart(2, '0')}T${(index % 24).toString().padStart(2, '0')}:00:00Z`,
      temperatureC: 18,
    }));

    const result = simulateProjectEconomics(project, samples.map((_, index) => (index % 24 >= 10 && index % 24 <= 15 ? 4 : 0)), samples);

    expect(result.annualSavingsEur).toBeGreaterThan(0);
    expect(result.diagnostics.evLoadKwh).toBeGreaterThan(0);
  });
});
