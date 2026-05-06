import { describe, expect, it } from 'vitest';

import { calculateSolarPosition, isSunAboveHorizon } from '../../src/simulation/solarPosition';

describe('calculateSolarPosition', () => {
  it('returns a high southern sun for the Dutch summer solstice around solar noon', () => {
    const solar = calculateSolarPosition(new Date('2026-06-21T11:40:00.000Z'), { lat: 52, lon: 5 });

    expect(solar.elevationDeg).toBeGreaterThan(55);
    expect(solar.azimuthDeg).toBeGreaterThan(150);
    expect(solar.azimuthDeg).toBeLessThan(210);
    expect(isSunAboveHorizon(solar)).toBe(true);
  });

  it('places the winter night sun below the horizon', () => {
    const solar = calculateSolarPosition(new Date('2026-12-21T00:00:00.000Z'), { lat: 52, lon: 5 });

    expect(solar.elevationDeg).toBeLessThan(0);
    expect(isSunAboveHorizon(solar)).toBe(false);
  });
});
