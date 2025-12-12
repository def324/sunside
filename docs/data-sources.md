# Data Sources

This document describes the external data sources used by Sunside, how they are processed, and how they are expected to be maintained.

No automated scripts exist yet; this document defines the plan for implementation.

## Overview

Sunside uses two main categories of static data:

1. **Airport data** – locations and metadata for departure/arrival airports.
2. **Map data** – vector data representing the world map (countries).

Both are processed at build time into compact JSON files stored in the repository and loaded by the client at runtime.

## Airport data – OurAirports

### Source

- **Primary source**: OurAirports data downloads
  - Landing page: `https://ourairports.com/data/`
  - Direct CSV: `https://davidmegginson.github.io/ourairports-data/airports.csv`

This dataset is under an open-data model. Exact licensing details and attribution expectations will be verified during implementation; links and any required acknowledgements will be included in the project’s `LICENSE` or a dedicated acknowledgements section.

### Fields of interest

From `airports.csv`, we plan to use a subset of columns, such as:

- `id` – internal OurAirports id (for stable refs).
- `name` – airport name.
- `municipality` – city/metro area name.
- `iso_country` – country (ISO code).
- `iata_code` – IATA code (3-letter, where available).
- `icao_code` – ICAO code (4-letter, where needed).
- `latitude_deg`, `longitude_deg` – coordinates.

OurAirports does not currently provide IANA time zones directly, so we will:

- Either:
  - Use a separate mapping table (e.g. `iso_region`/`iso_country` → IANA zone) maintained in this repo, or
  - Join against an additional open dataset that maps airports (via IATA/ICAO) to `tz_database_time_zone`, or
  - Combine both approaches.

The exact strategy will be chosen, documented, and covered with tests once implementation begins, but the output for the client will always be a single, explicit `tz` field per airport using a standard IANA name (e.g. `"Europe/Berlin"`), suitable for use with Luxon.

### Filtering strategy

To keep the airport dataset reasonably small and focused while still being useful worldwide, we plan to apply the following rules:

1. **Airport type filter**
   - Include only rows where `type` is one of:
     - `large_airport`
     - `medium_airport`
     - `small_airport`
   - Exclude rows where `type` is:
     - `balloonport`
     - `closed_airport`
     - `heliport`
     - `seaplane_base`

2. **Commercial service / significance filter**
   - Prefer airports that are either:
     - Marked with `scheduled_service = "yes"`, **or**
     - Have a non-empty `iata_code`.
   - This tends to select airports with commercial passenger service, along with some important non-scheduled fields that have IATA codes (e.g. some remote destinations).

3. **Minimal field set**
   - For each included airport, we will keep only the fields needed by the app:
     - `id`
     - `name`
     - `municipality` (city/metro area)
     - `iso_country`
     - `iata_code`
     - `icao_code`
     - `latitude_deg`
     - `longitude_deg`
     - Derived `tz` (IANA time zone).
   - All other fields (elevation, links, keywords, etc.) will be dropped from the runtime JSON.

4. **Optional manual overrides**
   - If, during usage, we discover important airports missing due to these filters (for example, notable airports without IATA codes or `scheduled_service = "no"`), we can:
     - Maintain a small manual allowlist of exceptional `ident`/`id` values to include.
     - Or relax the filter for specific countries/regions.

The goal is a dataset of several thousand airports, likely on the order of a few hundred kilobytes to around 1 MB once serialized as compact JSON.

### Processing pipeline (planned)

1. Download `airports.csv` from the OurAirports GitHub mirror.
2. Parse CSV using a Node script (e.g. `scripts/prepare-airports.ts`).
3. Filter rows according to the inclusion/exclusion rules above.
4. Map fields into a compact JSON structure, e.g.:

   ```jsonc
   {
     "id": 1234,
     "ident": "EDDF",
     "name": "Frankfurt am Main",
     "city": "Frankfurt",
     "country": "DE",
     "iata": "FRA",
     "icao": "EDDF",
     "lat": 50.0333,
     "lon": 8.5706,
     "tz": "Europe/Berlin"
   }
   ```

5. Write the result to `src/data/airports.json`.

This script can be run on demand (e.g. when we want to refresh airport data) and is not part of normal app usage.
Command (auto-downloads `airports.csv` to `data/` if missing):

```bash
npm run prepare:airports
```

### Runtime schema (`src/data/airports.json`)

Each entry in `airports.json` has the following fields:

| Field  | Type    | Notes |
| ------ | ------- | ----- |
| `id`   | number  | OurAirports `id` |
| `ident`| string  | OurAirports `ident` (useful for debugging/overrides) |
| `name` | string  | Airport name |
| `city` | string \\| null | From `municipality` (trimmed) |
| `country` | string | ISO country code from `iso_country` |
| `iata` | string \\| null | From `iata_code` (trimmed, empty → null) |
| `icao` | string \\| null | From `icao_code` (trimmed, empty → null) |
| `lat` | number | `latitude_deg` |
| `lon` | number | `longitude_deg` |
| `tz`  | string | IANA time zone derived from coordinates |

