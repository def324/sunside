# Architecture

This document describes the overall architecture of the Sunside application and how data flows from user input to the final visualization.

> Implementation has not started yet. Names and interfaces may be refined during coding, but the roles and boundaries defined here should remain stable.

## High-level system overview

Sunside is a fully static, client-side web application:

- A **single-page app** built with Svelte and TypeScript.
- Bundled with Vite into static assets (HTML, JS, CSS, and static JSON/SVG).
- Hosted on GitHub Pages or any static file host.

There is **no backend service**: all logic runs in the browser. A Node.js environment is only used during development to:

- Build the client bundle.
- Generate static data files (map geometry, airport list).
- Run tests.

## Major components

### 1. Core domain modules (`src/core/`)

Pure TypeScript modules, independent from Svelte and the DOM, implementing:

- **`geo.ts`**
  - Great-circle flight path computation on a spherical Earth.
  - Distance calculations (for information and internal checks).
  - Interpolation along the great-circle path given a parameter `t ∈ [0, 1]`.
  - A simple equirectangular projection to map lat/lon (degrees) to x/y (map coordinates).

- **`time.ts`**
  - Utilities built on top of Luxon:
    - Parsing and validating local date/time inputs (without time zone).
    - Converting between airport-local time (IANA zone) and UTC.
    - Formatting times for display in a given time zone.
  - These functions should accept simple data types (e.g. strings, plain objects) and return either primitive values or small domain objects, so they are easy to test.

- **`sun.ts`**
  - Wraps the SunCalc library to provide:
    - Sun azimuth and altitude at a given time and location.
    - High-level helpers to compute day/night classification at a location (e.g. sun above/below horizon).
    - Helpers to approximate the day/night terminator line on the map for a given timestamp.

- **`flight.ts`**
  - Defines core domain types, e.g.:
    - `Airport` (id, name, coordinates, IANA time zone, etc.).
    - `FlightPlan` (departure airport, arrival airport, departure/arrival times).
    - `FlightSample` (timestamp, position, sun, side-of-plane sunlight, etc.).
  - Provides logic to:
    - Build a normalized `FlightPlan` from user input.
    - Compute the total flight duration and derive a time → position mapping assuming constant speed.
    - Generate a discrete set of samples along the flight:
      - For playback and for drawing the path on the map.
      - With metadata such as day/night classification and which side of the plane the sun is on.

All of these modules are designed to be usable in unit tests without any browser environment (e.g. via Vitest running under Node).

### 2. Data modules (`src/data/`)

These are static JSON files generated at build time and consumed read-only at runtime:

- **`airports.json`**
  - A filtered subset of OurAirports data.
  - Likely structure per entry (to be refined during implementation):
    - `id`: stable numeric or string identifier.
    - `name`: airport name.
    - `city`: city/metro area.
    - `country`: country name or ISO code.
    - `iata`: IATA code (if available).
    - `icao`: ICAO code (if needed).
    - `lat`: latitude in decimal degrees.
    - `lon`: longitude in decimal degrees.
    - `tz`: IANA time zone identifier (e.g. `"Europe/Berlin"`).
  - The dataset will exclude:
    - Closed airports.
    - Private strips / low-importance fields.
    - Any fields not needed by the app.

- **`map.json`**
  - A preprocessed representation of world boundaries (countries) for rendering the map.
  - Derived from a vendored TopoJSON file (`countries-50m.json`) originally from the `topojson/world-atlas` project, itself based on Natural Earth.
  - Stored in a format that is convenient for direct SVG rendering, for example:
    - A list of polygons and multi-polygons with coordinates already projected into an equirectangular coordinate system with a known width/height.
    - Lightweight metadata per feature (e.g. country name, ISO code) if needed for future features.

### 3. Data preparation scripts (`scripts/`)

Node-based scripts executed manually or via npm scripts, not shipped to the browser:

- **`prepare-airports.(ts|js)`**
  - Downloads the OurAirports CSV (or reads a local copy).
  - Filters rows by type (e.g. keeps large/mid/small airports, drops private/closed).
  - Derives the minimal JSON structure required by the app.
  - Writes `src/data/airports.json`.

- **`prepare-map.(ts|js)`**
  - Reads a vendored TopoJSON file such as `data/world-countries-50m.json` (from world-atlas).
  - Uses a small helper (likely `topojson-client` in Node only) to convert TopoJSON → GeoJSON.
  - Applies our equirectangular projection to convert lat/lon to pixel coordinates.
  - Optional: applies simplification / quantization if needed to keep file size small.
  - Writes `src/data/map.json`.

These scripts will be documented in `docs/data-sources.md`, including the exact versions/URLs used.

### 4. UI components (`src/ui/` and Svelte entry)

Svelte components to implement the actual UI:

- **`App.svelte`**
  - Application shell.
  - Loads airports and map data on startup.
  - Holds primary application state (selected airports, times, computed `FlightPlan` and current timeline position).

