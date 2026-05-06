/**
 * JSON Schema generation for the Project model.
 *
 * The TypeScript types and runtime validation live in `./schema.ts` (Zod).
 * This module derives a JSON Schema (draft-07) from the Zod schema so that
 * external tooling – editors, validators, documentation generators – can
 * also consume the project file format.
 */
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ProjectSchema } from '../model/schema';

/**
 * Build the JSON Schema describing the project file format.
 * Returned as a plain object so it can be `JSON.stringify`'d directly.
 */
export function buildProjectJsonSchema(): Record<string, unknown> {
  return zodToJsonSchema(ProjectSchema, {
    name: 'Project',
    $refStrategy: 'root',
  }) as Record<string, unknown>;
}
