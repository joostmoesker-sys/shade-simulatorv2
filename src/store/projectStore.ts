/**
 * Global project store. The store owns the active project and UI workflow tab,
 * plus project mutations used by the implemented editor tabs.
 */
import { create } from 'zustand';

import { createProject, generateId } from '../model/project';
import {
  BuildingObjectSchema,
  InverterSchema,
  MPPTSchema,
  PanelTypeSchema,
  PVArraySchema,
  TreeObjectSchema,
  type BuildingObject,
  type Inverter,
  type Location,
  type MPPT,
  type MPPTWiring,
  type PanelType,
  type Project,
  type PVArray,
  type SceneObject,
  type TreeObject,
  type WiringString,
} from '../model/schema';
import { NL_DEFAULT_CENTER } from '../location/geocode';

export type ProjectTab =
  | 'locatie'
  | 'objecten'
  | 'pv-arrays'
  | 'bekabeling'
  | 'inverters'
  | 'accu-verbruik'
  | 'simulatie'
  | 'resultaten';

export const PROJECT_TABS: { id: ProjectTab; label: string }[] = [
  { id: 'locatie', label: 'Locatie' },
  { id: 'objecten', label: 'Objecten' },
  { id: 'pv-arrays', label: 'PV Arrays' },
  // Inverters must exist before wiring strings can be assigned to MPPTs.
  { id: 'inverters', label: 'Inverters' },
  { id: 'bekabeling', label: 'Bekabeling' },
  { id: 'accu-verbruik', label: 'Accu & Verbruik' },
  { id: 'simulatie', label: 'Simulatie' },
  { id: 'resultaten', label: 'Resultaten' },
];

export const DEFAULT_PANEL_TYPE_ID = 'panel_default_400w';

export function createDefaultSimulationPreviewTimestamp(now = new Date()): string {
  return now.toISOString();
}

const DEFAULT_PANEL_TYPE: PanelType = PanelTypeSchema.parse({
  id: DEFAULT_PANEL_TYPE_ID,
  manufacturer: 'Generiek',
  model: '400 Wp mono',
  pmaxW: 400,
  vmpV: 34,
  impA: 11.8,
  vocV: 41,
  iscA: 12.6,
  tempCoeffPmaxPctPerC: -0.35,
  tempCoeffVocPctPerC: -0.28,
  cells: 108,
  bypassDiodes: 3,
  widthM: 1.13,
  heightM: 1.72,
});

export type AddPVArrayInput = Partial<
  Pick<
    PVArray,
    | 'name'
    | 'panelTypeId'
    | 'position'
    | 'rows'
    | 'columns'
    | 'orientation'
    | 'azimuthDeg'
    | 'tiltDeg'
    | 'baseHeightM'
    | 'panelGapM'
    | 'rowGapM'
  >
>;

/** Default height above ground (m) for a newly created PV array. */
export const DEFAULT_ARRAY_BASE_HEIGHT_M = 3;

export type AddSceneObjectInput =
  | ({ kind: 'tree' } & Partial<Omit<TreeObject, 'id' | 'kind'>>)
  | ({ kind: 'building' } & Partial<Omit<BuildingObject, 'id' | 'kind'>>);

export type AddPanelTypeInput = Partial<Omit<PanelType, 'id'>>;
export type AddInverterInput = Partial<Omit<Inverter, 'id' | 'mppts'>> & {
  mppts?: Partial<Omit<MPPT, 'id'>>[];
};
export type AddMPPTInput = Partial<Omit<MPPT, 'id'>>;

interface ProjectStoreState {
  project: Project;
  activeTab: ProjectTab;
  selectedSceneObjectId: string | null;
  selectedPVArrayId: string | null;
  objectMapAddKind: 'tree' | 'building' | null;
  simulationPreviewTimestamp: string;
  setActiveTab: (tab: ProjectTab) => void;
  setSelectedSceneObjectId: (id: string | null) => void;
  setSelectedPVArrayId: (id: string | null) => void;
  setObjectMapAddKind: (kind: 'tree' | 'building' | null) => void;
  setSimulationPreviewTimestamp: (timestamp: string) => void;
  setLocation: (location: Location) => void;
  ensureDefaultPanelType: () => string;
  addSceneObject: (input: AddSceneObjectInput) => SceneObject;
  updateSceneObject: (id: string, patch: Partial<SceneObject>) => void;
  removeSceneObject: (id: string) => void;
  addPanelType: (input?: AddPanelTypeInput) => PanelType;
  updatePanelType: (id: string, patch: Partial<PanelType>) => void;
  removePanelType: (id: string) => void;
  addPVArray: (input?: AddPVArrayInput) => PVArray;
  updatePVArray: (id: string, patch: Partial<PVArray>) => void;
  removePVArray: (id: string) => void;
  addInverter: (input?: AddInverterInput) => Inverter;
  updateInverter: (id: string, patch: Partial<Inverter>) => void;
  removeInverter: (id: string) => void;
  addMPPT: (inverterId: string, input?: AddMPPTInput) => MPPT;
  updateMPPT: (inverterId: string, mpptId: string, patch: Partial<MPPT>) => void;
  removeMPPT: (inverterId: string, mpptId: string) => void;
  addWiringString: (
    inverterId: string,
    mpptId: string,
    panels: WiringString['panels'],
  ) => WiringString;
  removeWiringString: (inverterId: string, mpptId: string, stringId: string) => void;
  replaceProject: (project: Project) => void;
}

