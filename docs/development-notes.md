# Development Notes

This document collects conventions, decisions, and notes that help maintain and extend Sunside.

It is intentionally informal and may evolve as the project matures.

## Node, npm, and tooling

- Use **Node 24.x LTS** for development.
  - Older Node versions are not supported by the planned tooling.
- Use the built-in `npm` or any preferred compatible package manager (pnpm, yarn). Examples in docs will use `npm`.
- All Node-based scripts (build, test, data preparation) should:
  - Be deterministic and avoid hidden environment dependencies.
  - Fail clearly with readable error messages if inputs are missing or malformed.

## Project initialization (planned)

When we move to implementation, the steps will likely be:

1. Initialize a new Svelte + TypeScript project with Vite (e.g. via `npm create vite@latest` or Svelte-specific tooling).
2. Configure TypeScript strict mode (or close to it).
3. Add dependencies:
   - `svelte`, `@sveltejs/vite-plugin-svelte`, `vite`.
   - `typescript` and `ts-node` (if needed for scripts).
   - `luxon`, `suncalc`.
   - `vitest` and any related testing utilities.
4. Create the core directory structure described in `README.md` and `docs/architecture.md`.
5. Implement the data preparation scripts in `scripts/` and generate initial `src/data/airports.json` and `src/data/map.json`.
6. Implement core modules in `src/core/` with tests.
7. Implement Svelte UI components and wire them to the core logic.

Exact commands and configuration details will be added to the README once implementation begins.

## Coding conventions (planned)

These are initial guidelines; they can be refined in a future `AGENTS.md` or style guide:

- **TypeScript**
  - Prefer explicit types on public functions and exported symbols.
  - Avoid `any` where possible; use specific union and object types instead.
  - Keep functions small and focused; separate math/time logic from formatting and UI.

- **Svelte**
  - Keep components focused: separate form controls, map, timeline, and summary rather than a monolithic component.
  - Use props and events for communication between components; avoid global stores unless necessary.
  - Avoid heavy styling frameworks; favor simple CSS or a lightweight utility approach if needed.

- **General**
  - No unnecessary external libraries; consider standard APIs and small custom functions first.
  - Document non-trivial algorithms and data transformations in comments or docs.
  - Keep interfaces in `src/core` UI-agnostic so they can be tested and reused easily.

These conventions will be revisited once real code exists, and a dedicated `AGENTS.md` may be added to formalize them.

## Future enhancements (ideas)

Some ideas that could be explored after the initial version:

- **More detailed day/night classification**
  - Distinguish civil, nautical, and astronomical twilight visually.

- **Seat-side detail**
  - Allow the user to input their seat (e.g. A/F) and indicate more specifically whether the sun will be in their window.

- **Multiple legs**
  - Support connecting flights by sequencing multiple `FlightPlan` segments.

- **Localization**
  - Translate UI labels and date/time formatting for different locales.

- **Offline usage**
  - Ensure assets are small and possibly support a simple offline caching strategy.

These are out of scope for the initial implementation but can guide architectural decisions (e.g. keeping core logic decoupled from UI).

## Recent notes (data prep)

- `scripts/prepare-airports.ts` is implemented (filters OurAirports CSV, derives tz via `tz-lookup`, writes `src/data/airports.json`).
- Run with `npm run prepare:airports`; it will auto-download `data/airports.csv` if missing. Optional `data/airport-allowlist.json` can force inclusion of specific ids/idents.
- Uses dev-only dependencies: `csv-parse` (sync), `tz-lookup`, and `tsx` for running the script without a build step.
- If `nvm` is not installed locally, engine warnings may appear when using Node versions outside the pinned `>=24 <25` range.
- `scripts/prepare-map.ts` is implemented; `npm run prepare:map` will auto-download `data/world-countries-110m.json` (TopoJSON, lower detail for performance) and write `src/data/map.json` using a fixed equirectangular projection (1800x900) with rounding/simplification to reduce SVG weight. Dev-only dependency: `topojson-client`.
- Recent data run (Node 24 as reported by user): `airports.json` contains 8,983 records; `map.json` contains 236 countries.

## Recent notes (UI/daylight overlay)

- The map now renders as a static SVG image (`public/map.svg`) with pan/zoom (1–4x) and clamped bounds; pointer capture prevents accidental text selection when dragging.
- Added sun visualization: subsolar point indicator, day/night polygons, and terminator line derived from `approximateTerminator` + `getSubsolarPoint`.
- Current flight sample time drives the overlay; when no flight is present the overlay falls back to the current time.
- Theme slightly lightened to make daylight overlay visible while keeping a dark UI.
