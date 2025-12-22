import { DateTime } from 'luxon';
import type { AirportRecord, PlaybackSpeed } from './types';

export type AutoplayParams = {
  enabled: boolean;
  speed: PlaybackSpeed | null;
  delayMs: number;
};

export function parseAutoplayParams(params: URLSearchParams): AutoplayParams {
  const rawAutoplay = params.get('autoplay');
  const enabled =
    rawAutoplay === '' ||
    rawAutoplay === '1' ||
    rawAutoplay === 'true' ||
    rawAutoplay === 'yes' ||
    rawAutoplay === 'on';

  const rawSpeed = params.get('autoplaySpeed');
  let speed: PlaybackSpeed | null = null;
  if (rawSpeed !== null) {
    const n = Number(rawSpeed);
    if (n === 1 || n === 2 || n === 4) speed = n;
    else console.info('[sunside] Ignoring invalid autoplaySpeed:', rawSpeed);
  }

  const rawDelay = params.get('autoplayDelayMs');
  let delayMs = 0;
  if (rawDelay !== null) {
    const n = Math.round(Number(rawDelay));
    if (!Number.isFinite(n)) {
      console.info('[sunside] Ignoring invalid autoplayDelayMs:', rawDelay);
    } else {
      delayMs = Math.min(10_000, Math.max(0, n));
      if (delayMs !== n) console.info('[sunside] Clamped autoplayDelayMs to', delayMs);
    }
  }

  return { enabled, speed, delayMs };
}

export function findAirportFromParam(airports: readonly AirportRecord[], value: string): AirportRecord | null {
  const raw = value.trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const id = Number(raw);
    if (Number.isSafeInteger(id)) return airports.find((a) => a.id === id) ?? null;
  }
  const code = raw.toUpperCase();
  return (
    airports.find((a) => (a.iata?.toUpperCase() ?? '') === code) ??
    airports.find((a) => (a.icao?.toUpperCase() ?? '') === code) ??
    airports.find((a) => a.ident.toUpperCase() === code) ??
    null
  );
}

export function parseLocalDateTimeParam(value: string): { date: string; time: string } | null {
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/);
  if (!match) return null;
  const date = match[1];
  const time = match[2];
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: 'UTC' });
  if (!dt.isValid) return null;
  return { date, time };
}

export type ShareFlightParams = {
  departure: AirportRecord;
  arrival: AirportRecord;
  departureDate: string;
  departureTime: string;
  arrivalDate: string;
  arrivalTime: string;
};

export function parseShareFlightParams(airports: readonly AirportRecord[], params: URLSearchParams): ShareFlightParams | null {
  const from = params.get('from');
  const to = params.get('to');
  const depart = params.get('depart');
  const arrive = params.get('arrive');
  if (!from || !to || !depart || !arrive) return null;

  const depAirport = findAirportFromParam(airports, from);
  const arrAirport = findAirportFromParam(airports, to);
  if (!depAirport || !arrAirport) {
    console.info('[sunside] Ignoring share params due to unknown airport:', { from, to });
    return null;
  }

  const depLocal = parseLocalDateTimeParam(depart);
  const arrLocal = parseLocalDateTimeParam(arrive);
  if (!depLocal || !arrLocal) {
    console.info('[sunside] Ignoring share params due to invalid depart/arrive time:', { depart, arrive });
    return null;
  }

  return {
    departure: depAirport,
    arrival: arrAirport,
    departureDate: depLocal.date,
    departureTime: depLocal.time,
    arrivalDate: arrLocal.date,
    arrivalTime: arrLocal.time
  };
}

export type ShareUrlOptions = {
  from: string;
  to: string;
  depart: string;
  arrive: string;
  autoplay?: boolean;
  autoplaySpeed?: PlaybackSpeed | null;
};

export function buildShareUrl(baseUrl: string, options: ShareUrlOptions): string {
  const url = new URL(baseUrl);
  url.search = '';
  url.searchParams.set('from', options.from);
  url.searchParams.set('to', options.to);
  url.searchParams.set('depart', options.depart);
  url.searchParams.set('arrive', options.arrive);
  if (options.autoplay) {
    url.searchParams.set('autoplay', 'true');
    const s = options.autoplaySpeed;
    if (s === 1 || s === 2 || s === 4) url.searchParams.set('autoplaySpeed', String(s));
  }
  return url.toString();
}