const initialLocation: Location = {
  lat: NL_DEFAULT_CENTER.lat,
  lon: NL_DEFAULT_CENTER.lon,
  timezone: 'Europe/Amsterdam',
  label: 'Nederland',
};

function bumpProject(project: Project): Project {
  return { ...project, updatedAt: new Date().toISOString() };
}

function defaultBuildingFootprint(center: { lat: number; lon: number }): [number, number][] {
  const halfWidthDeg = 5 / 111_319 / Math.cos((center.lat * Math.PI) / 180);
  const halfDepthDeg = 4 / 111_319;
  return [
    [center.lon - halfWidthDeg, center.lat - halfDepthDeg],
    [center.lon + halfWidthDeg, center.lat - halfDepthDeg],
    [center.lon + halfWidthDeg, center.lat + halfDepthDeg],
    [center.lon - halfWidthDeg, center.lat + halfDepthDeg],
  ];
}

function nextSelectedIdAfterRemoval<T extends { id: string }>(
  currentSelectedId: string | null,
  removedId: string,
  items: T[],
): string | null {
  if (currentSelectedId !== removedId) return currentSelectedId;
  return items.find((item) => item.id !== removedId)?.id ?? null;
}

function ensureMPPTWiring(
  wiring: MPPTWiring[],
  inverterId: string,
  mpptId: string,
): MPPTWiring[] {
  if (wiring.some((item) => item.inverterId === inverterId && item.mpptId === mpptId)) {
    return wiring;
  }
  return [...wiring, { inverterId, mpptId, strings: [] }];
}

