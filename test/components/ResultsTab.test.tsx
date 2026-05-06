import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ResultsTab } from '../../src/components/ResultsTab';
import { createProject } from '../../src/model/project';
import { runAnnualSimulation, type AnnualSimulationResult } from '../../src/simulation/annualSimulation';
import { useProjectStore } from '../../src/store/projectStore';

const validLocation = { lat: 52.0, lon: 5.0, timezone: 'Europe/Amsterdam' };

vi.mock('../../src/simulation/annualSimulation', () => ({
  runAnnualSimulation: vi.fn(),
}));

const annualResult: AnnualSimulationResult = {
  year: 2025,
  acKwh: 1234,
  dcKwh: 1300,
  shadeLossKwh: 50,
  mismatchLossKwh: 12,
  clippingLossKwh: 20,
  voltageCurrentLossKwh: 4,
  standbyLossKwh: 0,
  monthlyAcKwh: [20, 40, 80, 120, 140, 160, 170, 160, 140, 100, 60, 44],
  economic: {
    version: 'v4-euro-optimizer',
    annualSavingsEur: 456,
    baselineCostEur: 1200,
    importCostEur: 800,
    exportRevenueEur: 56,
    importKwh: 2100,
    exportKwh: 500,
    selfConsumedKwh: 734,
    selfConsumptionPct: 59.5,
    batteryChargedKwh: 300,
    batteryDischargedKwh: 280,
    batteryCycles: 5,
    monthlySavingsEur: [10, 20, 25, 40, 50, 60, 65, 60, 45, 35, 25, 21],
    monthlyImportCostEur: [90, 80, 75, 65, 55, 45, 40, 45, 60, 70, 80, 95],
    monthlyRevenueEur: [1, 2, 5, 8, 10, 12, 14, 12, 8, 5, 3, 2],
    dispatchSample: [{ hour: 4320, socKwh: 30, chargeKwh: 2, dischargeKwh: 0, priceEurPerKwh: 0.2, action: 'charge' }],
    diagnostics: {
      finalSocKwh: 30,
      socStepKwh: 0.63,
      curtailedPvKwh: 0,
      evLoadKwh: 1800,
      baseLoadKwh: 3500,
      heatPumpLoadKwh: 1200,
    },
  },
  samples: 8760,
  weatherSource: 'open-meteo-archive',
  elapsedMs: 1200,
};

function addCompleteElectricalModel() {
  const array = useProjectStore.getState().addPVArray({ rows: 1, columns: 5 });
  const inverter = useProjectStore.getState().addInverter();
  useProjectStore.getState().addWiringString(inverter.id, inverter.mppts[0].id, [
    { arrayId: array.id, row: 0, column: 0 },
    { arrayId: array.id, row: 0, column: 1 },
    { arrayId: array.id, row: 0, column: 2 },
    { arrayId: array.id, row: 0, column: 3 },
    { arrayId: array.id, row: 0, column: 4 },
  ]);
}

describe('<ResultsTab>', () => {
  beforeEach(() => {
    vi.mocked(runAnnualSimulation).mockReset();
    useProjectStore.setState({
      project: createProject({ name: 'Demo', location: validLocation, id: 'proj_demo' }),
      activeTab: 'resultaten',
      selectedSceneObjectId: null,
      selectedPVArrayId: null,
      objectMapAddKind: null,
      annualSimulationResult: null,
    });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:test'),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  it('shows an empty state until a year result exists', () => {
    render(<ResultsTab />);

    expect(screen.getByRole('heading', { name: 'Resultaten' })).toBeInTheDocument();
    expect(screen.getByText('Nog geen jaarresultaat')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bereken jaar 2025' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Exporteer CSV' })).toBeDisabled();
  });

  it('runs the annual simulation and stores the result', async () => {
    vi.mocked(runAnnualSimulation).mockResolvedValue(annualResult);
    addCompleteElectricalModel();

    render(<ResultsTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Bereken jaar 2025' }));

    await waitFor(() => expect(screen.getByRole('region', { name: 'Resultaten samenvatting 2025' })).toBeInTheDocument());
    expect(runAnnualSimulation).toHaveBeenCalledWith(useProjectStore.getState().project, { year: 2025 });
    expect(useProjectStore.getState().annualSimulationResult?.acKwh).toBe(1234);
    expect(screen.getByText('1.234 kWh')).toBeInTheDocument();
    expect(screen.getByText('€456')).toBeInTheDocument();
  });

  it('exports stored results as CSV and JSON', () => {
    useProjectStore.getState().setAnnualSimulationResult(annualResult);

    render(<ResultsTab />);
    fireEvent.click(screen.getByRole('button', { name: 'Exporteer CSV' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exporteer JSON' }));

    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });
});
