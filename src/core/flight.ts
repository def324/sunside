// Flight-related domain types and helpers for Sunside.
// Builds on geo/time/sun utilities to model a flight timeline.

import { bearingDegrees, createGreatCirclePath, interpolateOnGreatCircle, projectEquirectangular } from './geo';
import type { GeoPoint, GreatCirclePath, ProjectedPoint } from './geo';
import type { DaylightStatus } from './sun';
import { classifyDaylight, getSunPosition, sunBearingFromNorth } from './sun';
import { durationMinutes } from './time';
import type { ZonedDateTime } from './time';

export interface Airport {
  id: number | string;
  name: string;
  city: string;
  country: string;
  iata?: string;
  icao?: string;
  location: GeoPoint;
  timeZone: string; // IANA time zone identifier
}

export interface FlightPlan {
  departureAirport: Airport;
  arrivalAirport: Airport;
  departureTime: ZonedDateTime;
  arrivalTime: ZonedDateTime;
  departureUtc: number;
  arrivalUtc: number;
  durationMinutes: number;
  path: GreatCirclePath;
}

export interface FlightSample {
  t: number; // 0..1
  utcMillis: number;
  location: GeoPoint;
  headingDeg: number;
  sun: {
    altitude: number;
    azimuth: number;
    bearingDeg: number;
    status: DaylightStatus;
    side: 'left' | 'right' | 'ahead' | 'behind';
  };
  projected?: ProjectedPoint;
}

function validateChronology(departureUtc: number, arrivalUtc: number) {
  if (arrivalUtc <= departureUtc) {
    throw new Error('Arrival time must be after departure time in UTC.');
  }
}

function sunSide(headingDeg: number, sunBearingDeg: number): 'left' | 'right' | 'ahead' | 'behind' {
  const rel = ((sunBearingDeg - headingDeg + 540) % 360) - 180; // -180..180
  const abs = Math.abs(rel);
  if (abs <= 15) return 'ahead';
  if (abs >= 165) return 'behind';
  return rel > 0 ? 'right' : 'left';
}

function headingAt(path: GreatCirclePath, t: number): number {
  const delta = 1e-4; // small step for bearing approximation
  const t1 = Math.min(1, Math.max(0, t));
  const t2 = Math.min(1, t1 + delta);
  if (t2 === t1 && t1 - delta >= 0) {
    return bearingDegrees(interpolateOnGreatCircle(path, t1 - delta), interpolateOnGreatCircle(path, t1));
  }
  return bearingDegrees(interpolateOnGreatCircle(path, t1), interpolateOnGreatCircle(path, t2));
}

export interface FlightDurationEstimateOptions {
  cruiseSpeedKmh?: number;
  roundToMinutes?: number;
  minMinutes?: number;
}

export function estimateFlightDurationMinutes(
  distanceMeters: number,
  options: FlightDurationEstimateOptions = {}
): number {
  const cruiseSpeedKmh = options.cruiseSpeedKmh && options.cruiseSpeedKmh > 0 ? options.cruiseSpeedKmh : 900;
  const roundToMinutes = options.roundToMinutes && options.roundToMinutes > 0 ? options.roundToMinutes : 30;
  const minMinutes = options.minMinutes && options.minMinutes > 0 ? options.minMinutes : roundToMinutes;

  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return minMinutes;
  }

  const rawMinutes = (distanceMeters / 1000 / cruiseSpeedKmh) * 60;
  const rounded = Math.ceil(rawMinutes / roundToMinutes) * roundToMinutes;
  return Math.max(minMinutes, Math.round(rounded));
}

/**
 * Sample the flight at a specific timeline position `t` (0..1).
 * Optionally project coordinates for map rendering.
 */
export function sampleFlightAt(
  plan: FlightPlan,
  t: number,
  projection?: { width: number; height: number }
): FlightSample {
  const clamped = Math.min(1, Math.max(0, t));
  const totalMillis = plan.arrivalUtc - plan.departureUtc;
  const utcMillis = plan.departureUtc + clamped * totalMillis;
  const location = interpolateOnGreatCircle(plan.path, clamped);
  const headingDeg = headingAt(plan.path, clamped);
  const sunPos = getSunPosition(utcMillis, location.lat, location.lon);
  const sunBearing = sunBearingFromNorth(sunPos.azimuth);
  const status = classifyDaylight(sunPos.altitude);
  const projected = projection ? projectEquirectangular(location, projection.width, projection.height) : undefined;

  return {
    t: clamped,
    utcMillis,
    location,
    headingDeg,
    sun: {
      altitude: sunPos.altitude,
      azimuth: sunPos.azimuth,
      bearingDeg: sunBearing,
      status,
      side: sunSide(headingDeg, sunBearing)
    },
    projected
  };
}

/**
 * Construct a validated flight plan with derived timing and path info.
 */
export function createFlightPlan(
  departureAirport: Airport,
  arrivalAirport: Airport,
  departureTime: ZonedDateTime,
  arrivalTime: ZonedDateTime
): FlightPlan {
  const departureUtc = departureTime.millis;
  const arrivalUtc = arrivalTime.millis;
  validateChronology(departureUtc, arrivalUtc);

  const path = createGreatCirclePath(departureAirport.location, arrivalAirport.location);
  const minutes = durationMinutes(departureUtc, arrivalUtc);

  return {
    departureAirport,
    arrivalAirport,
    departureTime,
    arrivalTime,
    departureUtc,
    arrivalUtc,
    durationMinutes: minutes,
    path
  };
}

/**
 * Sample the flight timeline at evenly spaced points.
 * Optionally project coordinates for map rendering.
 */
export function sampleFlight(
  plan: FlightPlan,
  samples = 60,
  projection?: { width: number; height: number }
): FlightSample[] {
  const out: FlightSample[] = [];
  const count = Math.max(2, samples);

  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1);
    out.push(sampleFlightAt(plan, t, projection));
  }

  return out;
}