export const useProjectStore = create<ProjectStoreState>((set) => ({
  project: createProject({ name: 'Nieuw project', location: initialLocation }),
  activeTab: 'locatie',
  selectedSceneObjectId: null,
  selectedPVArrayId: null,
  objectMapAddKind: null,
  simulationPreviewTimestamp: createDefaultSimulationPreviewTimestamp(),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedSceneObjectId: (id) => set({ selectedSceneObjectId: id }),
  setSelectedPVArrayId: (id) => set({ selectedPVArrayId: id }),
  setObjectMapAddKind: (kind) => set({ objectMapAddKind: kind }),
  setSimulationPreviewTimestamp: (timestamp) => set({ simulationPreviewTimestamp: timestamp }),
  setLocation: (location) =>
    set((state) => ({
      project: bumpProject({
        ...state.project,
        location,
      }),
    })),
  ensureDefaultPanelType: () => {
    set((state) => {
      if (state.project.pv.panelTypes.some((panelType) => panelType.id === DEFAULT_PANEL_TYPE_ID)) {
        return state;
      }
      return {
        project: bumpProject({
          ...state.project,
          pv: {
            ...state.project.pv,
            panelTypes: [...state.project.pv.panelTypes, DEFAULT_PANEL_TYPE],
          },
        }),
      };
    });
    return DEFAULT_PANEL_TYPE_ID;
  },
  addSceneObject: (input) => {
    let created: SceneObject | null = null;
    set((state) => {
      const position = input.position ?? {
        lat: state.project.location.lat,
        lon: state.project.location.lon,
      };
      created =
        input.kind === 'tree'
          ? TreeObjectSchema.parse({
              id: generateId('tree'),
              name: input.name ?? `Boom ${state.project.scene.objects.length + 1}`,
              position,
              heightM: input.heightM ?? 8,
              crownRadiusM: input.crownRadiusM ?? 3,
              trunkHeightM: input.trunkHeightM ?? 2,
              density: input.density ?? 0.7,
              undergrowth: input.undergrowth ?? 'grass',
              deciduous: input.deciduous ?? true,
              kind: 'tree',
            })
          : BuildingObjectSchema.parse({
              id: generateId('building'),
              name: input.name ?? `Gebouw ${state.project.scene.objects.length + 1}`,
              position,
              footprint: input.footprint ?? defaultBuildingFootprint(position),
              heightM: input.heightM ?? 6,
              kind: 'building',
            });
      return {
        project: bumpProject({
          ...state.project,
          scene: {
            ...state.project.scene,
            objects: [...state.project.scene.objects, created],
          },
        }),
        selectedSceneObjectId: created.id,
        objectMapAddKind: null,
      };
    });
    if (!created) throw new Error('Could not create scene object');
    return created;
  },
  updateSceneObject: (id, patch) =>
    set((state) => {
      const current = state.project.scene.objects.find((item) => item.id === id);
      if (!current) return state;
      const schema = current.kind === 'tree' ? TreeObjectSchema : BuildingObjectSchema;
      const updated = schema.parse({ ...current, ...patch, id: current.id, kind: current.kind });
      return {
        project: bumpProject({
          ...state.project,
          scene: {
            ...state.project.scene,
            objects: state.project.scene.objects.map((item) => (item.id === id ? updated : item)),
          },
        }),
      };
    }),
  removeSceneObject: (id) =>
    set((state) => ({
      project: bumpProject({
        ...state.project,
        scene: {
          ...state.project.scene,
          objects: state.project.scene.objects.filter((item) => item.id !== id),
        },
      }),
      selectedSceneObjectId:
        nextSelectedIdAfterRemoval(state.selectedSceneObjectId, id, state.project.scene.objects),
    })),
  addPanelType: (input = {}) => {
    let created: PanelType | null = null;
    set((state) => {
      created = PanelTypeSchema.parse({
        id: generateId('panel'),
        manufacturer: input.manufacturer ?? 'Handmatig',
        model: input.model ?? `Paneel ${state.project.pv.panelTypes.length + 1}`,
        pmaxW: input.pmaxW ?? 400,
        vmpV: input.vmpV ?? 34,
        impA: input.impA ?? 11.8,
        vocV: input.vocV ?? 41,
        iscA: input.iscA ?? 12.6,
        tempCoeffPmaxPctPerC: input.tempCoeffPmaxPctPerC ?? -0.35,
        tempCoeffVocPctPerC: input.tempCoeffVocPctPerC ?? -0.28,
        cells: input.cells ?? 108,
        bypassDiodes: input.bypassDiodes ?? 3,
        widthM: input.widthM ?? 1.13,
        heightM: input.heightM ?? 1.72,
      });
      return {
        project: bumpProject({
          ...state.project,
          pv: {
            ...state.project.pv,
            panelTypes: [...state.project.pv.panelTypes, created],
          },
        }),
      };
    });
    if (!created) throw new Error('Could not create panel type');
    return created;
  },
  updatePanelType: (id, patch) =>
    set((state) => {
      const current = state.project.pv.panelTypes.find((item) => item.id === id);
      if (!current) return state;
      const updated = PanelTypeSchema.parse({ ...current, ...patch, id: current.id });
      return {
        project: bumpProject({
          ...state.project,
          pv: {
            ...state.project.pv,
            panelTypes: state.project.pv.panelTypes.map((item) => (item.id === id ? updated : item)),
          },
        }),
      };
    }),
  removePanelType: (id) =>
    set((state) => {
      if (state.project.pv.arrays.some((array) => array.panelTypeId === id)) return state;
      return {
        project: bumpProject({
          ...state.project,
          pv: {
            ...state.project.pv,
            panelTypes: state.project.pv.panelTypes.filter((item) => item.id !== id),
          },
        }),
      };
    }),
  addPVArray: (input = {}) => {
    let created: PVArray | null = null;
    set((state) => {
      const panelTypes = state.project.pv.panelTypes;
      const panelTypeId = input.panelTypeId ?? panelTypes[0]?.id ?? DEFAULT_PANEL_TYPE_ID;
      const nextPanelTypes =
        panelTypeId === DEFAULT_PANEL_TYPE_ID &&
        !panelTypes.some((panelType) => panelType.id === DEFAULT_PANEL_TYPE_ID)
          ? [...panelTypes, DEFAULT_PANEL_TYPE]
          : panelTypes;
      created = PVArraySchema.parse({
        id: generateId('array'),
        name: input.name ?? `PV array ${state.project.pv.arrays.length + 1}`,
        panelTypeId,
        position: input.position ?? {
          lat: state.project.location.lat,
          lon: state.project.location.lon,
        },
        rows: input.rows ?? 2,
        columns: input.columns ?? 4,
        orientation: input.orientation ?? 'portrait',
        azimuthDeg: input.azimuthDeg ?? 180,
        tiltDeg: input.tiltDeg ?? 35,
        baseHeightM: input.baseHeightM ?? DEFAULT_ARRAY_BASE_HEIGHT_M,
        panelGapM: input.panelGapM ?? 0.02,
        rowGapM: input.rowGapM ?? 0.3,
      });
      return {
        project: bumpProject({
          ...state.project,
          pv: {
            ...state.project.pv,
            panelTypes: nextPanelTypes,
            arrays: [...state.project.pv.arrays, created],
          },
        }),
        selectedPVArrayId: created.id,
      };
    });
    if (!created) throw new Error('Could not create PV array');
    return created;
  },
  updatePVArray: (id, patch) =>
    set((state) => {
      const array = state.project.pv.arrays.find((item) => item.id === id);
      if (!array) return state;
      const updated = PVArraySchema.parse({ ...array, ...patch, id: array.id });
      return {
        project: bumpProject({
          ...state.project,
          pv: {
            ...state.project.pv,
            arrays: state.project.pv.arrays.map((item) => (item.id === id ? updated : item)),
          },
        }),
      };
    }),
  removePVArray: (id) =>
    set((state) => ({
      project: bumpProject({
        ...state.project,
        pv: {
          ...state.project.pv,
          arrays: state.project.pv.arrays.filter((item) => item.id !== id),
        },
        electrical: {
          ...state.project.electrical,
          wiring: state.project.electrical.wiring
            .map((mpptWiring) => ({
              ...mpptWiring,
              strings: mpptWiring.strings
                .map((string) => ({
                  ...string,
                  panels: string.panels.filter((panel) => panel.arrayId !== id),
                }))
                .filter((string) => string.panels.length > 0),
            }))
            .filter((mpptWiring) => mpptWiring.strings.length > 0),
        },
      }),
      selectedPVArrayId:
        nextSelectedIdAfterRemoval(state.selectedPVArrayId, id, state.project.pv.arrays),
    })),
  addInverter: (input = {}) => {
    let created: Inverter | null = null;
    set((state) => {
      created = InverterSchema.parse({
        id: generateId('inverter'),
        name: input.name ?? `Inverter ${state.project.electrical.inverters.length + 1}`,
        pAcNomW: input.pAcNomW ?? 5000,
        pAcMaxW: input.pAcMaxW ?? 5500,
        pDcMaxW: input.pDcMaxW ?? 7500,
        pBatteryMaxW: input.pBatteryMaxW ?? 0,
        efficiency: input.efficiency ?? 0.97,
        standbyW: input.standbyW ?? 5,
        mppts:
          input.mppts?.map((mppt, index) => ({
            id: generateId('mppt'),
            name: mppt.name ?? `MPPT ${index + 1}`,
            vMinV: mppt.vMinV ?? 120,
            vMaxV: mppt.vMaxV ?? 850,
            vStartV: mppt.vStartV ?? 150,
            iMaxA: mppt.iMaxA ?? 13,
            iScMaxA: mppt.iScMaxA ?? 16,
            pMaxW: mppt.pMaxW ?? 3750,
          })) ?? [
            {
              id: generateId('mppt'),
              name: 'MPPT 1',
              vMinV: 120,
              vMaxV: 850,
              vStartV: 150,
              iMaxA: 13,
              iScMaxA: 16,
              pMaxW: 3750,
            },
          ],
      });
      return {
        project: bumpProject({
          ...state.project,
          electrical: {
            ...state.project.electrical,
            inverters: [...state.project.electrical.inverters, created],
          },
        }),
      };
    });
    if (!created) throw new Error('Could not create inverter');
    return created;
  },
  updateInverter: (id, patch) =>
    set((state) => {
      const current = state.project.electrical.inverters.find((item) => item.id === id);
      if (!current) return state;
      const updated = InverterSchema.parse({ ...current, ...patch, id: current.id });
      return {
        project: bumpProject({
          ...state.project,
          electrical: {
            ...state.project.electrical,
            inverters: state.project.electrical.inverters.map((item) => (item.id === id ? updated : item)),
          },
        }),
      };
    }),
  removeInverter: (id) =>
    set((state) => ({
      project: bumpProject({
        ...state.project,
        electrical: {
          ...state.project.electrical,
          inverters: state.project.electrical.inverters.filter((item) => item.id !== id),
          wiring: state.project.electrical.wiring.filter((item) => item.inverterId !== id),
        },
      }),
    })),
  addMPPT: (inverterId, input = {}) => {
    let created: MPPT | null = null;
    set((state) => {
      const inverter = state.project.electrical.inverters.find((item) => item.id === inverterId);
      if (!inverter) return state;
      created = MPPTSchema.parse({
        id: generateId('mppt'),
        name: input.name ?? `MPPT ${inverter.mppts.length + 1}`,
        vMinV: input.vMinV ?? 120,
        vMaxV: input.vMaxV ?? 850,
        vStartV: input.vStartV ?? 150,
        iMaxA: input.iMaxA ?? 13,
        iScMaxA: input.iScMaxA ?? 16,
        pMaxW: input.pMaxW ?? Math.max(1, inverter.pDcMaxW / Math.max(1, inverter.mppts.length + 1)),
      });
      const updated = InverterSchema.parse({ ...inverter, mppts: [...inverter.mppts, created] });
      return {
        project: bumpProject({
          ...state.project,
          electrical: {
            ...state.project.electrical,
            inverters: state.project.electrical.inverters.map((item) =>
              item.id === inverterId ? updated : item,
            ),
          },
        }),
      };
    });
    if (!created) throw new Error('Could not create MPPT');
    return created;
  },
  updateMPPT: (inverterId, mpptId, patch) =>
    set((state) => {
      const inverter = state.project.electrical.inverters.find((item) => item.id === inverterId);
      const mppt = inverter?.mppts.find((item) => item.id === mpptId);
      if (!inverter || !mppt) return state;
      const updatedMppt = MPPTSchema.parse({ ...mppt, ...patch, id: mppt.id });
      const updated = InverterSchema.parse({
        ...inverter,
        mppts: inverter.mppts.map((item) => (item.id === mpptId ? updatedMppt : item)),
      });
      return {
        project: bumpProject({
          ...state.project,
          electrical: {
            ...state.project.electrical,
            inverters: state.project.electrical.inverters.map((item) =>
              item.id === inverterId ? updated : item,
            ),
          },
        }),
      };
    }),
  removeMPPT: (inverterId, mpptId) =>
    set((state) => {
      const inverter = state.project.electrical.inverters.find((item) => item.id === inverterId);
      if (!inverter || inverter.mppts.length <= 1) return state;
      const updated = InverterSchema.parse({
        ...inverter,
        mppts: inverter.mppts.filter((item) => item.id !== mpptId),
      });
      return {
        project: bumpProject({
          ...state.project,
          electrical: {
            ...state.project.electrical,
            inverters: state.project.electrical.inverters.map((item) =>
              item.id === inverterId ? updated : item,
            ),
            wiring: state.project.electrical.wiring.filter((item) => item.mpptId !== mpptId),
          },
        }),
      };
    }),
  addWiringString: (inverterId, mpptId, panels) => {
    let created: WiringString | null = null;
    set((state) => {
      const inverter = state.project.electrical.inverters.find((item) => item.id === inverterId);
      const mppt = inverter?.mppts.find((item) => item.id === mpptId);
      if (!inverter || !mppt || panels.length === 0) return state;
      created = {
        id: generateId('string'),
        panels,
      };
      const wiring = ensureMPPTWiring(state.project.electrical.wiring, inverterId, mpptId);
      return {
        project: bumpProject({
          ...state.project,
          electrical: {
            ...state.project.electrical,
            wiring: wiring.map((item) =>
              item.inverterId === inverterId && item.mpptId === mpptId
                ? { ...item, strings: [...item.strings, created as WiringString] }
                : item,
            ),
          },
        }),
      };
    });
    if (!created) throw new Error('Could not create wiring string');
    return created;
  },
  removeWiringString: (inverterId, mpptId, stringId) =>
    set((state) => ({
      project: bumpProject({
        ...state.project,
        electrical: {
          ...state.project.electrical,
          wiring: state.project.electrical.wiring
            .map((item) =>
              item.inverterId === inverterId && item.mpptId === mpptId
                ? { ...item, strings: item.strings.filter((string) => string.id !== stringId) }
                : item,
            )
            .filter((item) => item.strings.length > 0),
        },
      }),
    })),
  replaceProject: (project) =>
    set({
      project,
      selectedSceneObjectId: project.scene.objects[0]?.id ?? null,
      selectedPVArrayId: project.pv.arrays[0]?.id ?? null,
      objectMapAddKind: null,
    }),
}));