Additional notes:

- Records are sorted by a stable key: `iata` (if present) else `icao`/`ident`, with `name` as a secondary key. Sorting ensures deterministic output for diffs.
- Only the fields above are shipped to the client. Anything else (elevation, keywords, etc.) is dropped to keep the payload small.
- A tiny optional allowlist (e.g. `data/airport-allowlist.json`) can force inclusion of specific `id`/`ident` values even if they fail the significance filter, provided they have valid coordinates and a resolvable time zone.

### Time zone derivation

- Strategy: derive IANA time zones from coordinates using a Node-only dependency (`tz-lookup`, MIT) during the preprocessing step.
- Rationale: avoids maintaining our own boundary data and keeps the runtime bundle small (tz data never ships to the browser).
- Fallbacks: if `tz-lookup` cannot resolve a zone for a record, that airport is dropped unless it appears in the allowlist and we can provide a manual override table (to be added if/when needed).

## Map data – Natural Earth via world-atlas

### Source

- **Base dataset**: Natural Earth admin-0 (countries) at 1:50m resolution.
  - Website: `https://www.naturalearthdata.com/`
  - Admin-0 country boundaries: `1:50m cultural vectors` (countries).
- **Convenience distribution**: `world-atlas` TopoJSON (archived).
  - GitHub: `https://github.com/topojson/world-atlas`
  - Example file: `countries-50m.json`

`world-atlas` provides a convenient TopoJSON representation of Natural Earth data. Although the repo is archived and not updated, this is acceptable because:

- The dataset is essentially static geography.
- We will vendor a snapshot of the TopoJSON file into this repository under `data/` and treat it as a static asset.

### Licensing and attribution

- Natural Earth data is in the public domain (“No permission is needed to use Natural Earth”).
- `world-atlas` is provided under the ISC license.
- Sunside will:
  - Include appropriate acknowledgements in the README and/or a dedicated acknowledgements section.
  - Preserve any required license texts for vendored files.

Exact wording will be finalized when we add the files.

### Processing pipeline (planned)

1. Run `npm run prepare:map`. The script will download `countries-110m.json` (TopoJSON) to `data/world-countries-110m.json` if it is missing.
2. The script (`scripts/prepare-map.ts`) will:
   - Load the TopoJSON.
   - Convert it to GeoJSON using `topojson-client` (Node-only dependency).
   - Apply an equirectangular projection to each coordinate:

     ```text
     x = (lon + 180) / 360 * width
     y = (90 - lat) / 180 * height
     ```

     - `width` and `height` will be fixed map dimensions chosen for the base projection.

   - Optionally simplify or quantize coordinates if the resulting JSON is larger than desired.
   - Normalize the structure into a compact format such as:

     ```jsonc
     {
       "width": 3600,
       "height": 1800,
       "countries": [
         {
           "id": "DEU",
           "name": "Germany",
           "paths": [
             [[x1, y1], [x2, y2], ...],
             ...
           ]
         },
         ...
       ]
     }
     ```

3. Write the result to `src/data/map.json`.

### Level of detail and size considerations

- Start with 1:50m data, which balances detail and size.
- If `map.json` is too large for practical bundle size goals:
  - Apply more aggressive simplification in the script.
  - Consider fallback to 1:110m data for global view.
- Zoom behavior will use the same projected coordinates:
  - Zooming is implemented as scaling and translating the SVG coordinate system, not as loading different datasets.

### Runtime schema (`src/data/map.json`)

Planned structure produced by `scripts/prepare-map.ts`:

```jsonc
{
  "width": 1800,
  "height": 900,
  "countries": [
    {
      "id": "DEU",
      "name": "Germany",
      "paths": [
        [[x1, y1], [x2, y2], ...],
        ...
      ]
    }
  ]
}
```

Notes:
- Coordinates are pre-projected to equirectangular space with the fixed `width`/`height` and simplified/rounded for performance.
- `paths` contain polygon rings (and holes, when applicable). Quantization/simplification may be applied to keep size reasonable.

## Data refresh strategy

Both airport and map data can be periodically refreshed:

- **Airports**:
  - Re-run `scripts/prepare-airports` against the latest OurAirports CSV.
  - Review any major structural changes before accepting them.

- **Map**:
  - Natural Earth and `world-atlas` are fairly static; updates are expected rarely.
  - If a new version is desired:
    - Download a newer Natural Earth or world-atlas dataset.
    - Re-run `scripts/prepare-map`.

These operations are manual and under version control to ensure reproducibility.
