# Sunside – Flight Sunlight Visualizer

Sunside is a static web application (inspired by sunflight.org) that lets you:

- Select a departure and arrival airport.
- Enter local departure and arrival date/times (in each airport’s local time).
- Visualize the great-circle flight path on a world map.
- Scrub through the flight timeline and see:
  - Where the aircraft is along the route.
  - Day/night regions of the Earth (terminator).
  - Position of the sun (subsolar point).
  - Which side of the aircraft the sun is shining on over time.

This repository contains the full implementation: **core logic**, a **Svelte UI**, **data prep scripts**, and **tests**.

The main intent is practical: help decide which side of the aircraft to sit on by visualizing sunlight over time.

## Quickstart

```bash
npm install
npm run dev
```

Run tests once:

```bash
npm test -- --run
```

`npm test` starts Vitest in watch mode.

## Project goals

- Fully static HTML/JS/CSS output that can be hosted on GitHub Pages.
- Minimal, well-chosen dependencies, all open source and actively maintained where possible.
- No external mapping APIs (e.g. Google Maps); the world map is a static vector asset.
- Good mobile experience (mobile-first UI) with a usable desktop layout.
- Clear, well-documented architecture and an automated test suite.

## High-level architecture

- **Frontend framework**: Svelte with TypeScript, bundled via Vite into a static site.
- **Runtime responsibilities**:
  - Load a preprocessed static airport dataset (subset of OurAirports).
  - Render a static world map vector (`public/map.svg`).
  - Accept user input (airports, dates/times).
  - Use Luxon to convert local times (per-airport time zones) to UTC.
  - Use custom great-circle math to compute the flight path and aircraft position over time.
  - Use SunCalc to compute sun position at the aircraft location and classify day/night.
  - Compute the global day/night terminator and subsolar point for the current time.
  - Render the map, route, aircraft, and day/night overlay, with timeline scrubbing.
- **Build-time tooling**:
  - Node-based scripts to:
    - Download and preprocess OurAirports data into a static JSON file.
    - Convert Natural Earth / world-atlas TopoJSON into a compact map dataset used by the client.
    - Build `public/map.svg` from the processed map dataset.

Details are in `docs/architecture.md`, `docs/tech-stack.md`, and `docs/data-sources.md`.

## Tech stack

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

## Repository structure

- `src/`
  - `core/`
    - `geo.ts` – great-circle math, projections.
    - `time.ts` – Luxon-based helpers for time zone conversions.
    - `airportSearch.ts` – ranked, diacritic-insensitive airport search (typeahead).
    - `sun.ts` – SunCalc wrapper + subsolar helpers.
    - `daynight.ts` – day/night overlay (terminator + SVG paths).
    - `flight.ts` – flight plan and timeline sampling logic.
  - `data/`
    - `airports.json` – preprocessed airport list.
    - `map.json` – preprocessed map geometry in projected coordinates.
  - `ui/`
    - `App.svelte` – current UI (flight setup, timeline, map).
- `public/`
  - Static assets (e.g. `map.svg`).
- `scripts/`
  - `prepare-airports.*` – Node script to build `airports.json`.
  - `prepare-map.*` – Node script to build `map.json`.
  - `build-map-svg.*` – Node script to build `public/map.svg` from `map.json`.
- `tests/`
  - Unit test files for `src/core/...` using Vitest.
- `docs/`
  - Architecture and development documentation (see below).

## Data prep scripts

- `npm run prepare:airports` – generates `src/data/airports.json` (downloads `data/airports.csv` if missing).
- `npm run prepare:map` – generates `src/data/map.json` (downloads TopoJSON if missing).
- `npm run build:map-svg` – generates `public/map.svg` from `src/data/map.json`.

## Documentation

The main documentation lives in the `docs/` directory:

- `docs/architecture.md` – System architecture, main modules, and data flow.
- `docs/tech-stack.md` – Libraries, tools, and version notes.
- `docs/data-sources.md` – Map and airport data sources, licensing, and preprocessing steps.
- `docs/testing.md` – Testing strategy and how to run tests.
- `docs/development-notes.md` – Conventions, future ideas, and notes for contributors.

Please start with `docs/architecture.md`.

## Notes on accuracy

- The global day/night overlay is the geometric terminator (sun altitude > 0), computed from the subsolar point; twilight bands are not shown yet.
- The “sun” marker is the subsolar point (sun at zenith).
- Aircraft-local sunlight (day/night + relative left/right) is computed at the aircraft position using SunCalc.

## Known issues

- None currently tracked in-repo; if you spot map rendering artifacts, please include a screenshot and the generated `public/map.svg`.

## Status and next steps

Current status:

- Core math/time/sun/day-night/flight modules implemented with tests.
- UI implemented (flight setup, timeline slider, route rendering, pan/zoom map, sun + day/night overlay).
- Data prep scripts implemented and runnable (`prepare:airports`, `prepare:map`, `build:map-svg`); generated datasets are present.

Next steps:

- Refactor `src/ui/App.svelte` into smaller components as the UI grows.
- Add timeline playback controls and optional twilight visualization.
