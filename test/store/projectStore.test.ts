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
});
