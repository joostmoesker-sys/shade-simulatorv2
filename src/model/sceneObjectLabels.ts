import type { SceneObject } from './schema';

export function sceneObjectKindLabel(kind: SceneObject['kind']): string {
  switch (kind) {
    case 'tree':
      return 'Boom';
    case 'building':
      return 'Gebouw';
    case 'box':
      return 'Object';
  }
}
