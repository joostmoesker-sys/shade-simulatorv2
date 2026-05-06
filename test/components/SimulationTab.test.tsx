import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { SimulationTab } from '../../src/components/SimulationTab';
import { createProject } from '../../src/model/project';
import { useProjectStore } from '../../src/store/projectStore';

const validLocation = { lat: 52.0, lon: 5.0, timezone: 'Europe/Amsterdam' };

describe('<SimulationTab>', () => {
  beforeEach(() => {
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
});
