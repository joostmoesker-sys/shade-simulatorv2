import { describe, expect, it } from 'vitest';

import { calculatePlaneOfArrayIrradiance } from '../../src/simulation/irradiance';

describe('calculatePlaneOfArrayIrradiance', () => {
  it('adds beam, diffuse and reflected components for a sun-facing plane', () => {
    const poa = calculatePlaneOfArrayIrradiance(
      { ghiWm2: 800, dniWm2: 700, dhiWm2: 140, temperatureC: 20, windSpeedMs: 2, source: 'measured' },
      { azimuthDeg: 180, elevationDeg: 45, zenithDeg: 45 },
      { tiltDeg: 35, azimuthDeg: 180 },
    );

    expect(poa.beamWm2).toBeGreaterThan(0);
    expect(poa.diffuseWm2).toBeGreaterThan(0);
    expect(poa.totalWm2).toBeCloseTo(poa.beamWm2 + poa.diffuseWm2 + poa.groundReflectedWm2);
  });

  it('returns zero irradiance at night', () => {
    const poa = calculatePlaneOfArrayIrradiance(
      { ghiWm2: 0, dniWm2: 0, dhiWm2: 0, temperatureC: 10, windSpeedMs: 2, source: 'clear-sky-preview' },
      { azimuthDeg: 0, elevationDeg: -10, zenithDeg: 100 },
      { tiltDeg: 35, azimuthDeg: 180 },
    );

    expect(poa.totalWm2).toBe(0);
  });
});
