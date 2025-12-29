import { DateTime } from 'luxon';
import tzLookup from 'tz-lookup';

export type TimeZoneSample = {
  location: { lat: number; lon: number };
};

export type TimeZoneLookupOptions = {
  /**
   * When provided, forces index 0 and the last sample to use these zones.
   * Useful to guarantee airport endpoints match their declared IANA zones.
   */
  departureTimeZone?: string;
  arrivalTimeZone?: string;
  /**
   * Used when a lookup fails (e.g. invalid coords).
   * Defaults to `'utc'`.
   */
  fallbackTimeZone?: string;
};

export type LocalTimeZoneInfo = {
  timeZone: string;
  offsetMinutes: number;
};

function clampFinite(value: number, min: number, max: number): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.min(max, Math.max(min, value));
}

function normalizeLon(lon: number): number | null {
  if (!Number.isFinite(lon)) return null;
  const wrapped = ((lon + 180) % 360 + 360) % 360 - 180;
  // Preserve -180/180 boundary if it occurs exactly.
  if (wrapped === -180) return 180;
  return wrapped;
}

export function timeZoneFromLatLon(lat: number, lon: number): string | null {
  const safeLat = clampFinite(lat, -90, 90);
  const safeLon = normalizeLon(lon);
  if (safeLat === null || safeLon === null) return null;
  try {
    return tzLookup(safeLat, safeLon);
  } catch {
    return null;
  }
}

export function localTimeZoneInfoAtLocation(utcMillis: number, lat: number, lon: number): LocalTimeZoneInfo | null {
  if (!Number.isFinite(utcMillis)) return null;
  const timeZone = timeZoneFromLatLon(lat, lon);
  if (!timeZone) return null;
  const dt = DateTime.fromMillis(utcMillis, { zone: 'utc' }).setZone(timeZone);
  if (!dt.isValid) return null;
  return { timeZone, offsetMinutes: dt.offset };
}

export function computeTimeZonesForSamples(samples: TimeZoneSample[], options: TimeZoneLookupOptions = {}): string[] {
  const fallbackTimeZone = options.fallbackTimeZone ?? 'utc';
  const out = samples.map((sample) => timeZoneFromLatLon(sample.location.lat, sample.location.lon) ?? fallbackTimeZone);

  if (out.length === 0) return out;

  if (options.departureTimeZone) out[0] = options.departureTimeZone;
  if (options.arrivalTimeZone) out[out.length - 1] = options.arrivalTimeZone;

  return out;
}
