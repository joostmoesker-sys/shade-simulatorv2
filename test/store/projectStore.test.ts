import { beforeEach, describe, expect, it } from 'vitest';

import {
  createDefaultSimulationPreviewTimestamp,
  PROJECT_TABS,
  useProjectStore,
} from '../../src/store/projectStore';
import { createProject } from '../../src/model/project';

const validLocation = { lat: 52.37, lon: 4.9, timezone: 'Europe/Amsterdam' };

describe('projectStore', () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: createProject({ name: 'Reset', location: validLocation }),
      activeTab: 'locatie',
      selectedSceneObjectId: null,
      selectedPVArrayId: null,
      objectMapAddKind: null,
      simulationPreviewTimestamp: '2026-06-21T12:00:00.000Z',
    });
  });

  it('starts on the Locatie tab', () => {
    expect(useProjectStore.getState().activeTab).toBe('locatie');
  });

  it('switches the active tab', () => {
    useProjectStore.getState().setActiveTab('pv-arrays');
    expect(useProjectStore.getState().activeTab).toBe('pv-arrays');
  });

  it('updates the simulation preview timestamp', () => {
    useProjectStore.getState().setSimulationPreviewTimestamp('2026-03-21T09:30:00.000Z');

    expect(useProjectStore.getState().simulationPreviewTimestamp).toBe('2026-03-21T09:30:00.000Z');
  });

  it('creates a configurable current default simulation preview timestamp', () => {
    expect(createDefaultSimulationPreviewTimestamp(new Date('2025-05-06T14:00:00.000Z'))).toBe(
      '2025-05-06T14:00:00.000Z',
    );
  });

  it('orders inverters before wiring in the workflow', () => {
    expect(PROJECT_TABS.map((tab) => tab.id)).toEqual([
      'locatie',
      'objecten',
      'pv-arrays',
      'inverters',
      'bekabeling',
      'accu-verbruik',
      'simulatie',
      'resultaten',
    ]);
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
    expect(useProjectStore.getState().objectMapAddKind).toBeNull();
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

  it('adds and removes wiring strings for an MPPT', () => {
    const array = useProjectStore.getState().addPVArray({ rows: 1, columns: 3 });
    const inverter = useProjectStore.getState().addInverter({ name: 'Inv' });
    const mppt = inverter.mppts[0];
    const string = useProjectStore.getState().addWiringString(inverter.id, mppt.id, [
      { arrayId: array.id, row: 0, column: 0 },
      { arrayId: array.id, row: 0, column: 1 },
      { arrayId: array.id, row: 0, column: 2 },
    ]);

    expect(useProjectStore.getState().project.electrical.wiring[0]).toMatchObject({
      inverterId: inverter.id,
      mpptId: mppt.id,
      strings: [{ id: string.id }],
    });

    useProjectStore.getState().removeWiringString(inverter.id, mppt.id, string.id);
    expect(useProjectStore.getState().project.electrical.wiring).toHaveLength(0);
  });

  it('removes stale wiring references when an array is deleted', () => {
    const array = useProjectStore.getState().addPVArray({ rows: 1, columns: 2 });
    const inverter = useProjectStore.getState().addInverter();
    const mppt = inverter.mppts[0];
    useProjectStore.getState().addWiringString(inverter.id, mppt.id, [
      { arrayId: array.id, row: 0, column: 0 },
      { arrayId: array.id, row: 0, column: 1 },
    ]);

    useProjectStore.getState().removePVArray(array.id);
    expect(useProjectStore.getState().project.electrical.wiring).toHaveLength(0);
  });

  it('creates and updates phase 4 battery, load, EV and tariff profiles', () => {
    const battery = useProjectStore.getState().addBattery({ capacityKwh: 64, allowGridCharge: true });
    const load = useProjectStore.getState().addLoadProfile({ annualKwh: 4200 });
    const heatPump = useProjectStore.getState().addHeatPump({ winterDayKwh: 14 });
    const ev = useProjectStore.getState().addElectricVehicle({ name: 'EV', weekdayUseKwh: 5.5 });
    const tariff = useProjectStore.getState().addTariff({ staticImportEurPerKwh: 0.32 });

    useProjectStore.getState().updateBattery(battery.id, { pDischargeMaxKw: 10 });
    useProjectStore.getState().updateLoadProfile(load.id, { shape: 'work_from_home' });
    useProjectStore.getState().updateHeatPump(heatPump.id, { heatingBaseTempC: 16 });
    useProjectStore.getState().updateElectricVehicle(ev.id, { chargePowerKw: 7.4 });
    useProjectStore.getState().updateTariff(tariff.id, { staticExportEurPerKwh: 0.08 });

    const project = useProjectStore.getState().project;
    expect(project.storage.batteries[0]).toMatchObject({ capacityKwh: 64, pDischargeMaxKw: 10 });
    expect(project.loads.base[0]).toMatchObject({ annualKwh: 4200, shape: 'work_from_home' });
    expect(project.loads.heatPumps[0]).toMatchObject({ winterDayKwh: 14, heatingBaseTempC: 16 });
    expect(project.loads.electricVehicles[0]).toMatchObject({ name: 'EV', chargePowerKw: 7.4 });
    expect(project.tariffs[0]).toMatchObject({ staticImportEurPerKwh: 0.32, staticExportEurPerKwh: 0.08 });
  });
});
