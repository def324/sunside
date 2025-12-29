# Testing

Sunside uses Vitest for fast, deterministic unit tests focused on core logic and data preparation.

## Run tests

Single run:

```bash
npm test -- --run
```

Watch mode:

```bash
npm test
```

Note: `npm test` runs Vitest in watch mode and keeps the process running; use `npm test -- --run` for a one-off test run.

## What’s covered

- `tests/geo.test.ts` – great-circle + projection sanity checks (including seam splitting).
- `tests/time.test.ts` – time zone conversion and duration helpers.
- `tests/timezone.test.ts` – time zone lookup by coordinate (including DST and non-hour offsets).
- `tests/airportSearch.test.ts` – ranked airport search for the typeahead UI.
- `tests/sun.test.ts` – SunCalc wrapper, subsolar point, and terminator sampling helpers.
- `tests/daynight.test.ts` – day/night overlay paths (bounds, solstices, seam/equinox edge cases).
- `tests/flight.test.ts` – flight plan validation, sampling, duration estimates, and sun side-of-plane logic.
- `tests/sunSummary.test.ts` – sunlight summary bucketing (direction + daylight) and rounding.
- `tests/urlParams.test.ts` – share + autoplay URL param parsing (UI integration glue).
- `tests/prepare-airports.test.ts` – airport CSV filtering/normalization helpers.
- `tests/prepare-map.test.ts` – map dataset preparation helpers.

## Guidelines

- When changing or adding core logic in `src/core/`, add or update focused tests in `tests/`.
- Prefer small unit tests; avoid network access in tests.
