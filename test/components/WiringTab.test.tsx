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

  it('shows the panel grid after clicking "Nieuwe string"', () => {
    useProjectStore.getState().addPVArray({ name: 'Dak', rows: 2, columns: 3 });
    useProjectStore.getState().addInverter({ name: 'Inv' });

    render(<WiringTab />);

    fireEvent.click(screen.getByRole('button', { name: '+ Nieuwe string' }));

    expect(screen.getByLabelText(/Paneelraster/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'String bevestigen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annuleren' })).toBeInTheDocument();
  });

  it('builds a string by clicking panels and committing', () => {
    const array = useProjectStore.getState().addPVArray({ name: 'Dak', rows: 2, columns: 3 });
    const inverter = useProjectStore.getState().addInverter({ name: 'Growatt' });

    render(<WiringTab />);

    fireEvent.click(screen.getByRole('button', { name: '+ Nieuwe string' }));

    // Click the first three panels (row 0, columns 0-2)
    fireEvent.click(screen.getByRole('button', { name: /Rij 1 Kolom 1/ }));
    fireEvent.click(screen.getByRole('button', { name: /Rij 1 Kolom 2/ }));
    fireEvent.click(screen.getByRole('button', { name: /Rij 1 Kolom 3/ }));

    fireEvent.click(screen.getByRole('button', { name: 'String bevestigen' }));

    const wiring = useProjectStore.getState().project.electrical.wiring[0];
    expect(wiring).toMatchObject({ inverterId: inverter.id, mpptId: inverter.mppts[0].id });
    expect(wiring.strings[0].panels).toEqual([
      { arrayId: array.id, row: 0, column: 0 },
      { arrayId: array.id, row: 0, column: 1 },
      { arrayId: array.id, row: 0, column: 2 },
    ]);
  });

  it('greys out panels already assigned and shows assigned state', () => {
    const array = useProjectStore.getState().addPVArray({ name: 'Dak', rows: 1, columns: 2 });
    const inverter = useProjectStore.getState().addInverter({ name: 'Inv' });

    // Pre-assign row 0, columns 0 and 1
    useProjectStore.getState().addWiringString(inverter.id, inverter.mppts[0].id, [
      { arrayId: array.id, row: 0, column: 0 },
      { arrayId: array.id, row: 0, column: 1 },
    ]);

    render(<WiringTab />);

    fireEvent.click(screen.getByRole('button', { name: '+ Nieuwe string' }));

    const panelR1C1 = screen.getByRole('button', { name: /Rij 1 Kolom 1.*toegewezen/i });
    expect(panelR1C1).toBeDisabled();
  });

  it('removes connected strings from the editor', () => {
    const array = useProjectStore.getState().addPVArray({ rows: 1, columns: 2 });
    const inverter = useProjectStore.getState().addInverter();

    useProjectStore.getState().addWiringString(inverter.id, inverter.mppts[0].id, [
      { arrayId: array.id, row: 0, column: 0 },
      { arrayId: array.id, row: 0, column: 1 },
    ]);

    render(<WiringTab />);

    const stringsSection = screen.getByRole('region', { name: 'Aangesloten strings' });
    fireEvent.click(within(stringsSection).getByRole('button', { name: 'Verwijderen' }));

    expect(useProjectStore.getState().project.electrical.wiring).toHaveLength(0);
  });

  it('cancels a pending selection without saving', () => {
    useProjectStore.getState().addPVArray({ rows: 1, columns: 2 });
    useProjectStore.getState().addInverter();

    render(<WiringTab />);

    fireEvent.click(screen.getByRole('button', { name: '+ Nieuwe string' }));
    fireEvent.click(screen.getByRole('button', { name: /Rij 1 Kolom 1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Annuleren' }));

    expect(screen.getByRole('button', { name: '+ Nieuwe string' })).toBeInTheDocument();
    expect(useProjectStore.getState().project.electrical.wiring).toHaveLength(0);
  });
});
