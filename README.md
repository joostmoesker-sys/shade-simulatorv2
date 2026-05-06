# shade-simulatorv2

Generic PV, shade and battery simulator for the Netherlands. This repository
hosts a rewrite of the [`shade-analyser`](https://github.com/joostmoesker-sys/shade-analyser)
prototype as a generic, location-independent client-side tool.

The full Product Requirements Document lives in [`docs/PRD.md`](docs/PRD.md).

## Phase 2 (current)

The phase 1 foundation is complete. Phase 2 continues with the first project
editor beyond location selection:

- Vite + React + TypeScript application scaffold.
- Project domain model with Zod schemas (`src/model/schema.ts`) as the single
  source of truth, plus a derived JSON Schema export
  (`src/schema/jsonSchema.ts`) for project files.
- Project repository helpers (`createProject`, `validateProject`,
  `serializeProject`, `deserializeProject`).
- Location module with Netherlands bounds checking and a Nominatim geocoder.
- OpenStreetMap-backed MapLibre map canvas.
- App shell with the eight PRD workflow tabs and a working `Locatie` tab.
- `PV Arrays` tab with default panel type creation, editable array properties,
  and a panel-grid preview for rows, columns, orientation, dimensions and kWp.
- All functionality is covered by unit/integration tests written using a
  TDD workflow with [Vitest](https://vitest.dev/).

## Getting started

```bash
npm install
npm run dev      # start the dev server on http://localhost:5173
npm run test     # run the full test suite
npm run lint     # ESLint
npm run build    # type-check and produce a production build in dist/
```

## Project layout

```
src/
  model/        Project domain model (Zod schemas, repository helpers)
  schema/       JSON Schema export
  location/     NL bounds + Nominatim geocoding
  map/          OpenStreetMap raster style + MapLibre React wrapper
  store/        Zustand store for the active project
  components/   React UI (Locatie tab, …)
test/
  …             Mirrors the src/ tree, one Vitest file per module
docs/
  PRD.md        Product Requirements Document
```
