import { beforeEach, describe, expect, it } from 'vitest';

import { createProject } from '../../src/model/project';
import { simulateProjectYear } from '../../src/simulation/annualSimulation';
import { useProjectStore } from '../../src/store/projectStore';

const validLocation = { lat: 52.0, lon: 5.0, timezone: 'Europe/Amsterdam' };

describe('simulateProjectYear', () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: createProject({ name: 'Demo', location: validLocation, id: 'proj_demo' }),
      activeTab: 'simulatie',
      selectedSceneObjectId: null,
      selectedPVArrayId: null,
      objectMapAddKind: null,
      simulationPreviewTimestamp: '2025-06-21T12:00:00.000Z',
    });
  });

  it('calculates monthly AC energy and electrical losses from hourly weather', async () => {
    const array = useProjectStore.getState().addPVArray({ rows: 1, columns: 5, tiltDeg: 30, azimuthDeg: 180 });
    const inverter = useProjectStore.getState().addInverter();
    useProjectStore.getState().addWiringString(inverter.id, inverter.mppts[0].id, [
      { arrayId: array.id, row: 0, column: 0 },
      { arrayId: array.id, row: 0, column: 1 },
      { arrayId: array.id, row: 0, column: 2 },
      { arrayId: array.id, row: 0, column: 3 },
      { arrayId: array.id, row: 0, column: 4 },
    ]);

    const result = await simulateProjectYear(useProjectStore.getState().project, {
      year: 2025,
      weatherSamples: [
        {
          timestamp: '2025-06-21T10:00:00Z',
          ghiWm2: 700,
          dniWm2: 650,
          dhiWm2: 130,
          temperatureC: 20,
          windSpeedMs: 2,
        },
        {
          timestamp: '2025-06-21T11:00:00Z',
          ghiWm2: 800,
          dniWm2: 720,
          dhiWm2: 140,
          temperatureC: 21,
          windSpeedMs: 2,
        },
      ],
    });

    expect(result.acKwh).toBeGreaterThan(1);
    expect(result.monthlyAcKwh[5]).toBeCloseTo(result.acKwh);
    expect(result.samples).toBe(2);
    expect(result.weatherSource).toBe('provided');
  });
});