- **Input components**
  - `AirportSelector.svelte`
    - Allows searching and selecting airports by city, name, IATA code, etc.
    - Renders two instances (departure and arrival).
  - `TimeInputs.svelte`
    - Date/time inputs for departure and arrival local times.
    - Shows the airport’s time zone to reduce user error.

- **Visualization components**
  - `MapView.svelte`
    - Renders the base world map (countries).
    - Renders the great-circle route between selected airports.
    - Renders the aircraft position for the current timeline position.
    - Renders the day/night region overlay (using data from `sun.ts`).
    - Supports limited zoom/pan:
      - Auto-fit to the route.
      - Possibly one or two preset zoom levels (world vs. route-focused).
      - Implemented as transforms on the SVG (not as a full map tiling engine).
  - `TimelineControls.svelte`
    - Slider to scrub through the flight.
    - Play/pause button to animate the timeline at a configurable speed.
    - Optionally “jump to event” controls (sunrise/sunset during flight).

- **Summary / info components**
  - `FlightSummary.svelte`
    - Shows computed flight duration, proportion of time in daylight vs night, and key sun events during the flight.

The Svelte components are responsible for user interaction, but they delegate all math and domain decisions to the `src/core/` modules.

### 5. Tests (`tests/`)

Vitest-based unit tests for the core logic:

- **`tests/geo.test.ts`**
  - Verifies distances and great-circle interpolation for known pairs of coordinates.
  - Checks projection consistency (e.g. known lat/lon -> x/y mapping).

- **`tests/time.test.ts`**
  - Verifies local-to-UTC and UTC-to-local conversions for known time zones and dates.
  - Ensures correct behavior around DST boundaries using Luxon.

- **`tests/sun.test.ts`**
  - Sanity-checks sun altitude and azimuth for known locations and times (e.g. noon vs midnight).
  - Tests day/night classification for typical scenarios.

- **`tests/flight.test.ts`**
  - Checks time→position mapping along the great-circle route.
  - Verifies side-of-plane sunlight logic for well-chosen synthetic scenarios.

The UI (Svelte) may also receive higher-level tests later (e.g. component/unit tests), but the core functionality is intended to be testable and validated without a browser.

## Data flow

### 1. Initial load

1. Browser loads the static HTML and JS bundle.
2. `App.svelte` initializes and:
   - Loads `src/data/airports.json`.
   - Loads `src/data/map.json`.
3. The UI shows:
   - Airport selection controls.
   - Time input fields.
   - An initial map view (e.g. world overview).

### 2. User defines a flight

1. User selects a departure and arrival airport using the airport selectors.
2. User enters:
   - Departure local date/time at the departure airport.
   - Arrival local date/time at the arrival airport.
3. The UI constructs a `FlightPlan` object via helpers in `flight.ts`, which:
   - Uses `time.ts` to convert the two local times into UTC.
   - Computes flight duration and validates that arrival (UTC) is after departure (UTC).

### 3. Compute the trajectory

1. `flight.ts` uses `geo.ts` to define the great-circle path between the two airports.
2. The total flight duration is used to build:
   - A mapping from timeline parameter `t ∈ [0, 1]` to UTC timestamps.
   - A discrete set of samples (e.g. N points) along the route, each with:
     - `lat`, `lon` (from `geo.ts` interpolation).
     - Projected `x`, `y` (from `geo.ts` equirectangular projection).

### 4. Compute sun and day/night info

For each sample (or for on-demand evaluation at the current slider position):

1. `sun.ts` uses SunCalc to compute sun azimuth/altitude at the sample’s position and time.
2. `sun.ts` classifies the sample as day/night (or twilight) based on sun altitude.
3. `flight.ts` combines:
   - The aircraft’s local heading (from the great-circle path direction).
   - The sun azimuth.
   - To decide if the sun is on the left/right side of the aircraft or nearly ahead/behind.
4. Separately, for the current timestamp, `sun.ts` computes the global day/night terminator approximation for rendering the shaded region on the map.

### 5. Rendering and interaction

- `MapView.svelte` renders:
  - The base map from `map.json`.
  - The great-circle path using projected coordinates.
  - The aircraft marker at the current sample.
  - The day/night region overlay.
- `TimelineControls.svelte`:
  - Updates the current timeline position `t` in the app state.
  - Optionally auto-advances `t` when “play” is active.
- `FlightSummary.svelte` displays aggregated metrics computed by `flight.ts`.

## Non-goals / out of scope

To keep the app simple and fully static, the following are deliberately out of scope (at least initially):

- Real-time or live flight data (no integration with airline APIs).
- Exact flight paths including climb/cruise/descend phases or winds aloft.
- Per-seat / per-row shading (we only show which *side* of the plane receives sunlight).
- Highly detailed base maps (e.g. roads, terrain, or satellite imagery).

These constraints keep dependencies and complexity low while still providing the core user value.

