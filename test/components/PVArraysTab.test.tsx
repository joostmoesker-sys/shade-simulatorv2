import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

// Mock the heavyweight MapLibre-based map component; UI logic is what we test.
vi.mock('../../src/map/PVArrayMap', () => ({
  PVArrayMap: ({
    arrays,
    selectedId,
  }: {
    arrays: { id: string; name: string }[];
    selectedId: string | null;
  }) => (
    <div data-testid="pv-array-map-mock" data-selected-id={selectedId ?? ''}>
      {arrays.map((a) => (
        <div key={a.id} data-testid={`map-array-${a.id}`} />
      ))}
    </div>
  ),
}));

import { PVArraysTab } from '../../src/components/PVArraysTab';
import { createProject } from '../../src/model/project';
import { useProjectStore } from '../../src/store/projectStore';

const validLocation = { lat: 52.0, lon: 5.0, timezone: 'Europe/Amsterdam' };

describe('<PVArraysTab>', () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: createProject({ name: 'Demo', location: validLocation, id: 'proj_demo' }),
      activeTab: 'pv-arrays',
      selectedSceneObjectId: null,
      selectedPVArrayId: null,
      objectMapAddKind: null,
    });
  });

  it('starts empty, shows the map, and creates a default PV array', () => {
    render(<PVArraysTab />);

    expect(screen.getByText(/Nog geen PV arrays/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Array toevoegen' }));

    expect(screen.getByRole('button', { name: /PV array 1/ })).toBeInTheDocument();
    // Stats appear in the sidebar.
    expect(screen.getByText('Panelen')).toBeInTheDocument();
    expect(screen.getByText('3.2 kWp')).toBeInTheDocument();
  });

  it('updates the selected array from the property form', () => {
    const array = useProjectStore.getState().addPVArray();
    render(<PVArraysTab />);

    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'Garage' } });
    fireEvent.change(screen.getByLabelText('Rijen'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Kolommen'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Oriëntatie'), { target: { value: 'landscape' } });

    expect(useProjectStore.getState().project.pv.arrays[0]).toMatchObject({
      id: array.id,
      name: 'Garage',
      rows: 3,
      columns: 2,
      orientation: 'landscape',
    });
  });

  it('lists all arrays and tracks the globally selected array', () => {
    const a1 = useProjectStore.getState().addPVArray({ name: 'Dak 1' });
    const a2 = useProjectStore.getState().addPVArray({ name: 'Dak 2' });
    render(<PVArraysTab />);

    expect(screen.getByRole('button', { name: /Dak 1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Dak 2/ })).toHaveAttribute('aria-current', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Dak 1/ }));
    expect(useProjectStore.getState().selectedPVArrayId).toBe(a1.id);
    expect(useProjectStore.getState().selectedPVArrayId).not.toBe(a2.id);
  });

  it('adds a panel type from the database and supports manual editing', () => {
    render(<PVArraysTab />);

    fireEvent.change(screen.getByLabelText('Preset toevoegen'), { target: { value: '1' } });
    expect(useProjectStore.getState().project.pv.panelTypes.some((pt) => pt.pmaxW === 430)).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Handmatig paneel toevoegen' }));
    const manual = useProjectStore.getState().project.pv.panelTypes.at(-1);
    expect(manual?.manufacturer).toBe('Handmatig');

    fireEvent.change(screen.getByLabelText('Pmax (Wp)'), { target: { value: '455' } });
    expect(useProjectStore.getState().project.pv.panelTypes.at(-1)?.pmaxW).toBe(455);
  });
});
