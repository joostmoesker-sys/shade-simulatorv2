import { describe, expect, it } from 'vitest';

import {
  BatterySchema,
  BuildingObjectSchema,
  ElectricVehicleProfileSchema,
  InverterSchema,
  LocationSchema,
  NL_BOUNDS,
  PROJECT_SCHEMA_VERSION,
  PVArraySchema,
  PanelTypeSchema,
  ProjectSchema,
  TreeObjectSchema,
} from '../../src/model/schema';

describe('LocationSchema', () => {
  it('accepts a valid location inside the Netherlands', () => {
    const loc = LocationSchema.parse({ lat: 52.37, lon: 4.9 });
    expect(loc.lat).toBeCloseTo(52.37);
    expect(loc.timezone).toBe('Europe/Amsterdam');
  });

  it('rejects a location outside the Netherlands bounding box', () => {
    expect(() => LocationSchema.parse({ lat: 48.85, lon: 2.35 })).toThrow();
  });

  it('rejects clearly invalid coordinates', () => {
    expect(() => LocationSchema.parse({ lat: 999, lon: 0 })).toThrow();
    expect(() => LocationSchema.parse({ lat: 52, lon: 'x' })).toThrow();
  });

  it.each([
    ['min lat', { lat: NL_BOUNDS.minLat, lon: 5.0 }],
    ['max lat', { lat: NL_BOUNDS.maxLat, lon: 5.0 }],
    ['min lon', { lat: 52.0, lon: NL_BOUNDS.minLon }],
    ['max lon', { lat: 52.0, lon: NL_BOUNDS.maxLon }],
  ])('accepts NL bounds edge case: %s', (_name, point) => {
    expect(() => LocationSchema.parse(point)).not.toThrow();
  });
});

describe('Scene object schemas', () => {
  it('parses a minimal tree object with sensible defaults', () => {
    const tree = TreeObjectSchema.parse({
      id: 't1',
      kind: 'tree',
      position: { lat: 52, lon: 5 },
      heightM: 12,
      crownRadiusM: 3,
      trunkHeightM: 2,
    });
    expect(tree.density).toBeCloseTo(0.7);
    expect(tree.undergrowth).toBe('grass');
    expect(tree.deciduous).toBe(true);
  });

  it('rejects negative dimensions', () => {
    expect(() =>
      TreeObjectSchema.parse({
        id: 't1',
        kind: 'tree',
        position: { lat: 52, lon: 5 },
        heightM: -1,
        crownRadiusM: 3,
        trunkHeightM: 2,
      }),
    ).toThrow();
  });

  it('requires at least 3 points for a building footprint', () => {
    expect(() =>
      BuildingObjectSchema.parse({
        id: 'b1',
        kind: 'building',
        position: { lat: 52, lon: 5 },
        footprint: [
          [5, 52],
          [5.0001, 52],
        ],
        heightM: 6,
      }),
    ).toThrow();
  });
});

describe('PV / inverter / battery schemas', () => {
  it('parses a panel type', () => {
    const panel = PanelTypeSchema.parse({
      id: 'p1',
      pmaxW: 400,
      vmpV: 34,
      impA: 11.7,
      vocV: 41,
      iscA: 12.4,
      tempCoeffPmaxPctPerC: -0.34,
      tempCoeffVocPctPerC: -0.27,
      widthM: 1.04,
      heightM: 1.72,
    });
    expect(panel.cells).toBe(60);
  });

  it('parses a PV array with required geometry', () => {
    const arr = PVArraySchema.parse({
      id: 'a1',
      panelTypeId: 'p1',
      position: { lat: 52, lon: 5 },
      rows: 2,
      columns: 6,
      azimuthDeg: 180,
      tiltDeg: 35,
    });
    expect(arr.orientation).toBe('portrait');
    expect(arr.baseHeightM).toBe(0);
  });

  it('rejects a tilt angle above 90°', () => {
    expect(() =>
      PVArraySchema.parse({
        id: 'a1',
        panelTypeId: 'p1',
        position: { lat: 52, lon: 5 },
        rows: 1,
        columns: 1,
        azimuthDeg: 180,
        tiltDeg: 95,
      }),
    ).toThrow();
  });

  it('parses an inverter with at least one MPPT', () => {
    const inv = InverterSchema.parse({
      id: 'i1',
      pAcNomW: 5000,
      pAcMaxW: 5000,
      pDcMaxW: 7500,
      mppts: [
        {
          id: 'm1',
          vMinV: 80,
          vMaxV: 600,
          vStartV: 120,
          iMaxA: 16,
          iScMaxA: 22,
          pMaxW: 4000,
        },
      ],
    });
    expect(inv.efficiency).toBeCloseTo(0.97);
    expect(inv.mppts).toHaveLength(1);
  });

  it('rejects an inverter with no MPPTs', () => {
    expect(() =>
      InverterSchema.parse({
        id: 'i1',
        pAcNomW: 5000,
        pAcMaxW: 5000,
        pDcMaxW: 7500,
        mppts: [],
      }),
    ).toThrow();
  });

  it('parses a battery with sane defaults', () => {
    const bat = BatterySchema.parse({
      id: 'b1',
      capacityKwh: 10,
      pChargeMaxKw: 5,
      pDischargeMaxKw: 5,
    });
    expect(bat.roundTripEfficiency).toBeCloseTo(0.9);
    expect(bat.allowGridCharge).toBe(false);
  });

  it('parses an electric vehicle profile with typical defaults', () => {
    const ev = ElectricVehicleProfileSchema.parse({ id: 'ev1' });
    expect(ev.batteryCapacityKwh).toBe(60);
    expect(ev.weekdayUseKwh).toBe(6);
    expect(ev.chargePowerKw).toBe(11);
  });
});

describe('ProjectSchema', () => {
  const baseProject = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: 'proj_1',
    name: 'Demo',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    location: { lat: 52.37, lon: 4.9 },
    scene: { objects: [] },
    pv: { panelTypes: [], arrays: [] },
    electrical: { inverters: [], wiring: [] },
    storage: { batteries: [] },
    loads: { base: [], heatPumps: [], electricVehicles: [] },
    tariffs: [],
  };

  it('accepts a minimal valid project', () => {
    const project = ProjectSchema.parse(baseProject);
    expect(project.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
  });

  it('defaults missing electric vehicle profiles for older project files', () => {
    const project = ProjectSchema.parse({ ...baseProject, loads: { base: [], heatPumps: [] } });
    expect(project.loads.electricVehicles).toEqual([]);
  });

  it('rejects an unknown schema version', () => {
    expect(() => ProjectSchema.parse({ ...baseProject, schemaVersion: 999 })).toThrow();
  });

  it('requires a non-empty project name', () => {
    expect(() => ProjectSchema.parse({ ...baseProject, name: '' })).toThrow();
  });
});
