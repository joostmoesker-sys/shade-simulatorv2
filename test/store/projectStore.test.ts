import { beforeEach, describe, expect, it } from 'vitest';

import { useProjectStore } from '../../src/store/projectStore';
import { createProject } from '../../src/model/project';

const validLocation = { lat: 52.37, lon: 4.9, timezone: 'Europe/Amsterdam' };

describe('projectStore', () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: createProject({ name: 'Reset', location: validLocation }),
      activeTab: 'locatie',
    });
  });

  it('starts on the Locatie tab', () => {
    expect(useProjectStore.getState().activeTab).toBe('locatie');
  });

  it('switches the active tab', () => {
    useProjectStore.getState().setActiveTab('pv-arrays');
    expect(useProjectStore.getState().activeTab).toBe('pv-arrays');
  });

  it('updates the project location and bumps updatedAt', async () => {
    const before = useProjectStore.getState().project.updatedAt;
    // Ensure at least 1 ms passes so updatedAt strictly increases.
    await new Promise((r) => setTimeout(r, 2));
    useProjectStore.getState().setLocation({
      lat: 51.99,
      lon: 4.37,
      label: 'Rotterdam',
      timezone: 'Europe/Amsterdam',
    });
    const next = useProjectStore.getState().project;
    expect(next.location.label).toBe('Rotterdam');
    expect(next.location.lat).toBeCloseTo(51.99);
    expect(next.updatedAt >= before).toBe(true);
  });

  it('replaces the entire project', () => {
    const newProject = createProject({
      name: 'Other',
      location: validLocation,
      id: 'proj_other',
    });
    useProjectStore.getState().replaceProject(newProject);
    expect(useProjectStore.getState().project.id).toBe('proj_other');
  });

  it('creates a default panel type and PV array', () => {
    const array = useProjectStore.getState().addPVArray();
    const project = useProjectStore.getState().project;
    expect(project.pv.panelTypes).toHaveLength(1);
    expect(project.pv.arrays).toHaveLength(1);
    expect(project.pv.arrays[0]).toMatchObject({
      id: array.id,
      rows: 2,
      columns: 4,
      azimuthDeg: 180,
      tiltDeg: 35,
    });
  });

  it('updates and removes a PV array', () => {
    const array = useProjectStore.getState().addPVArray({ name: 'Dak zuid' });
    useProjectStore.getState().updatePVArray(array.id, { rows: 3, columns: 5 });
    expect(useProjectStore.getState().project.pv.arrays[0]).toMatchObject({
      name: 'Dak zuid',
      rows: 3,
      columns: 5,
    });

    useProjectStore.getState().removePVArray(array.id);
    expect(useProjectStore.getState().project.pv.arrays).toHaveLength(0);
  });

  it('creates and updates scene objects', () => {
    const tree = useProjectStore.getState().addSceneObject({ kind: 'tree', name: 'Linde' });
    useProjectStore.getState().updateSceneObject(tree.id, { heightM: 11 });
    expect(useProjectStore.getState().project.scene.objects[0]).toMatchObject({
      kind: 'tree',
      name: 'Linde',
      heightM: 11,
    });

    useProjectStore.getState().removeSceneObject(tree.id);
    expect(useProjectStore.getState().project.scene.objects).toHaveLength(0);
  });

  it('creates and updates panel types', () => {
    const panel = useProjectStore.getState().addPanelType({ manufacturer: 'ACME', model: '455' });
    useProjectStore.getState().updatePanelType(panel.id, { pmaxW: 455 });
    expect(useProjectStore.getState().project.pv.panelTypes[0]).toMatchObject({
      manufacturer: 'ACME',
      model: '455',
      pmaxW: 455,
    });
  });

  it('creates and edits inverters and MPPTs', () => {
    const inverter = useProjectStore.getState().addInverter({ name: 'Inv' });
    const mppt = useProjectStore.getState().addMPPT(inverter.id, { name: 'MPPT 2' });
    useProjectStore.getState().updateMPPT(inverter.id, mppt.id, { pMaxW: 4100 });

    expect(useProjectStore.getState().project.electrical.inverters[0].mppts).toHaveLength(2);
    expect(useProjectStore.getState().project.electrical.inverters[0].mppts[1]).toMatchObject({
      name: 'MPPT 2',
      pMaxW: 4100,
    });
  });
});
