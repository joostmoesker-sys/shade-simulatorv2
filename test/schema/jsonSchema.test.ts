import { describe, expect, it } from 'vitest';

import { buildProjectJsonSchema } from '../../src/schema/jsonSchema';

describe('buildProjectJsonSchema', () => {
  const schema = buildProjectJsonSchema();

  it('produces a JSON-serializable object', () => {
    expect(() => JSON.stringify(schema)).not.toThrow();
  });

  it('declares the Project type as the root', () => {
    expect(schema).toHaveProperty('$ref');
    expect(schema).toHaveProperty('definitions');
  });

  it('exposes core project properties via the definitions', () => {
    const text = JSON.stringify(schema);
    for (const expected of [
      'schemaVersion',
      'location',
      'pv',
      'electrical',
      'storage',
      'tariffs',
    ]) {
      expect(text.includes(expected)).toBe(true);
    }
  });
});
