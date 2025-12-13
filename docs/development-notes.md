# Development Notes

This document collects conventions, decisions, and notes that help maintain and extend Sunside.

## Node, npm, and tooling

- Use **Node 24.x LTS** for development (see `package.json` engines).
- Primary scripts:
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
  - `npm test` (watch)
  - `npm test -- --run` (single run)
  - `npm run prepare:airports`
  - `npm run prepare:map`
  - `npm run build:map-svg`

## Code organization

- Keep core logic UI-agnostic and testable in `src/core/`.
- Keep Svelte components focused on presentation/interaction in `src/ui/`.
- Add/update tests in `tests/` when changing `src/core/`.

## Day/night overlay notes

- The global day/night overlay is computed in `src/core/daynight.ts`.
- It uses the subsolar point and an analytic terminator sampled by longitude to produce stable SVG paths (avoids seam-related artifacts from polygon unwrapping).
- Twilight bands are not rendered globally; aircraft-local classification in `src/core/sun.ts` still uses `day | twilight | night`.

## Map notes

- The UI renders the base map from `public/map.svg` (generated from `src/data/map.json`).
- Antimeridian-crossing rings are split during preprocessing to avoid wraparound artifacts in `public/map.svg`.
- Polar “wrap” rings (odd number of dateline jumps) are capped to the nearest pole edge to preserve Antarctica-style geometry.
- Flight routes are also split at the map seam to avoid a long connecting line when a route wraps from `x≈1800` to `x≈0`.

## UI status

Current UI (`src/ui/App.svelte`) supports:

- Airport selection (typeahead with ranked, diacritic-insensitive matching) and local time inputs.
- Optional “Auto-estimate arrival time” based on route distance (rounded to 30 minutes).
- Great-circle route rendering.
- Timeline play/scrub controls that update aircraft position and sun/day-night state.
- Timeline header shows duration and distance (km/mi + nautical miles).
- Global day/night overlay + sun marker that updates with time.
- Pan/zoom on the map (wheel/pinch + drag + zoom buttons).

Notes:

- Distance defaults to km vs miles based on browser locale; clicking the distance toggles km/mi (keeps nautical miles visible).

Potential next refactors:

- Split `App.svelte` into `AirportSelector`, `TimelineControls`, and `MapView`.
- Optional: visualize twilight bands for the global overlay.
