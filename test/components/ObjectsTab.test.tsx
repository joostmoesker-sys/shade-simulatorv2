import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('../../src/data/dutchBuildings', () => ({
  fetchDutchBuildingObjects: vi.fn(),
}));

import { ObjectsTab } from '../../src/components/ObjectsTab';
import { fetchDutchBuildingObjects } from '../../src/data/dutchBuildings';
import { createProject } from '../../src/model/project';
import { useProjectStore } from '../../src/store/projectStore';

const validLocation = { lat: 52.0, lon: 5.0, timezone: 'Europe/Amsterdam' };

describe('<ObjectsTab>', () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: createProject({ name: 'Demo', location: validLocation, id: 'proj_demo' }),
      activeTab: 'objecten',
      selectedSceneObjectId: null,
      selectedPVArrayId: null,
      objectMapAddKind: null,
    });
    vi.mocked(fetchDutchBuildingObjects).mockReset();
  });

  it('creates and edits a tree object', () => {
    render(<ObjectsTab />);

    expect(screen.getByText(/Nog geen objecten/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Boom toevoegen' }));

    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'Eik' } });
    fireEvent.change(screen.getByLabelText('Hoogte (m)'), { target: { value: '12' } });
    fireEvent.change(screen.getByLabelText('Kroonradius (m)'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Ondergroei'), { target: { value: 'shrubs' } });

    expect(useProjectStore.getState().project.scene.objects[0]).toMatchObject({
      kind: 'tree',
      name: 'Eik',
      heightM: 12,
      crownRadiusM: 4,
      undergrowth: 'shrubs',
    });
  });

  it('enables map placement mode for objects', () => {
    render(<ObjectsTab />);

    fireEvent.click(screen.getByRole('button', { name: 'Boom op kaart' }));
    expect(useProjectStore.getState().objectMapAddKind).toBe('tree');
    fireEvent.click(screen.getByRole('button', { name: 'Boom op kaart' }));
    expect(useProjectStore.getState().objectMapAddKind).toBeNull();
  });

  it('creates a building and edits its footprint', () => {
    render(<ObjectsTab />);

    fireEvent.click(screen.getByRole('button', { name: 'Gebouw toevoegen' }));
    const footprint = [
      [5, 52],
      [5.001, 52],
      [5.001, 52.001],
    ];

    fireEvent.change(screen.getByLabelText('Footprint [[lon, lat], ...]'), {
      target: { value: JSON.stringify(footprint) },
    });
    fireEvent.blur(screen.getByLabelText('Footprint [[lon, lat], ...]'));

    expect(useProjectStore.getState().project.scene.objects[0]).toMatchObject({
      kind: 'building',
      footprint,
    });
  });

  it('imports nearby buildings from 3D BAG', async () => {
    vi.mocked(fetchDutchBuildingObjects).mockResolvedValue([
      {
        kind: 'building',
        name: '3D BAG pand-1',
        position: validLocation,
        heightM: 9,
        footprint: [
          [5, 52],
          [5.001, 52],
          [5.001, 52.001],
        ],
      },
    ]);
    render(<ObjectsTab />);

    fireEvent.click(screen.getByRole('button', { name: 'Gebouwen automatisch ophalen' }));

    await waitFor(() => {
      expect(screen.getByText(/1 gebouw\(en\) automatisch toegevoegd/)).toBeInTheDocument();
    });
    expect(useProjectStore.getState().project.scene.objects[0]).toMatchObject({
      kind: 'building',
      name: '3D BAG pand-1',
      heightM: 9,
    });
  });
});
