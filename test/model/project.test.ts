import { describe, expect, it } from 'vitest';

import {
  createProject,
  deserializeProject,
  generateId,
  serializeProject,
  validateProject,
} from '../../src/model/project';
import { PROJECT_SCHEMA_VERSION } from '../../src/model/schema';

const fixedDate = new Date('2025-01-15T12:00:00.000Z');
const validLocation = { lat: 52.37, lon: 4.9 };

describe('createProject', () => {
  it('produces a schema-valid empty project', () => {
    const project = createProject({
      name: 'Demo',
      location: validLocation,
      now: fixedDate,
      id: 'proj_test',
    });

    expect(project.id).toBe('proj_test');
    expect(project.name).toBe('Demo');
    expect(project.schemaVersion).toBe(PROJECT_SCHEMA_VERSION);
    expect(project.createdAt).toBe(fixedDate.toISOString());
    expect(project.updatedAt).toBe(fixedDate.toISOString());
    expect(project.scene.objects).toEqual([]);
    expect(project.pv.arrays).toEqual([]);
    expect(project.electrical.inverters).toEqual([]);
    expect(project.storage.batteries).toEqual([]);
  });

  it('throws when the location is outside NL', () => {
    expect(() =>
      createProject({ name: 'Demo', location: { lat: 0, lon: 0 } }),
    ).toThrow();
  });

  it('auto-generates an id when none is supplied', () => {
    const a = createProject({ name: 'a', location: validLocation });
    const b = createProject({ name: 'b', location: validLocation });
    expect(a.id).not.toBe(b.id);
    expect(a.id.startsWith('proj_')).toBe(true);
  });
});

describe('generateId', () => {
  it('produces unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId('x')));
    expect(ids.size).toBe(100);
    for (const id of ids) expect(id.startsWith('x_')).toBe(true);
  });
});

describe('validateProject', () => {
  it('returns ok for a valid project', () => {
    const project = createProject({ name: 'Demo', location: validLocation });
    const result = validateProject(project);
    expect(result.ok).toBe(true);
  });

  it('returns a flat error list for invalid input', () => {
    const result = validateProject({ schemaVersion: 1, name: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes('name'))).toBe(true);
    }
  });
});

describe('serialize / deserialize round trip', () => {
  it('preserves all fields', () => {
    const project = createProject({
      name: 'Round Trip',
      location: { ...validLocation, label: 'Amsterdam' },
      now: fixedDate,
      id: 'proj_rt',
    });
    const json = serializeProject(project);
    const restored = deserializeProject(json);
    expect(restored).toEqual(project);
  });

  it('rejects non-JSON input with a clear error', () => {
    expect(() => deserializeProject('{not json')).toThrow(/Invalid JSON/);
  });

  it('rejects schema-violating JSON with field-level errors', () => {
    const bad = JSON.stringify({ schemaVersion: 1, name: '' });
    expect(() => deserializeProject(bad)).toThrow(/Invalid project file/);
  });
});
