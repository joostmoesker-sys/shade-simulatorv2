/**
 * Global project store. Phase 1 owns only the active project plus a small
 * "current view tab" so the app shell can switch between the future PRD
 * tabs without yet implementing them.
 */
import { create } from 'zustand';

import { createProject } from '../model/project';
import type { Location, Project } from '../model/schema';
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

interface ProjectStoreState {
  project: Project;
  activeTab: ProjectTab;
  setActiveTab: (tab: ProjectTab) => void;
  setLocation: (location: Location) => void;
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
  replaceProject: (project) => set({ project }),
}));
