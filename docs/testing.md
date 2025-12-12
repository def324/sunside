# Testing Strategy

This document outlines the planned testing approach for Sunside. No tests exist yet, but this strategy will guide test implementation as the code is written.

## Goals

- Ensure correctness of math-heavy core logic (great-circle routes, time conversions, sun calculations).
- Keep tests fast and easy to run locally.
- Favor deterministic, unit-level tests over complex end-to-end setups, at least initially.

## Tools

- **Test runner**: Vitest
  - Integrates with Vite and TypeScript.
  - Good support for Node-only tests (no browser required).

As implementation progresses, we may add:

- Svelte component tests (also via Vitest and appropriate testing utilities).

## What we will test

### Core modules (`src/core/`)

These modules are the highest priority for robust test coverage.

#### `geo.ts`

Tests will include:

- Great-circle distance between known city pairs (e.g. approximations for LAX–JFK, FRA–SIN) and comparison against trusted references within a small error margin.
- Interpolation along the great-circle:
  - `t = 0` yields departure coordinates.
  - `t = 1` yields arrival coordinates.
  - `t = 0.5` yields a midpoint that is close to a known reference for test cases.
- Equirectangular projection:
  - Known lat/lon values map to expected x/y positions within the configured map dimensions.

#### `time.ts`

Tests will include:

- Local → UTC and UTC → local conversions using Luxon:
  - A variety of airports/time zones (e.g. `Europe/Berlin`, `America/Los_Angeles`, `Asia/Singapore`).
  - Behavior near daylight saving transitions (if relevant for certain airports).
- Validating that:
  - The duration between departure and arrival in UTC matches expectations for synthetic test cases.
  - Date boundaries (crossing midnight) are handled correctly.

#### `sun.ts`

Tests will include:

- Sanity checks for sun altitude and azimuth in common scenarios:
  - Noon vs. midnight at mid-latitudes.
  - Polar day/night edge cases (e.g. within the Arctic Circle).
- Day/night classification:
  - Ensure that clear day and night conditions are classified correctly.
  - Accept some tolerance in twilight regions.
- Terminator approximation:
  - High-level checks that the night region covers the correct hemisphere relative to subsolar point for a few known times.

#### `flight.ts`

Tests will include:

- Building a `FlightPlan` from synthetic airport data and local date/times:
  - Verify that flight duration is computed correctly.
  - Verify that invalid inputs (arrival before departure) are rejected or flagged.
- Mapping time → position along the route:
  - Ensure that the position at `t=0` and `t=1` matches the endpoints.
  - Check that intermediate positions move smoothly along the great-circle.
- Side-of-plane sunlight logic:
  - Construct synthetic scenarios where the sun is known to be on the left/right side based on azimuth and heading.
  - Verify classification matches expectations.

### Data preparation scripts (`scripts/`)

For scripts like `prepare-airports` and `prepare-map`, we will:

- Extract non-trivial logic into small, pure functions where possible.
- Add unit tests that feed in small synthetic input subsets and verify:
  - Filtering rules are applied correctly.
  - The resulting JSON structure is as expected.
  - Projection and simplification behave in predictable ways.

Full end-to-end tests of the scripts against real CSV/TopoJSON may be added as integration tests if needed, but are not required initially.

### UI components (later phase)

Once core logic and basic UI are stable, we may add:

- Component-level tests for Svelte components:
  - Ensure they render expected elements given specific props/state.
  - Verify that user interactions (e.g. slider movement, airport selection) call the expected handlers.

These are lower priority than core math and time tests.

## Running tests

Once implementation begins, we will add npm scripts such as:

- `npm test` – run all tests once.
- `npm run test:watch` – run tests in watch mode during development.

The exact commands and any additional options will be documented here after the test setup is implemented.

## Coverage expectations

While 100% coverage is not an explicit goal, we aim for:

- High coverage on `src/core/` (especially math/time-related functions).
- At least basic coverage on data preparation utilities.
- Targeted tests around edge cases (date line crossings, DST boundaries, polar regions).

This test strategy is intended to catch regressions early and provide confidence in the correctness of the core functionality as the UI evolves.

