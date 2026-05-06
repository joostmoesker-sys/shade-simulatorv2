import { useRef, useState, type ChangeEvent } from 'react';

import { deserializeProject, serializeProject } from '../model/project';
import { useProjectStore } from '../store/projectStore';

function safeFileName(name: string): string {
  const cleaned = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  return `${cleaned || 'shade-project'}.json`;
}

function readFileText(file: File): Promise<string> {
  if ('text' in file && typeof file.text === 'function') {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsText(file);
  });
}

export function ProjectFileActions() {
  const project = useProjectStore((s) => s.project);
  const replaceProject = useProjectStore((s) => s.replaceProject);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    setError(null);
    const blob = new Blob([serializeProject(project)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = safeFileName(project.name);
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleLoad = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const loaded = deserializeProject(await readFileText(file));
      replaceProject(loaded);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="project-file-actions">
      <button type="button" onClick={handleSave}>
        Project opslaan
      </button>
      <button type="button" onClick={() => inputRef.current?.click()}>
        Project laden
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="visually-hidden"
        aria-label="Projectbestand kiezen"
        onChange={handleLoad}
      />
      {error && (
        <span role="alert" className="error">
          {error}
        </span>
      )}
    </div>
  );
}
