/**
 * Project repository: high-level operations on a `Project`.
 *
 * Responsibilities:
 *  - Create empty / default projects.
 *  - Validate arbitrary input against the schema.
 *  - Serialize / deserialize projects to/from JSON strings.
 *
 * The repository is purposefully stateless – persistence (IndexedDB, file
 * system, server) is layered on top of these primitives.
 */
import {
  LocationSchema,
  PROJECT_SCHEMA_VERSION,
  ProjectSchema,
  type Location,
  type Project,
} from './schema';

export interface CreateProjectInput {
  name: string;
  /** Location input. `timezone` may be omitted; defaults to Europe/Amsterdam. */
  location: import('zod').input<typeof LocationSchema>;
  /** Optional override for `id`, mainly useful in tests for reproducibility. */
  id?: string;
  /** Optional override for the `createdAt`/`updatedAt` timestamps. */
  now?: Date;
}

/**
 * Generate a random identifier. Uses `crypto.randomUUID` when available and
 * falls back to a counter-based identifier so the function never throws in
 * environments without a crypto implementation (e.g. ancient runtimes).
 */
let _idCounter = 0;
export function generateId(prefix = 'id'): string {
  const cryptoObj: Crypto | undefined =
    typeof globalThis !== 'undefined' ? (globalThis as { crypto?: Crypto }).crypto : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return `${prefix}_${cryptoObj.randomUUID()}`;
  }
  _idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${_idCounter}`;
}

/** Create a new, empty project at the given location. */
export function createProject(input: CreateProjectInput): Project {
  const now = (input.now ?? new Date()).toISOString();
  // Normalise the location through its schema so defaults (e.g. timezone) are
  // applied and out-of-bounds inputs fail fast with a clear error.
  const location: Location = LocationSchema.parse(input.location);
  const candidate: Project = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: input.id ?? generateId('proj'),
    name: input.name,
    createdAt: now,
    updatedAt: now,
    location,
    scene: { objects: [] },
    pv: { panelTypes: [], arrays: [] },
    electrical: { inverters: [], wiring: [] },
    storage: { batteries: [] },
    loads: { base: [], heatPumps: [] },
    tariffs: [],
  };
  // Validate so creation always returns a schema-conformant value.
  return ProjectSchema.parse(candidate);
}

/**
 * Result of a non-throwing validation. Mirrors Zod's safeParse but normalises
 * the error to a flat list of human-readable messages for UI consumption.
 */
export type ValidationResult =
  | { ok: true; project: Project }
  | { ok: false; errors: string[] };

export function validateProject(input: unknown): ValidationResult {
  const parsed = ProjectSchema.safeParse(input);
  if (parsed.success) {
    return { ok: true, project: parsed.data };
  }
  const errors = parsed.error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join('.') : '<root>';
    return `${path}: ${issue.message}`;
  });
  return { ok: false, errors };
}

/** Serialize a project to a stable JSON string suitable for export. */
export function serializeProject(project: Project): string {
  // Validate before serializing to guarantee on-disk integrity.
  const validated = ProjectSchema.parse(project);
  return JSON.stringify(validated, null, 2);
}

/**
 * Parse a JSON string into a `Project`. Throws an `Error` with a readable
 * message when the JSON is invalid or does not match the schema.
 */
export function deserializeProject(json: string): Project {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (err) {
    throw new Error(`Invalid JSON: ${(err as Error).message}`);
  }
  const result = validateProject(raw);
  if (!result.ok) {
    throw new Error(`Invalid project file:\n${result.errors.join('\n')}`);
  }
  return result.project;
}
