# Tech Stack

This document explains the planned technology choices for Sunside and the rationale behind them. No production code has been written yet; this is the target stack for implementation.

## Runtime environment

- **Target platform**: Modern browsers with ES2018+ support and `Intl` APIs.
- **Hosting**: Any static hosting platform (e.g. GitHub Pages).
- **Runtime characteristics**:
  - Single-page client-side app.
  - No server-side rendering.
  - No backend services; all computation is in the browser.

## Languages and framework

- **TypeScript**
  - Used for all core logic and Svelte components.
  - Provides type safety for math-heavy modules (geo, sun, time), reducing subtle bugs.

- **Svelte**
  - Small runtime footprint and simple reactivity model.
  - Compiles to minimal JavaScript, which aligns with the desire to keep bundle size low.
  - Good support for TypeScript and Vite.
  - Chosen over React/Preact to avoid heavier ecosystems and to better match preference.

## Build tools

- **Vite**
  - Development server with fast HMR.
  - Production bundling (Rollup-based) with tree shaking and code splitting.
  - Native TypeScript support.
  - Good Svelte integration via official plugins.

- **Node.js (development only)**
  - Used to run Vite, scripts, and tests.
  - **Required version**: Node 24.x LTS
    - Tooling and scripts are expected to run under Node 24.x; older Node versions are not a target.

## Core libraries

### Time and time zones – Luxon

- **Library**: [Luxon](https://github.com/moment/luxon) (MIT).
- **Why**:
  - Modern replacement for Moment.js with better API design.
  - Built on top of native `Intl`, so it does not ship time zone data itself.
  - Supports IANA time zones, durations, and formatting.
- **Usage in Sunside**:
  - Parse user-supplied local date/time in the context of an airport’s IANA zone.
  - Convert local times to UTC and vice versa.
  - Format departure/arrival and event times in user-friendly forms.

### Sun position and daylight – SunCalc

- **Library**: [SunCalc](https://github.com/mourner/suncalc) (BSD-2-Clause).
- **Why**:
  - Small, dependency-free library focused on sun/moon positions and phases.
  - Widely used and battle-tested, even though the algorithm domain is stable and the repo is not changing frequently.
  - BSD-licensed, compatible with the project’s licensing goals.
- **Usage in Sunside**:
  - For a given UTC timestamp and geographic coordinates:
    - Compute sun azimuth and altitude.
    - Determine whether the location is in day/night or twilight.
  - Generate data needed to approximate the day/night terminator line across the map.

### Map data – Natural Earth via world-atlas snapshot

- **Data source**: Natural Earth admin-0 (countries) at 1:50m resolution.
- **Distribution**: TopoJSON from the archived `topojson/world-atlas` repository (e.g. `countries-50m.json`).
- **Why this choice**:
  - Natural Earth is a widely used, high-quality public domain dataset.
  - `world-atlas` provides a convenient, pre-built TopoJSON representation.
  - Although the `world-atlas` repo is archived, it is static data rather than a library that must receive frequent updates.
  - We will **vendor** a specific TopoJSON file into this repository and treat it as a static asset, avoiding a runtime dependency on the archived project.
- **Usage in Sunside**:
  - A Node script converts the TopoJSON into a custom `map.json`:
    - Optionally using `topojson-client` (in Node only) to decode TopoJSON.
    - Projecting coordinates into an equirectangular coordinate system.
    - Optionally simplifying the geometry to meet bundle size goals.
  - The browser loads `map.json` and renders it directly with Svelte.

### Airports data – OurAirports

- **Data source**: OurAirports open data (`airports.csv` and possibly `countries.csv`/`regions.csv`).
- **Why**:
  - Widely used community dataset of airports with coordinates and metadata.
  - Regularly updated, with a clear open data policy.
  - CSV format is straightforward to process with Node scripts.
- **Usage in Sunside**:
  - Node script downloads or reads the CSV.
  - Filters to relevant airports (public, with IATA codes, etc.).
  - Writes a compact `airports.json` for client-side search and selection.

## Testing

- **Test runner**: Vitest
  - Integrates with Vite and TypeScript.
  - Fast and friendly for unit testing core logic.
  - Allows running tests in a Node environment without a browser.
- **Test style**:
  - Unit tests for each core module (`geo`, `time`, `sun`, `flight`).
  - Lightweight tests for any non-trivial helper functions used in data preparation scripts.

## Dependency philosophy

Sunside aims to keep dependencies minimal and carefully chosen:

- Use well-maintained, mainstream libraries (Svelte, Vite, Luxon, Vitest).
- Use specialized small libraries only when they clearly reduce complexity (SunCalc).
- Depend on data snapshots (Natural Earth / world-atlas TopoJSON, OurAirports CSV) rather than complex data-processing stacks.
- Keep build-time-only dependencies clearly separated from runtime dependencies.
- Prefer writing small, focused helper functions in the project over introducing large general-purpose libraries.

All dependencies and their roles will be documented in `package.json` and referenced here once implementation begins.
