# Tech Stack

This document explains the main technology choices in Sunside and how they’re used.

## Runtime environment

- **Target**: modern browsers with ESNext support and `Intl` APIs.
- **Hosting**: static hosting (e.g. GitHub Pages).
- **App**: single-page client-side app; no backend services.

## Languages and framework

- **TypeScript**
  - Used for core logic and Svelte components.
  - Strict mode helps catch math/time edge cases early.
- **Svelte (v5)**
  - Small runtime + simple reactivity model.
  - Good fit for a static, interactive visualization.

## Build tools

- **Vite**
  - Dev server (HMR) + production bundling.
- **Node.js 24.x (development only)**
  - Runs scripts, tests, and Vite.

## Core libraries

- **Luxon**
  - Local → UTC conversion using IANA time zones.
  - Formatting for display.
- **SunCalc**
  - Sun altitude/azimuth at a given time and location (aircraft-local sun state).
  - Solar coordinate math (via shared formulas) for computing the subsolar point.
- **Vitest**
  - Unit tests for core logic and data prep helpers.

## Data preparation libraries (dev-only)

- **`tz-lookup`**
  - Derives an IANA time zone from airport coordinates during preprocessing.
- **`csv-parse`**
  - Parses OurAirports CSV during preprocessing.
- **`topojson-client`**
  - Converts world-atlas TopoJSON into GeoJSON during preprocessing.

## Map representation

- World geometry is processed into a fixed equirectangular canvas (1800×900).
- The UI currently uses a prebuilt static vector map: `public/map.svg`.

## Search

- Airport selection uses a small custom ranked search (diacritic-insensitive) to prioritize exact airport codes (IATA/ICAO) before looser matches.

## Dependency philosophy

- Keep runtime dependencies minimal.
- Prefer small, well-understood libraries over large mapping stacks.
- Keep build-time-only dependencies out of the browser bundle.
