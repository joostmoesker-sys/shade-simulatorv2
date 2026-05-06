import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ProjectFileActions } from '../../src/components/ProjectFileActions';
import { createProject, serializeProject } from '../../src/model/project';
import { useProjectStore } from '../../src/store/projectStore';

const validLocation = { lat: 52.0, lon: 5.0, timezone: 'Europe/Amsterdam' };

describe('<ProjectFileActions>', () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: createProject({ name: 'Demo', location: validLocation, id: 'proj_demo' }),
      activeTab: 'locatie',
      selectedSceneObjectId: null,
      selectedPVArrayId: null,
      objectMapAddKind: null,
    });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:test'),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  it('exports the current project as a JSON download', () => {
    render(<ProjectFileActions />);

    fireEvent.click(screen.getByRole('button', { name: 'Project opslaan' }));

    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
  });

  it('loads a valid project file', async () => {
    const project = createProject({ name: 'Geladen', location: validLocation, id: 'proj_loaded' });
    const file = new File([serializeProject(project)], 'project.json', { type: 'application/json' });

    render(<ProjectFileActions />);
    fireEvent.change(screen.getByLabelText('Projectbestand kiezen'), { target: { files: [file] } });

    await waitFor(() => {
      expect(useProjectStore.getState().project.id).toBe('proj_loaded');
    });
  });
});
