import { describe, expect, it } from 'vitest';

import { mapOpenMeteoArchiveWeather, normalizeWeather } from '../../src/simulation/weather';

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

  it('maps Open-Meteo archive hourly fields to simulator weather samples', () => {
    const samples = mapOpenMeteoArchiveWeather({
      hourly: {
        time: ['2025-01-01T12:00'],
        shortwave_radiation: [230],
        direct_normal_irradiance: [410],
        diffuse_radiation: [80],
        temperature_2m: [6],
        wind_speed_10m: [3],
        cloud_cover: [75],
      },
    });

    expect(samples[0]).toMatchObject({
      timestamp: '2025-01-01T12:00Z',
      ghiWm2: 230,
      dniWm2: 410,
      dhiWm2: 80,
      temperatureC: 6,
      windSpeedMs: 3,
      cloudCoverPct: 75,
    });
  });
});
