// Time and timezone utilities for Sunside.
// Wraps Luxon to handle local <-> UTC conversions with IANA zones.

import { DateTime } from 'luxon';

export interface LocalDateTimeInput {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export interface ZonedDateTime {
  iso: string; // ISO-8601 string with explicit zone offset.
  millis: number; // epoch millis (UTC)
  zone: string; // IANA zone name
  offsetMinutes: number; // minutes offset from UTC at that time
}

/**
 * Convert a local date/time in a given IANA time zone to a normalized representation.
 */
export function toZonedDateTime(local: LocalDateTimeInput, timeZone: string): ZonedDateTime {
  const dt = DateTime.fromObject(
    {
      year: local.year,
      month: local.month,
      day: local.day,
      hour: local.hour,
      minute: local.minute
    },
    { zone: timeZone }
  );

  if (!dt.isValid) {
    throw new Error(`Invalid local time for zone ${timeZone}: ${dt.invalidReason ?? 'unknown reason'}`);
  }

  return {
    iso: dt.toISO(),
    millis: dt.toMillis(),
    zone: dt.zoneName,
    offsetMinutes: dt.offset
  };
}

/**
 * Convert UTC epoch millis to a ZonedDateTime in the given zone.
 */
export function fromUtcMillis(utcMillis: number, timeZone: string): ZonedDateTime {
  const dt = DateTime.fromMillis(utcMillis, { zone: 'utc' }).setZone(timeZone);
  if (!dt.isValid) {
    throw new Error(`Invalid UTC millis ${utcMillis} for zone ${timeZone}`);
  }
  return {
    iso: dt.toISO(),
    millis: dt.toMillis(),
    zone: dt.zoneName,
    offsetMinutes: dt.offset
  };
}

/**
 * Compute duration in whole minutes between two epoch millis.
 */
export function durationMinutes(startMillis: number, endMillis: number): number {
  return Math.round((endMillis - startMillis) / 60000);
}
