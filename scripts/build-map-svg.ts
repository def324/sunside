import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface MapDataset {
  width: number;
  height: number;
  countries: Array<{
    id: string;
    name: string;
    paths: number[][][];
  }>;
}

function countryPath(rings: number[][][]): string {
  return rings
    .map((ring) => {
      if (!ring.length) return '';
      const [first, ...rest] = ring;
      const moves = rest.map((p) => `L${p[0]},${p[1]}`).join(' ');
      return `M${first[0]},${first[1]} ${moves} Z`;
    })
    .join(' ');
}

export function buildSvg(map: MapDataset): { svg: string; stats: { countries: number; rings: number; points: number } } {
  let ringCount = 0;
  let pointCount = 0;
  const paths = map.countries.map((c) => {
    ringCount += c.paths.length;
    for (const ring of c.paths) {
      pointCount += ring.length;
    }
    return `<path d="${countryPath(c.paths)}" />`;
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${map.width} ${map.height}">
  <style>
    path { fill: #1f2937; stroke: #334155; stroke-width: 0.5; }
  </style>
  <g>${paths.join('')}</g>
</svg>`;

  return { svg, stats: { countries: map.countries.length, rings: ringCount, points: pointCount } };
}

function getPaths() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname, '..');
  return {
    mapJson: path.join(repoRoot, 'src', 'data', 'map.json'),
    outputSvg: path.join(repoRoot, 'public', 'map.svg')
  };
}

export async function main() {
  const paths = getPaths();
  if (!fs.existsSync(paths.mapJson)) {
    throw new Error(`Missing map dataset at ${paths.mapJson}. Run npm run prepare:map first.`);
  }
  const map: MapDataset = JSON.parse(fs.readFileSync(paths.mapJson, 'utf8'));
  const { svg, stats } = buildSvg(map);
  fs.mkdirSync(path.dirname(paths.outputSvg), { recursive: true });
  fs.writeFileSync(paths.outputSvg, svg, 'utf8');
  // eslint-disable-next-line no-console
  console.log(
    `Wrote map.svg (${stats.countries} countries, ${stats.rings} rings, ${stats.points} points) to ${paths.outputSvg}`
  );
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  });
}
