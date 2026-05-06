import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { SimulationTab } from '../../src/components/SimulationTab';
import { createProject } from '../../src/model/project';
import { runAnnualSimulation } from '../../src/simulation/annualSimulation';
import { useProjectStore } from '../../src/store/projectStore';

const validLocation = { lat: 52.0, lon: 5.0, timezone: 'Europe/Amsterdam' };

vi.mock('../../src/simulation/annualSimulation', () => ({
  runAnnualSimulation: vi.fn(),
}));

describe('<SimulationTab>', () => {
  beforeEach(() => {
    vi.mocked(runAnnualSimulation).mockReset();
    useProjectStore.setState({
      project: createProject({ name: 'Demo', location: validLocation, id: 'proj_demo' }),
      activeTab: 'simulatie',
      selectedSceneObjectId: null,
      selectedPVArrayId: null,
      objectMapAddKind: null,
      simulationPreviewTimestamp: '2026-06-21T12:00:00.000Z',
    });
  });

  it('shows sun and clear-sky preview metrics', () => {
    render(<SimulationTab />);

    expect(screen.getByRole('heading', { name: 'Simulatiepreview' })).toBeInTheDocument();
    expect(screen.getByText('clear-sky')).toBeInTheDocument();
    expect(screen.getByText('Azimuth')).toBeInTheDocument();
    expect(screen.getByText('GHI')).toBeInTheDocument();
  });

  it('updates the preview timestamp from date and time controls', () => {
    render(<SimulationTab />);

    fireEvent.change(screen.getByLabelText('Datum'), { target: { value: '2026-03-21' } });
    expect(useProjectStore.getState().simulationPreviewTimestamp).toBe('2026-03-21T12:00:00.000Z');

    fireEvent.change(screen.getByRole('slider'), { target: { value: '570' } });
    expect(useProjectStore.getState().simulationPreviewTimestamp).toBe('2026-03-21T09:30:00.000Z');
  });

  it('lists POA and shade results for PV arrays', () => {
    useProjectStore.getState().addPVArray({ name: 'Dak zuid' });
    render(<SimulationTab />);

    expect(screen.getByText('Dak zuid')).toBeInTheDocument();
    expect(screen.getByText(/POA .* schaduw .* effectief/)).toBeInTheDocument();
  });

  it('runs the 2025 annual worker flow and shows monthly results', async () => {
    vi.mocked(runAnnualSimulation).mockResolvedValue({
      year: 2025,
      acKwh: 1234,
      dcKwh: 1300,
      shadeLossKwh: 50,
      mismatchLossKwh: 12,
      clippingLossKwh: 20,
      voltageCurrentLossKwh: 4,
      standbyLossKwh: 0,
      monthlyAcKwh: [20, 40, 80, 120, 140, 160, 170, 160, 140, 100, 60, 44],
      samples: 8760,
      weatherSource: 'open-meteo-archive',
      elapsedMs: 1200,
    });
    const array = useProjectStore.getState().addPVArray({ rows: 1, columns: 5 });
    const inverter = useProjectStore.getState().addInverter();
    useProjectStore.getState().addWiringString(inverter.id, inverter.mppts[0].id, [
      { arrayId: array.id, row: 0, column: 0 },
      { arrayId: array.id, row: 0, column: 1 },
      { arrayId: array.id, row: 0, column: 2 },
      { arrayId: array.id, row: 0, column: 3 },
      { arrayId: array.id, row: 0, column: 4 },
    ]);

    render(<SimulationTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Bereken jaar 2025' }));

    await waitFor(() => expect(screen.getByRole('region', { name: 'Jaarresultaten 2025' })).toBeInTheDocument());
    expect(runAnnualSimulation).toHaveBeenCalledWith(useProjectStore.getState().project, { year: 2025 });
    expect(screen.getByText('1.234 kWh')).toBeInTheDocument();
    expect(screen.getByLabelText('Maandopbrengst grafiek')).toBeInTheDocument();
  });
});
