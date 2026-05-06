import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { InvertersTab } from '../../src/components/InvertersTab';
import { createProject } from '../../src/model/project';
import { useProjectStore } from '../../src/store/projectStore';

const validLocation = { lat: 52.0, lon: 5.0, timezone: 'Europe/Amsterdam' };

describe('<InvertersTab>', () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: createProject({ name: 'Demo', location: validLocation, id: 'proj_demo' }),
      activeTab: 'inverters',
      selectedSceneObjectId: null,
      selectedPVArrayId: null,
      objectMapAddKind: null,
    });
  });

  it('creates and edits an inverter', () => {
    render(<InvertersTab />);

    expect(screen.getByText(/Nog geen inverters/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Inverter toevoegen' }));

    const inverterForm = screen.getByRole('form', { name: 'Inverter eigenschappen' });
    fireEvent.change(within(inverterForm).getAllByLabelText('Naam')[0], { target: { value: 'Growatt' } });
    fireEvent.change(screen.getByLabelText('Nominaal AC (W)'), { target: { value: '6000' } });

    expect(useProjectStore.getState().project.electrical.inverters[0]).toMatchObject({
      name: 'Growatt',
      pAcNomW: 6000,
    });
  });

  it('adds, edits and removes MPPT inputs', () => {
    useProjectStore.getState().addInverter();
    render(<InvertersTab />);

    fireEvent.click(screen.getByRole('button', { name: 'MPPT toevoegen' }));
    expect(useProjectStore.getState().project.electrical.inverters[0].mppts).toHaveLength(2);

    const pmaxFields = screen.getAllByLabelText('Pmax (W)');
    fireEvent.change(pmaxFields[1], { target: { value: '4200' } });
    expect(useProjectStore.getState().project.electrical.inverters[0].mppts[1].pMaxW).toBe(4200);

    const deleteButtons = screen.getAllByRole('button', { name: 'MPPT verwijderen' });
    fireEvent.click(deleteButtons[1]);
    expect(useProjectStore.getState().project.electrical.inverters[0].mppts).toHaveLength(1);
  });
});
