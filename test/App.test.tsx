import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { App } from '../src/App';
import { createProject } from '../src/model/project';
import { useProjectStore } from '../src/store/projectStore';

vi.mock('../src/map/ProjectMap', () => ({
  ProjectMap: () => <div data-testid="project-map" />,
}));

const validLocation = { lat: 52.0, lon: 5.0, timezone: 'Europe/Amsterdam' };

describe('<App>', () => {
  it('shows the map next to regular project tabs', () => {
    useProjectStore.setState({
      project: createProject({ name: 'Demo', location: validLocation, id: 'proj_demo' }),
      activeTab: 'locatie',
      selectedSceneObjectId: null,
      selectedPVArrayId: null,
      objectMapAddKind: null,
    });

    const { container } = render(<App />);

    expect(screen.getByTestId('project-map')).toBeInTheDocument();
    expect(container.querySelector('.app-main')).not.toHaveClass('app-main--panel-only');
  });

  it('hides the map and gives Bekabeling the full workspace', () => {
    useProjectStore.setState({
      project: createProject({ name: 'Demo', location: validLocation, id: 'proj_demo' }),
      activeTab: 'bekabeling',
      selectedSceneObjectId: null,
      selectedPVArrayId: null,
      objectMapAddKind: null,
    });

    const { container } = render(<App />);

    expect(screen.queryByTestId('project-map')).not.toBeInTheDocument();
    expect(container.querySelector('.app-main')).toHaveClass('app-main--panel-only');
    expect(screen.getByLabelText('Projecteigenschappen')).toHaveClass('app-panel--full');
  });

  it('renders the Resultaten tab implementation', () => {
    useProjectStore.setState({
      project: createProject({ name: 'Demo', location: validLocation, id: 'proj_demo' }),
      activeTab: 'resultaten',
      selectedSceneObjectId: null,
      selectedPVArrayId: null,
      objectMapAddKind: null,
      annualSimulationResult: null,
    });

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Resultaten' })).toBeInTheDocument();
    expect(screen.queryByText('Deze stap wordt geïmplementeerd in een latere fase.')).not.toBeInTheDocument();
  });
});
