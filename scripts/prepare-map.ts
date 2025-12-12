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

function roundCoord(value: number): number {
  const v = Math.round(value * ROUND_FACTOR) / ROUND_FACTOR;
  return Object.is(v, -0) ? 0 : v;
}

function projectPoint(lon: number, lat: number, width: number, height: number): [number, number] {
  const x = ((lon + 180) / 360) * width;
  const y = ((90 - lat) / 180) * height;
  return [roundCoord(x), roundCoord(y)];
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

function pointsEqual(a: number[], b: number[]): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function closeRing(points: number[][]): number[][] {
  if (points.length === 0) return points;
  const first = points[0];
  const last = points[points.length - 1];
  return pointsEqual(first, last) ? points : [...points, first];
}

function pushPoint(points: number[][], point: number[]) {
  const last = points.at(-1);
  if (last && pointsEqual(last, point)) return;
  points.push(point);
}

function hasDatelineJump(ring: number[][], width: number): boolean {
  for (let i = 1; i < ring.length; i += 1) {
    const dx = ring[i][0] - ring[i - 1][0];
    if (Math.abs(dx) > width / 2) {
      return true;
    }
  }
  return false;
}

function countDatelineJumps(ring: number[][], width: number): number {
  let jumps = 0;
  for (let i = 1; i < ring.length; i += 1) {
    const dx = ring[i][0] - ring[i - 1][0];
    if (Math.abs(dx) > width / 2) {
      jumps += 1;
    }
  }
  return jumps;
}

function intersectYAtVerticalSeam(prev: number[], curr: number[], xSeam: number, currXUnwrapped: number): number {
  const x1 = prev[0];
  const y1 = prev[1];
  const x2 = currXUnwrapped;
  const y2 = curr[1];
  const denom = x2 - x1 || 1;
  const t = (xSeam - x1) / denom;
  return roundCoord(y1 + t * (y2 - y1));
}

function capPolarRingAtDateline(ring: number[][], width: number, height: number): number[][] {
  const closed = closeRing(ring);
  if (closed.length < 4) return closed;

  const ys = closed.map((p) => p[1]);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const capY = height - maxY < minY ? height : 0;

  const out: number[][] = [closed[0]];

  for (let i = 1; i < closed.length; i += 1) {
    const prev = closed[i - 1];
    const curr = closed[i];
    const dx = curr[0] - prev[0];

    if (dx < -width / 2) {
      // Jump from right edge (~width) to left edge (~0).
      const y = intersectYAtVerticalSeam(prev, curr, width, curr[0] + width);
      pushPoint(out, [width, y]);
      pushPoint(out, [width, capY]);
      pushPoint(out, [width / 2, capY]);
      pushPoint(out, [0, capY]);
      pushPoint(out, [0, y]);
      pushPoint(out, curr);
      continue;
    }

    if (dx > width / 2) {
      // Jump from left edge (~0) to right edge (~width).
      const y = intersectYAtVerticalSeam(prev, curr, 0, curr[0] - width);
      pushPoint(out, [0, y]);
      pushPoint(out, [0, capY]);
      pushPoint(out, [width / 2, capY]);
      pushPoint(out, [width, capY]);
      pushPoint(out, [width, y]);
      pushPoint(out, curr);
      continue;
    }

    pushPoint(out, curr);
  }

  return closeRing(out);
}

// Split a projected ring that crosses the antimeridian (x seam at 0/width) into rings that do not.
export function splitRingAtDateline(ring: number[][], width: number, height: number): number[][][] {
  const closed = closeRing(ring);
  if (closed.length < 4) return [closed];
  if (!hasDatelineJump(closed, width)) return [closed];

  const jumps = countDatelineJumps(closed, width);
  if (jumps % 2 === 1) {
    const capped = capPolarRingAtDateline(closed, width, height);
    return [capped].filter((p) => p.length >= 4 && !hasDatelineJump(p, width));
  }

  const parts: number[][][] = [];
  let current: number[][] = [closed[0]];

  for (let i = 1; i < closed.length; i += 1) {
    const prev = closed[i - 1];
    const curr = closed[i];
    const dx = curr[0] - prev[0];

    if (dx < -width / 2) {
      // Jump from right edge (~width) to left edge (~0).
      const y = intersectYAtVerticalSeam(prev, curr, width, curr[0] + width);
      pushPoint(current, [width, y]);
      parts.push(current);
      current = [];
      pushPoint(current, [0, y]);
      pushPoint(current, curr);
      continue;
    }

    if (dx > width / 2) {
      // Jump from left edge (~0) to right edge (~width).
      const y = intersectYAtVerticalSeam(prev, curr, 0, curr[0] - width);
      pushPoint(current, [0, y]);
      parts.push(current);
      current = [];
      pushPoint(current, [width, y]);
      pushPoint(current, curr);
      continue;
    }

    pushPoint(current, curr);
  }

  if (current.length) {
    parts.push(current);
  }

  // If we split on the closing edge, merge the trailing segment back into the first.
  if (parts.length > 1) {
    const first = parts[0];
    const last = parts.at(-1)!;
    if (last.length && first.length && pointsEqual(last[last.length - 1], first[0])) {
      parts[0] = closeRing([...last.slice(0, -1), ...first]);
      parts.pop();
    }
  }

  return parts
    .map((p) => closeRing(p))
    .filter((p) => p.length >= 4 && !hasDatelineJump(p, width));
}

function projectGeometry(geometry: Geometry, width: number, height: number): number[][][] {
  if (geometry.type === 'Polygon') {
    return geometry.coordinates.flatMap((ring) => {
      const projected = projectCoords(ring, width, height);
      const simplified = simplifyRing(projected, SIMPLIFY_TOLERANCE);
      return splitRingAtDateline(simplified, width, height);
    });
  }
  if (geometry.type === 'MultiPolygon') {
    // Flatten multipolygon into a single list of rings
    return geometry.coordinates.flatMap((poly) =>
      poly.flatMap((ring) => {
        const projected = projectCoords(ring, width, height);
        const simplified = simplifyRing(projected, SIMPLIFY_TOLERANCE);
        return splitRingAtDateline(simplified, width, height);
      })
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
