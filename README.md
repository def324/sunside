# Sunside – Flight Sunlight Visualizer

## Credit / inspiration

Sunside is heavily inspired by [sunflight.org](https://sunflight.org) — it’s a fantastic tool and deserves the credit for popularizing this “sun side seat” visualization.

As of December 2025, sunflight.org appears to be unavailable. If/when it comes back, it’s worth using — it’s a great reference implementation. This project exists as a lightweight alternative that keeps the idea alive (and open source).

## What it does

Sunside is a static web application that lets you:

- Select a departure and arrival airport.
- Enter local departure and arrival date/times (in each airport’s local time).
- Optionally auto-estimate the arrival time from route distance.
- Remember a few UI preferences (auto-estimate toggle, distance units, pace) in local storage.
- Visualize the great-circle flight path on a world map.
- Scrub through (or play) the flight timeline and see:
  - Where the aircraft is along the route.
  - Day/night regions of the Earth (terminator).
  - Position of the sun (subsolar point).
  - Sunlight at the aircraft (day/twilight/night + left/right/ahead/behind when visible).
  - Route summary (duration + distance; defaults to km/mi by locale, click to cycle km/mi/nmi).

This repository contains the full implementation: **core logic**, a **Svelte UI**, **data prep scripts**, and **tests**.

The main intent is practical: help decide which side of the aircraft to sit on by visualizing sunlight over time.

## AI-assisted development

This project is developed using AI models with human oversight. AI assistance is used for things like code generation, refactoring, and debugging; changes are reviewed and validated with tests.

## Quickstart

```bash
npm install
npm run dev
```

Run tests once:

```bash
npm test -- --run
```

`npm test` starts Vitest in watch mode (blocks / keeps running).

On first load, the app defaults to `AMS → GRU` on today’s date (`11:00` departure, `19:00` arrival; local times). Auto-estimate is enabled, but the initial arrival time is a curated example; changing route/departure will apply auto-estimate.

## Project goals

- Fully static HTML/JS/CSS output that can be hosted on GitHub Pages.
- Minimal, well-chosen dependencies, all open source and actively maintained where possible.
- No external mapping APIs (e.g. Google Maps); the world map is a static vector asset.
- Good mobile experience (mobile-first UI) with a usable desktop layout.
  - Wide screens (≥1250px) show map + timeline side-by-side.
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

## Tooling and full build

Sunside is fully static at runtime, but uses Node.js for development tooling and build-time data preparation.

- **Required Node version**: Node.js 24.x LTS (see `package.json` engines)
- **Package manager**: npm (bundled with Node)

### npm scripts

- `npm run dev` – start the dev server
- `npm test -- --run` – run the unit tests once (recommended for one-off checks / CI)
- `npm test` – start the unit tests in watch mode (blocks / keeps running)
- `npm run build` – build the static site into `dist/`
- `npm run build:all` – regenerate data/assets + run tests + build (see below)
- `npm run preview` – serve `dist/` locally

### Data preparation (optional)

The repository includes generated datasets/assets so you can typically just run `npm run dev` / `npm run build`.

If you want to regenerate data from upstream sources:

- `npm run prepare:airports`
  - downloads `data/airports.csv` (OurAirports) if missing
  - generates `src/data/airports.json`
- `npm run prepare:map`
  - downloads a world-atlas TopoJSON snapshot into `data/` if missing
  - generates `src/data/map.json` (projected equirectangular geometry)
- `npm run build:map-svg`
  - generates `public/map.svg` from `src/data/map.json`

These scripts require network access unless the referenced `data/*` snapshots are already present.

### End-to-end rebuild from scratch

```bash
npm install
npm run build:all
npm run preview
```

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
    - `App.svelte` – UI orchestrator (state, derived values, event handlers).
    - `components/` – presentational panels (`FlightSetupPanel`, `TimelinePanel`, `MapPanel`).
    - `app.css` – global UI styles (imported from `src/main.ts`).
    - `types.ts` – shared UI types (airports record type, timeline info, etc).
- `public/`
  - Static assets (e.g. `map.svg`).
- `scripts/`
  - `prepare-airports.ts` – Node script to build `airports.json`.
  - `prepare-map.ts` – Node script to build `map.json`.
  - `build-map-svg.ts` – Node script to build `public/map.svg` from `map.json`.
- `tests/`
  - Unit test files for `src/core/...` using Vitest.
- `docs/`
  - Architecture and development documentation (see below).

## Documentation

The main documentation lives in the `docs/` directory:

- `docs/architecture.md` – System architecture, main modules, and data flow.
- `docs/tech-stack.md` – Libraries, tools, and version notes.
- `docs/data-sources.md` – Map and airport data sources, licensing, and preprocessing steps.
- `docs/testing.md` – Testing strategy and how to run tests.
- `docs/development-notes.md` – Conventions, future ideas, and notes for contributors.

Please start with `docs/architecture.md`.

## Notes on accuracy

- The global overlay renders day/night (sun altitude > 0) plus a subtle **civil twilight** band (sun altitude between `0°` and `-6°`), computed from the subsolar point.
- The “sun” marker is the subsolar point (sun at zenith).
- Aircraft-local sunlight (day/twilight/night + relative direction) is computed at the aircraft position using SunCalc.
- “Auto-estimate arrival time” assumes a typical cruise speed and rounds up to 30 minutes; it’s meant for planning and visualization, not schedule accuracy.

## Status and next steps

Current status:

- Core math/time/sun/day-night/flight modules implemented with tests.
- UI implemented (flight setup, timeline play/scrub controls, route rendering, pan/zoom map, sun + day/night overlay).
- UI is split into coarse panels under `src/ui/components/` with global styling in `src/ui/app.css`.
- Data prep scripts implemented and runnable (`prepare:airports`, `prepare:map`, `build:map-svg`); generated datasets are present.

Next steps:

- If the UI grows further: move more state/logic out of `App.svelte` into dedicated modules/stores and/or extract finer-grained components.
