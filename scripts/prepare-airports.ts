import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import tzLookup from 'tz-lookup';

export interface RawAirportRow {
  id: string;
  ident: string;
  type: string;
  name: string;
  latitude_deg: string;
  longitude_deg: string;
  municipality: string;
  iso_country: string;
  iata_code: string;
  icao_code: string;
  scheduled_service: string;
}

export interface AirportRecord {
  id: number;
  ident: string;
  name: string;
  city: string | null;
  country: string;
  iata: string | null;
  icao: string | null;
  lat: number;
  lon: number;
  tz: string;
}

const ALLOWED_TYPES = new Set(['large_airport', 'medium_airport', 'small_airport']);
const OUR_AIRPORTS_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv';

function toNumber(value: string): number | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

function cleanString(value: string): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseAirportCsv(csvText: string): RawAirportRow[] {
  const rows = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  }) as RawAirportRow[];
  return rows;
}

function deriveTimeZone(lat: number, lon: number): string | null {
  try {
    return tzLookup(lat, lon);
  } catch {
    return null;
  }
}

function hasSignificance(row: RawAirportRow): boolean {
  return row.scheduled_service === 'yes' || Boolean(cleanString(row.iata_code));
}

function typeAllowed(row: RawAirportRow): boolean {
  return ALLOWED_TYPES.has(row.type);
}

function toAllowlistSets(values: Array<string | number>): { idSet: Set<string>; identSet: Set<string> } {
  const idSet = new Set<string>();
  const identSet = new Set<string>();
  for (const value of values) {
    const str = String(value).trim();
    if (!str) continue;
    if (/^\d+$/.test(str)) {
      idSet.add(str);
    }
    identSet.add(str.toLowerCase());
  }
  return { idSet, identSet };
}

export function normalizeAirportRow(row: RawAirportRow): AirportRecord | null {
  const lat = toNumber(row.latitude_deg);
  const lon = toNumber(row.longitude_deg);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  const tz = deriveTimeZone(lat!, lon!);
  if (!tz) {
    return null;
  }

  const id = toNumber(row.id);
  if (id === null) {
    return null;
  }

  return {
    id,
    ident: row.ident,
    name: row.name,
    city: cleanString(row.municipality),
    country: row.iso_country,
    iata: cleanString(row.iata_code),
    icao: cleanString(row.icao_code),
    lat: lat!,
    lon: lon!,
    tz
  };
}

export function buildAirportDataset(rows: RawAirportRow[], allowlistValues: Array<string | number> = []): AirportRecord[] {
  const { idSet, identSet } = toAllowlistSets(allowlistValues);
  const records: AirportRecord[] = [];
  const seenIds = new Set<number>();

  for (const row of rows) {
    const isAllowlisted = idSet.has(row.id) || identSet.has(row.ident.toLowerCase());
    if (!typeAllowed(row)) {
      continue;
    }
    if (!isAllowlisted && !hasSignificance(row)) {
      continue;
    }

    const normalized = normalizeAirportRow(row);
    if (!normalized) {
      continue;
    }
    if (seenIds.has(normalized.id)) {
      continue;
    }
    seenIds.add(normalized.id);
    records.push(normalized);
  }

  records.sort((a, b) => {
    const keyA = (a.iata || a.icao || a.ident).toLowerCase();
    const keyB = (b.iata || b.icao || b.ident).toLowerCase();
    if (keyA !== keyB) return keyA.localeCompare(keyB);
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.id - b.id;
  });

  return records;
}

function loadAllowlistFile(filePath: string): Array<string | number> {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`Allowlist file must contain an array: ${filePath}`);
  }
  return parsed;
}

function getPaths() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(__dirname, '..');
  const dataDir = path.join(repoRoot, 'data');
  return {
    repoRoot,
    dataDir,
    inputCsv: path.join(dataDir, 'airports.csv'),
    allowlist: path.join(dataDir, 'airport-allowlist.json'),
    outputJson: path.join(repoRoot, 'src', 'data', 'airports.json')
  };
}

async function downloadCsv(url: string, destPath: string) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  // eslint-disable-next-line no-console
  console.log(`Downloading airports CSV from ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
  // eslint-disable-next-line no-console
  console.log(`Saved CSV to ${destPath} (${buf.length} bytes)`);
}

async function readOrDownloadCsv(csvPath: string): Promise<string> {
  if (fs.existsSync(csvPath)) {
    return fs.readFileSync(csvPath, 'utf8');
  }
  await downloadCsv(OUR_AIRPORTS_URL, csvPath);
  return fs.readFileSync(csvPath, 'utf8');
}

export async function main() {
  const paths = getPaths();
  const csvText = await readOrDownloadCsv(paths.inputCsv);
  const rows = parseAirportCsv(csvText);
  const allowlist = loadAllowlistFile(paths.allowlist);

  const records = buildAirportDataset(rows, allowlist);

  fs.mkdirSync(path.dirname(paths.outputJson), { recursive: true });
  fs.writeFileSync(paths.outputJson, JSON.stringify(records), 'utf8');

  // eslint-disable-next-line no-console
  console.log(`Wrote ${records.length} airports to ${paths.outputJson}`);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  });
}
