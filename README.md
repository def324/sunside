# Sunside – Flight Sunlight Visualizer

Sunside is a static web application (inspired by sunflight.org) that lets you:

- Select a departure and arrival airport.
- Enter local departure and arrival date/times (in each airport’s local time).
- Visualize the great-circle flight path on a world map.
- Scrub or play through the flight timeline and see:
  - Where the aircraft is along the route.
  - Day/night regions of the Earth.
  - Approximate position of the sun.
  - Which side of the aircraft the sun is shining on over time.

This repository currently contains **core logic, data prep scripts, and documentation**. UI wiring is still to come.

## Project goals

- Fully static HTML/JS/CSS output that can be hosted on GitHub Pages.
- Minimal, well-chosen dependencies, all open source and actively maintained where possible.
- No external mapping APIs (e.g. Google Maps); the world map is a static vector asset.
- Good mobile experience (mobile-first UI) with a usable desktop layout.
- Clear, well-documented architecture and an automated test suite once implementation starts.

## High-level architecture

- **Frontend framework**: Svelte with TypeScript, bundled via Vite into a static site.
- **Runtime responsibilities**:
  - Load a preprocessed static world map dataset.
  - Load a preprocessed static airport dataset (subset of OurAirports).
  - Accept user input (airports, dates/times).
  - Use Luxon to convert local times (per-airport time zones) to UTC.
  - Use custom great-circle math to compute the flight path and aircraft position over time.
  - Use SunCalc to compute sun position and day/night boundaries.
  - Render the map, route, aircraft, and day/night overlay, with timeline playback.
- **Build-time tooling**:
  - Node-based scripts to:
    - Download and preprocess OurAirports data into a static JSON file.
    - Convert Natural Earth / world-atlas TopoJSON into a compact map dataset used by the client.

Details are in `docs/architecture.md`, `docs/tech-stack.md`, and `docs/data-sources.md`.

## Tech stack (planned)

Implementation has not started yet. The planned tech stack is:

- **Language**: TypeScript (for core logic and Svelte components).
- **Framework**: Svelte.
- **Bundler/dev server**: Vite.
- **Date/time & time zones**: Luxon (`DateTime` with IANA zones via browser `Intl`).
- **Sun position / daylight**: SunCalc.
- **Map data**: Natural Earth admin-0 (countries), via a vendored TopoJSON snapshot from `topojson/world-atlas` converted to a custom static format.
- **Airports data**: OurAirports open data CSV → filtered & converted to JSON.
- **Testing**: Vitest (unit tests against the TypeScript core modules).

See `docs/tech-stack.md` for more details and rationale.

## Node and tooling requirements

We will use Node for development tooling and build scripts (not at runtime on the client).

- **Required Node version**: Node.js 24.x LTS
  - The tooling and scripts will assume Node 24.x and are not intended to support older Node versions.
- **Package manager**: npm (bundled with Node) or an alternative like pnpm/yarn if desired.

Package metadata:

- `"type": "module"` (ESM)
- Key scripts: `dev`, `build`, `preview`, `test`, `prepare:airports`, `prepare:map`

## Repository structure (planned)

Planned structure once implementation begins:

- `src/`
  - `core/`
    - `geo.ts` – great-circle math, projections.
    - `time.ts` – Luxon-based helpers for time zone conversions.
    - `sun.ts` – wrapper around SunCalc and any sun/daylight helpers.
    - `flight.ts` – flight plan and timeline sampling logic.
  - `data/`
    - `airports.json` – preprocessed airport list.
    - `map.json` – preprocessed map geometry in projected coordinates.
  - `ui/`
    - Svelte components (e.g. `App.svelte`, `MapView.svelte`, `AirportSelector.svelte`).
- `public/`
  - Static assets (e.g. favicon, maybe raw SVG preview).
- `scripts/`
  - `prepare-airports.*` – Node script to build `airports.json`.
  - `prepare-map.*` – Node script to build `map.json`.
- `tests/`
  - Unit test files for `src/core/...` using Vitest.
- `docs/`
  - Architecture and development documentation (see below).

These paths and filenames may be slightly adjusted during implementation, but the overall layout will remain similar.

## Documentation

The main documentation lives in the `docs/` directory:

- `docs/architecture.md` – System architecture, main modules, and data flow.
- `docs/tech-stack.md` – Libraries, tools, and version notes.
- `docs/data-sources.md` – Map and airport data sources, licensing, and preprocessing steps.
- `docs/testing.md` – Testing strategy and how to run tests (once implementation exists).
- `docs/development-notes.md` – Conventions, future ideas, and notes for contributors.

Please start with `docs/architecture.md`.

## Status and next steps

Current status:

- Requirements gathered and architecture documented.
- Core math/time/sun/flight modules implemented with tests.
- Data prep scripts implemented and runnable (`prepare:airports`, `prepare:map`); generated datasets are present.

Next steps:

- Build the Svelte UI and wire it to the core logic and datasets.
- Polish UX and verify behavior across a range of flights.
