import { describe, expect, it } from 'vitest';

import { normalizeWeather } from '../../src/simulation/weather';

describe('normalizeWeather', () => {
  it('creates clear-sky preview irradiance when weather input is missing', () => {
    const weather = normalizeWeather({}, { azimuthDeg: 180, elevationDeg: 45, zenithDeg: 45 });

    expect(weather.source).toBe('clear-sky-preview');
    expect(weather.ghiWm2).toBeGreaterThan(0);
    expect(weather.dniWm2).toBeGreaterThan(weather.dhiWm2);
  });

  it('uses measured GHI when available and clamps negative values', () => {
    const weather = normalizeWeather(
      { ghiWm2: 500, dniWm2: -10, dhiWm2: 120 },
      { azimuthDeg: 180, elevationDeg: 30, zenithDeg: 60 },
    );

    expect(weather.source).toBe('measured');
    expect(weather.ghiWm2).toBe(500);
    expect(weather.dniWm2).toBe(0);
    expect(weather.dhiWm2).toBe(120);
  });
});
