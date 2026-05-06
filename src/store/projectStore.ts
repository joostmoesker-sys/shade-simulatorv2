/**
 * Global project store. The store owns the active project and UI workflow tab,
 * plus project mutations used by the implemented editor tabs.
 */
import { create } from 'zustand';

import { createProject, generateId } from '../model/project';
import {
  PanelTypeSchema,
  PVArraySchema,
  type Location,
  type PanelType,
  type Project,
  type PVArray,
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
  { id: 'bekabeling', label: 'Bekabeling' },
  { id: 'inverters', label: 'Inverters' },
  { id: 'accu-verbruik', label: 'Accu & Verbruik' },
  { id: 'simulatie', label: 'Simulatie' },
  { id: 'resultaten', label: 'Resultaten' },
];

export const DEFAULT_PANEL_TYPE_ID = 'panel_default_400w';

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

interface ProjectStoreState {
  project: Project;
  activeTab: ProjectTab;
  setActiveTab: (tab: ProjectTab) => void;
  setLocation: (location: Location) => void;
  ensureDefaultPanelType: () => string;
  addPVArray: (input?: AddPVArrayInput) => PVArray;
  updatePVArray: (id: string, patch: Partial<PVArray>) => void;
  removePVArray: (id: string) => void;
  replaceProject: (project: Project) => void;
}

const initialLocation: Location = {
  lat: NL_DEFAULT_CENTER.lat,
  lon: NL_DEFAULT_CENTER.lon,
  timezone: 'Europe/Amsterdam',
  label: 'Nederland',
};

export const useProjectStore = create<ProjectStoreState>((set) => ({
  project: createProject({ name: 'Nieuw project', location: initialLocation }),
  activeTab: 'locatie',
  setActiveTab: (tab) => set({ activeTab: tab }),
  setLocation: (location) =>
    set((state) => ({
      project: {
        ...state.project,
        location,
        updatedAt: new Date().toISOString(),
      },
    })),
  ensureDefaultPanelType: () => {
    set((state) => {
      if (state.project.pv.panelTypes.some((panelType) => panelType.id === DEFAULT_PANEL_TYPE_ID)) {
        return state;
      }
      return {
        project: {
          ...state.project,
          updatedAt: new Date().toISOString(),
          pv: {
            ...state.project.pv,
            panelTypes: [...state.project.pv.panelTypes, DEFAULT_PANEL_TYPE],
          },
        },
      };
    });
    return DEFAULT_PANEL_TYPE_ID;
  },
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
        project: {
          ...state.project,
          updatedAt: new Date().toISOString(),
          pv: {
            ...state.project.pv,
            panelTypes: nextPanelTypes,
            arrays: [...state.project.pv.arrays, created],
          },
        },
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
        project: {
          ...state.project,
          updatedAt: new Date().toISOString(),
          pv: {
            ...state.project.pv,
            arrays: state.project.pv.arrays.map((item) => (item.id === id ? updated : item)),
          },
        },
      };
    }),
  removePVArray: (id) =>
    set((state) => ({
      project: {
        ...state.project,
        updatedAt: new Date().toISOString(),
        pv: {
          ...state.project.pv,
          arrays: state.project.pv.arrays.filter((item) => item.id !== id),
        },
      },
    })),
  replaceProject: (project) => set({ project }),
}));
