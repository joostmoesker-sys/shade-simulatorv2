import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { StorageLoadsTab } from '../../src/components/StorageLoadsTab';
import { createProject } from '../../src/model/project';
import { useProjectStore } from '../../src/store/projectStore';

const validLocation = { lat: 52.0, lon: 5.0, timezone: 'Europe/Amsterdam' };

describe('<StorageLoadsTab>', () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: createProject({ name: 'Demo', location: validLocation, id: 'proj_demo' }),
      activeTab: 'accu-verbruik',
      selectedSceneObjectId: null,
      selectedPVArrayId: null,
      objectMapAddKind: null,
      simulationPreviewTimestamp: '2026-06-21T12:00:00.000Z',
    });
  });

  it('adds typical phase 4 battery and EV profiles', () => {
    render(<StorageLoadsTab />);

    fireEvent.click(screen.getByRole('button', { name: '64 kWh accu toevoegen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Typische EV toevoegen' }));

    const project = useProjectStore.getState().project;
    expect(project.storage.batteries[0]).toMatchObject({ capacityKwh: 64, pChargeMaxKw: 10 });
    expect(project.loads.electricVehicles[0]).toMatchObject({ batteryCapacityKwh: 60, weekdayUseKwh: 6 });
    expect(screen.queryByRole('heading', { name: 'Tarieven' })).not.toBeInTheDocument();
  });

  it('updates EV charging settings', () => {
    const ev = useProjectStore.getState().addElectricVehicle();
    render(<StorageLoadsTab />);

    fireEvent.change(screen.getByLabelText('Weekdag verbruik (kWh)'), { target: { value: '7.5' } });

    expect(useProjectStore.getState().project.loads.electricVehicles[0]).toMatchObject({
      id: ev.id,
      weekdayUseKwh: 7.5,
    });
  });
});
