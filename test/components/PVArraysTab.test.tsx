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
    });
  });

  it('starts empty, shows the map, and creates a default PV array', () => {
    render(<PVArraysTab />);

    // Map is always rendered.
    expect(screen.getByTestId('pv-array-map-mock')).toBeInTheDocument();
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

  it('passes all arrays and the selectedId to the map', () => {
    const a1 = useProjectStore.getState().addPVArray({ name: 'Dak 1' });
    const a2 = useProjectStore.getState().addPVArray({ name: 'Dak 2' });
    render(<PVArraysTab />);

    const mapEl = screen.getByTestId('pv-array-map-mock');
    // Both arrays rendered inside the mock map.
    expect(screen.getByTestId(`map-array-${a1.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`map-array-${a2.id}`)).toBeInTheDocument();
    // First array is auto-selected.
    expect(mapEl.dataset.selectedId).toBe(a1.id);
  });
});
