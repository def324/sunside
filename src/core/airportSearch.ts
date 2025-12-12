export interface AirportSearchRecord {
  id: number | string;
  ident?: string | null;
  name: string;
  city?: string | null;
  country?: string | null;
  iata?: string | null;
  icao?: string | null;
}

interface IndexedAirport<T extends AirportSearchRecord> {
  airport: T;
  iata: string;
  icao: string;
  ident: string;
  name: string;
  city: string;
  country: string;
  words: string[];
  combined: string;
  hasIata: boolean;
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeCode(value: string): string {
  return normalizeText(value).replace(/\s+/g, '');
}

function wordPrefixMatch(words: string[], tokens: string[]): boolean {
  return tokens.every((token) => words.some((word) => word.startsWith(token)));
}

function scoreAirport<T extends AirportSearchRecord>(
  entry: IndexedAirport<T>,
  qText: string,
  qCode: string,
  tokens: string[]
): number | null {
  if (!tokens.every((token) => entry.combined.includes(token))) return null;

  const scores: number[] = [];

  if (entry.iata && entry.iata === qCode) scores.push(0);
  if (entry.icao && entry.icao === qCode) scores.push(1);
  if (entry.ident && entry.ident === qCode) scores.push(2);

  if (entry.iata && entry.iata.startsWith(qCode)) scores.push(10 + Math.max(0, entry.iata.length - qCode.length));
  if (entry.icao && entry.icao.startsWith(qCode)) scores.push(11 + Math.max(0, entry.icao.length - qCode.length));
  if (entry.ident && entry.ident.startsWith(qCode)) scores.push(12 + Math.max(0, entry.ident.length - qCode.length));

  if (entry.city && entry.city.startsWith(qText)) scores.push(20);
  if (entry.name && entry.name.startsWith(qText)) scores.push(21);
  if (wordPrefixMatch(entry.words, tokens)) scores.push(22);

  if (entry.iata && entry.iata.includes(qCode)) scores.push(30 + entry.iata.indexOf(qCode));
  if (entry.icao && entry.icao.includes(qCode)) scores.push(31 + entry.icao.indexOf(qCode));
  if (entry.ident && entry.ident.includes(qCode)) scores.push(32 + entry.ident.indexOf(qCode));

  if (entry.city && entry.city.includes(qText)) scores.push(40 + entry.city.indexOf(qText));
  if (entry.name && entry.name.includes(qText)) scores.push(41 + entry.name.indexOf(qText));

  if (!scores.length) return null;
  const base = Math.min(...scores);

  // Tie-breakers: prefer airports with IATA codes, and those with a city field.
  let penalty = 0;
  if (!entry.hasIata) penalty += 0.25;
  if (!entry.city) penalty += 0.1;
  return base + penalty;
}

export function buildAirportSearchIndex<T extends AirportSearchRecord>(airports: readonly T[]): ReadonlyArray<IndexedAirport<T>> {
  return airports.map((airport) => {
    const iata = airport.iata ? normalizeCode(airport.iata) : '';
    const icao = airport.icao ? normalizeCode(airport.icao) : '';
    const ident = airport.ident ? normalizeCode(airport.ident) : '';
    const name = normalizeText(airport.name ?? '');
    const city = normalizeText(airport.city ?? '');
    const country = normalizeText(airport.country ?? '');
    const words = [...name.split(' '), ...city.split(' ')].filter(Boolean);
    const combined = `${iata} ${icao} ${ident} ${name} ${city} ${country}`.trim();
    return {
      airport,
      iata,
      icao,
      ident,
      name,
      city,
      country,
      words,
      combined,
      hasIata: Boolean(iata)
    };
  });
}

export function searchAirports<T extends AirportSearchRecord>(
  index: ReadonlyArray<IndexedAirport<T>>,
  query: string,
  limit = 20
): T[] {
  const qText = normalizeText(query);
  if (!qText) return [];

  const qCode = normalizeCode(query);
  const tokens = qText.split(/\s+/).filter(Boolean);

  const scored: Array<{ airport: T; score: number; tie: string; hasIata: boolean }> = [];
  for (const entry of index) {
    const score = scoreAirport(entry, qText, qCode, tokens);
    if (score === null) continue;
    const code = entry.airport.iata ?? entry.airport.icao ?? entry.airport.ident ?? '';
    scored.push({
      airport: entry.airport,
      score,
      hasIata: entry.hasIata,
      tie: `${code} ${entry.airport.name}`.toLowerCase()
    });
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    if (a.hasIata !== b.hasIata) return a.hasIata ? -1 : 1;
    return a.tie.localeCompare(b.tie);
  });

  return scored.slice(0, limit).map((s) => s.airport);
}

