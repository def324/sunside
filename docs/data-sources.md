# Data Sources

Sunside uses two static datasets generated at build time:

1. **Airports** (OurAirports CSV → `src/data/airports.json`)
2. **World map** (world-atlas TopoJSON → `src/data/map.json` → `public/map.svg`)

The generated assets are committed so the app can run without any network access.

## Airport data – OurAirports

### Source

- OurAirports data: `https://ourairports.com/data/`
- CSV mirror used by the script:
  - `https://davidmegginson.github.io/ourairports-data/airports.csv`

Raw snapshot path in this repo:

- `data/airports.csv`

### Processing

Command:

```bash
npm run prepare:airports
```

What it does (`scripts/prepare-airports.ts`):

- Reads `data/airports.csv` (downloads it if missing).
- Filters to airport types: large/medium/small.
- Filters to “significant” airports (scheduled service or IATA code), with optional allowlisting.
- Normalizes fields and derives an IANA time zone from coordinates via `tz-lookup`.
- Writes `src/data/airports.json`.

Optional allowlist:

- `data/airport-allowlist.json` (array of airport `id` or `ident`)

### Runtime usage

- `src/data/airports.json` is imported by the UI for airport search/selection.

## Map data – Natural Earth via world-atlas

### Source

- Natural Earth admin-0 country boundaries (public domain), distributed as TopoJSON via world-atlas:
  - `https://github.com/topojson/world-atlas`

Raw snapshot path in this repo:

- `data/world-countries-50m.json`

The script can also download a default snapshot from:

- `https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json`

### Processing

Generate the projected geometry dataset:

```bash
npm run prepare:map
```

Build the runtime SVG map:

```bash
npm run build:map-svg
```

Pipeline:

- `scripts/prepare-map.ts` converts TopoJSON → GeoJSON and projects coordinates into a fixed equirectangular canvas (1800×900), writing `src/data/map.json`.
- `scripts/build-map-svg.ts` converts `src/data/map.json` into `public/map.svg`.

### Runtime usage

- The UI renders the base map from `public/map.svg` (via an SVG `<image>` element).

### Antimeridian handling

Some country polygons cross the antimeridian. During preprocessing, rings are split at the dateline so the generated `public/map.svg` does not contain “wrap” segments that draw across the whole map.

Polar “wrap” rings (with an odd number of dateline jumps, e.g. Antarctica) are capped to the nearest pole edge during preprocessing so they render correctly in 2D.

## Licensing and attribution (summary)

- Natural Earth: public domain.
- world-atlas TopoJSON: ISC license (distribution of Natural Earth data).
- OurAirports: open data (see OurAirports site for current terms).

If this project is published publicly, add explicit attribution/acknowledgements per the upstream sources.
