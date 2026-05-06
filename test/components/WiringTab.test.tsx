import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { WiringTab } from '../../src/components/WiringTab';
import { createProject } from '../../src/model/project';
import { useProjectStore } from '../../src/store/projectStore';

const validLocation = { lat: 52.0, lon: 5.0, timezone: 'Europe/Amsterdam' };

describe('<WiringTab>', () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: createProject({ name: 'Demo', location: validLocation, id: 'proj_demo' }),
      activeTab: 'bekabeling',
      selectedSceneObjectId: null,
      selectedPVArrayId: null,
      objectMapAddKind: null,
    });
  });

  it('asks for an inverter before wiring can start', () => {
    render(<WiringTab />);

    expect(screen.getByText("Definieer eerst een inverter met MPPT's.")).toBeInTheDocument();
  });

  it('connects PV array rows and columns to the selected MPPT', () => {
    const array = useProjectStore.getState().addPVArray({ name: 'Dak zuid', rows: 2, columns: 3 });
    const inverter = useProjectStore.getState().addInverter({ name: 'Growatt' });

    render(<WiringTab />);

    fireEvent.click(screen.getByRole('button', { name: 'Rij 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kolom 2' }));

    const wiring = useProjectStore.getState().project.electrical.wiring[0];
    expect(wiring).toMatchObject({
      inverterId: inverter.id,
      mpptId: inverter.mppts[0].id,
    });
    expect(wiring.strings).toHaveLength(2);
    expect(wiring.strings[0].panels).toEqual([
      { arrayId: array.id, row: 0, column: 0 },
      { arrayId: array.id, row: 0, column: 1 },
      { arrayId: array.id, row: 0, column: 2 },
    ]);
    expect(wiring.strings[1].panels).toEqual([
      { arrayId: array.id, row: 0, column: 1 },
      { arrayId: array.id, row: 1, column: 1 },
    ]);
    expect(screen.getByText('String 1: Vmp ligt onder Vmin.')).toBeInTheDocument();
    expect(screen.getByText('Parallelle strings overschrijden Imax.')).toBeInTheDocument();
  });

  it('removes connected strings from the editor', () => {
    useProjectStore.getState().addPVArray({ rows: 1, columns: 2 });
    useProjectStore.getState().addInverter();
    render(<WiringTab />);

    fireEvent.click(screen.getByRole('button', { name: 'Rij 1' }));
    const stringsSection = screen.getByRole('region', { name: 'Aangesloten strings' });
    fireEvent.click(within(stringsSection).getByRole('button', { name: 'Verwijderen' }));

    expect(useProjectStore.getState().project.electrical.wiring).toHaveLength(0);
  });
});
