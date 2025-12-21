# Architecture

Sunside is a fully static, client-side web application that visualizes sunlight along a flight.

## Overview

- **Frontend**: Svelte + TypeScript, bundled by Vite.
- **Runtime**: modern browser only (no backend services).
- **Dev/build**: Node.js (scripts + tests + bundling).

## Major components

### 1. Core domain modules (`src/core/`)

UI-agnostic, testable TypeScript:

- `geo.ts` – great-circle math, distances, equirectangular projection.
- `time.ts` – Luxon helpers for local ↔ UTC conversion using IANA zones.
- `airportSearch.ts` – ranked airport search used by the typeahead UI.
- `sun.ts` – SunCalc wrapper plus subsolar-point helpers.
- `daynight.ts` – global day/night overlay (terminator + SVG paths).
- `flight.ts` – flight plan construction + timeline sampling (including sun side-of-plane classification and duration estimates).

### 2. Runtime data/assets

- `src/data/airports.json` – preprocessed airport dataset (generated).
- `public/map.svg` – static world map vector used by the UI (generated).

`src/data/map.json` is also generated and currently used as an intermediate for building `public/map.svg`.

### 3. Data preparation scripts (`scripts/`)

The `data/` directory is used as a local cache for raw upstream snapshots; it is gitignored and not committed by default.

- `scripts/prepare-airports.ts`
  - Reads `data/airports.csv` (downloads if missing).
  - Filters and normalizes rows.
  - Derives an IANA time zone per airport via `tz-lookup`.
  - Writes `src/data/airports.json`.
- `scripts/prepare-map.ts`
  - Reads `data/world-countries-50m.json` (downloads if missing).
  - Converts TopoJSON → GeoJSON via `topojson-client`.
  - Projects coordinates into a fixed equirectangular canvas (1800×900).
  - Writes `src/data/map.json`.
- `scripts/build-map-svg.ts`
  - Converts `src/data/map.json` into `public/map.svg`.

### 4. UI (`src/ui/`)

The UI is orchestrated by `src/ui/App.svelte` and composed of coarse presentational panels in `src/ui/components/`:

- `FlightSetupPanel.svelte` – airport + time inputs
- `TimelinePanel.svelte` – playback controls + timeline info
- `MapPanel.svelte` – SVG map rendering + pan/zoom interactions

Styles are global in `src/ui/app.css` (imported from `src/main.ts`) to keep styling stable across extracted components.

User-facing features include:

- Airport selection (typeahead with ranked matching).
- Local departure/arrival date/time inputs (converted to UTC via core time helpers).
  - Optional: auto-estimate arrival time from great-circle distance (rounded to 30 minutes).
- Timeline controls (play/pause, pace selection, and scrubbing).
  - Timeline header shows route, duration, and distance (defaults to km/mi by locale; click to cycle km/mi/nmi).
- SVG map rendering:
  - base world map (`public/map.svg`)
  - route polyline(s) (great circle, split at the antimeridian seam)
  - aircraft marker (current sample)
  - day/night overlay + terminator line
  - sun marker (subsolar point)
- Pan/zoom interactions (wheel/pinch + pointer drag + zoom buttons).
  - Layout is responsive: on wide screens (≥1250px), map and timeline are shown side-by-side (map left); below that they stack.
  - Flight setup uses a responsive grid: inline labels on small screens, two columns on tablet widths, and four columns on wide screens.
  - A few UI preferences persist via local storage (auto-estimate toggle, distance units, and playback pace).

### 5. Tests (`tests/`)

Vitest unit tests cover:

- Core modules (`geo`, `time`, `airportSearch`, `sun`, `daynight`, `flight`)
- Data prep helpers (`prepare-airports`, `prepare-map`)

## Data flow

1. User selects departure/arrival airports and local times.
2. `time.ts` converts local inputs to UTC; `flight.ts` builds a validated `FlightPlan`.
3. `flight.ts` samples the flight timeline (positions + per-sample sun status/side).
4. The timeline slider selects the current sample; the aircraft marker updates.
5. For the current timestamp, `daynight.ts` computes:
   - the subsolar point (sun marker)
   - the day/night terminator curve
   - SVG paths for day and night regions
6. `MapPanel.svelte` renders all layers into a single SVG (driven by `App.svelte` state).

## Day/night model and “sun” marker

- **Sun marker**: the subsolar point (sun directly overhead).
- **Day/night overlay**: the geometric terminator (sun altitude > 0), rendered as two filled polygons plus a dashed terminator curve.
- **Twilight band**: a subtle civil twilight band (sun altitude between `0°` and `-6°`) rendered on the night side adjacent to the terminator (generated in longitude order to stay seam-safe and stable during animation).
- Aircraft-local classification still distinguishes `day | twilight | night`.

## Known limitations

- Map geometry is equirectangular and intended for visualization (not navigation-grade cartography).
