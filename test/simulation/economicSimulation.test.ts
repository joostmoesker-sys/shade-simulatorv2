import { describe, expect, it } from 'vitest';

import { createProject } from '../../src/model/project';
import {
  buildHourlyLoadProfile,
  generateEconomicTariffs,
  simulateProjectEconomics,
  simulateV4Economics,
} from '../../src/simulation/economicSimulation';

const validLocation = { lat: 52.0, lon: 5.0, timezone: 'Europe/Amsterdam' };

describe('phase 4 economic simulation', () => {
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

  it('generates 2025 NL day-ahead buy and sell tariffs from real monthly averages', () => {
    // June midday: near-zero wholesale → low buy tariff (~tax+levy only)
    // December evening peak: high wholesale → high buy tariff
    const tariffs = generateEconomicTariffs([
      { timestamp: '2025-06-21T12:00:00Z' }, // summer midday (solar surplus)
      { timestamp: '2025-12-21T18:00:00Z' }, // winter evening peak
    ]);

    // Buy price must always be positive
    expect(tariffs.buy[0]).toBeGreaterThan(0);
    expect(tariffs.buy[1]).toBeGreaterThan(0);
    // Sell price for midday June should be low (near-zero wholesale)
    expect(tariffs.sell[0]).toBeLessThan(0.05);
    // Winter evening peak buy should be significantly higher than summer midday
    expect(tariffs.buy[1]).toBeGreaterThan(tariffs.buy[0]);
    // Buy must exceed sell (no export subsidy in default tariff)
    expect(tariffs.buy[0]).toBeGreaterThan(tariffs.sell[0]);
    expect(tariffs.buy[1]).toBeGreaterThan(tariffs.sell[1]);
    // December buy price: wholesale (~0.10 EUR/kWh evening peak) + tax 0.1316 + 0.04 ≈ > 0.20 EUR/kWh
    expect(tariffs.buy[1]).toBeGreaterThan(0.20);
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
