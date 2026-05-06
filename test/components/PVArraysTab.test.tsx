import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

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

  it('starts empty and creates a default PV array', () => {
    render(<PVArraysTab />);
    expect(screen.getByText(/Nog geen PV arrays/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Array toevoegen' }));

    expect(screen.getByRole('button', { name: /PV array 1/ })).toBeInTheDocument();
    expect(screen.getByText('Panelen')).toBeInTheDocument();
    expect(screen.getByText('3.2 kWp')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/^Paneel \d+-\d+$/)).toHaveLength(8);
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
    expect(screen.getAllByLabelText(/^Paneel \d+-\d+$/)).toHaveLength(6);
  });
});
