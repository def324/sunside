import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';

type Geometry = GeoJSON.Polygon | GeoJSON.MultiPolygon;

export interface CountryShape {
  id: string;
  name: string;
  paths: number[][][]; // array of rings, each ring is [x,y][] in projected space
}

export interface MapDataset {
  width: number;
  height: number;
  countries: CountryShape[];
}

const WORLD_ATLAS_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const DEFAULT_WIDTH = 1800;
const DEFAULT_HEIGHT = 900;
const ROUND_FACTOR = 10; // 1 decimal place
const SIMPLIFY_TOLERANCE = 0.5; // pixels

function projectPoint(lon: number, lat: number, width: number, height: number): [number, number] {
  const x = ((lon + 180) / 360) * width;
  const y = ((90 - lat) / 180) * height;
  const rx = Math.round(x * ROUND_FACTOR) / ROUND_FACTOR;
  const ry = Math.round(y * ROUND_FACTOR) / ROUND_FACTOR;
  return [rx, ry];
}

function projectCoords(coords: number[][], width: number, height: number): number[][] {
  return coords.map(([lon, lat]) => projectPoint(lon, lat, width, height));
}

function simplifyRing(ring: number[][], tolerance: number): number[][] {
  if (ring.length <= 3) return ring;
  const simplified: number[][] = [];
  simplified.push(ring[0]);
  const tol2 = tolerance * tolerance;
  for (let i = 1; i < ring.length - 1; i += 1) {
    const prev = simplified[simplified.length - 1];
    const [x, y] = ring[i];
    const dx = x - prev[0];
    const dy = y - prev[1];
    if (dx * dx + dy * dy >= tol2) {
      simplified.push([x, y]);
    }
  }
  // Close the ring with the first point
  simplified.push(simplified[0]);
  return simplified;
}

function projectGeometry(geometry: Geometry, width: number, height: number): number[][][] {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.map((ring) =>
      simplifyRing(projectCoords(ring, width, height), SIMPLIFY_TOLERANCE)
    );
  }
  if (geometry.type === 'MultiPolygon') {
    // Flatten multipolygon into a single list of rings
    return geometry.coordinates.flatMap((poly) =>
      poly.map((ring) => simplifyRing(projectCoords(ring, width, height), SIMPLIFY_TOLERANCE))
    );
  }
  throw new Error(`Unsupported geometry type: ${geometry.type}`);
}

function normalizeCountry(featureObj: GeoJSON.Feature<Geometry>, width: number, height: number): CountryShape | null {
  const id = String(featureObj.id ?? featureObj.properties?.['iso_a3'] ?? featureObj.properties?.['id'] ?? '');
  const name = String(featureObj.properties?.['name'] ?? '').trim();
  if (!id || !name || !featureObj.geometry) return null;

  return {
    id,
    name,
    paths: projectGeometry(featureObj.geometry, width, height)
  };
}

export function buildMapDataset(topojson: any, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT): MapDataset {
  const world = feature(topojson, topojson.objects.countries) as GeoJSON.FeatureCollection<Geometry>;
  const countries: CountryShape[] = [];

  for (const feat of world.features) {
    const normalized = normalizeCountry(feat, width, height);
    if (normalized) {
      countries.push(normalized);
    }
  }

  countries.sort((a, b) => a.name.localeCompare(b.name));

  return { width, height, countries };
}

async function downloadTopojson(url: string, destPath: string) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  // eslint-disable-next-line no-console
  console.log(`Downloading map TopoJSON from ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
  // eslint-disable-next-line no-console
  console.log(`Saved TopoJSON to ${destPath} (${buf.length} bytes)`);
}

function getPaths() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname, '..');
  const dataDir = path.join(repoRoot, 'data');
  return {
    repoRoot,
    dataDir,
    inputTopo: path.join(dataDir, 'world-countries-50m.json'),
    outputJson: path.join(repoRoot, 'src', 'data', 'map.json')
  };
}

async function readOrDownloadTopojson(filePath: string): Promise<any> {
  if (!fs.existsSync(filePath)) {
    await downloadTopojson(WORLD_ATLAS_URL, filePath);
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

export async function main() {
  const paths = getPaths();
  const topo = await readOrDownloadTopojson(paths.inputTopo);
  const dataset = buildMapDataset(topo, DEFAULT_WIDTH, DEFAULT_HEIGHT);

  fs.mkdirSync(path.dirname(paths.outputJson), { recursive: true });
  fs.writeFileSync(paths.outputJson, JSON.stringify(dataset), 'utf8');

  // eslint-disable-next-line no-console
  console.log(`Wrote ${dataset.countries.length} countries to ${paths.outputJson}`);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  });
}
