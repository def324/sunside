// Sun and daylight utilities for Sunside.
// Wraps the SunCalc library to compute sun position and day/night classification.

import SunCalc from 'suncalc';

export type DaylightStatus = 'day' | 'twilight' | 'night';

export interface SunPosition {
  altitude: number; // radians
  azimuth: number; // radians
}

export interface SubsolarPoint {
  lat: number; // degrees
  lon: number; // degrees in [-180, 180)
}

export interface TerminatorSample {
  lat: number;
  lon: number;
}

/**
 * Compute the sun position at a given time and location.
 */
export function getSunPosition(timestamp: Date | number, lat: number, lon: number): SunPosition {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
  const pos = SunCalc.getPosition(date, lat, lon);
  return {
    altitude: pos.altitude,
    azimuth: pos.azimuth
  };
}

/**
 * Convert SunCalc azimuth (0 = south, positive westward) to a compass bearing from true north.
 */
export function sunBearingFromNorth(azimuthRad: number): number {
  const deg = (azimuthRad * 180) / Math.PI;
  return (deg + 180 + 360) % 360;
}

/**
 * Classify daylight status based on sun altitude.
 * - day: altitude > 0
 * - twilight: -6 <= altitude <= 0
 * - night: altitude < -6
 */
export function classifyDaylight(altitudeRad: number): DaylightStatus {
  const altitudeDeg = (altitudeRad * 180) / Math.PI;
  if (altitudeDeg > 0) return 'day';
  if (altitudeDeg >= -6) return 'twilight';
  return 'night';
}

/**
 * Approximate the day/night terminator by sampling longitudes and finding the latitude where altitude crosses zero.
 * This is a coarse approximation but sufficient for a static overlay.
 */
export function approximateTerminator(
  timestamp: Date | number,
  samples = 180
): Array<{ lat: number; lon: number }> {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
  const result: Array<{ lat: number; lon: number }> = [];

  const step = 360 / samples;
  for (let i = 0; i < samples; i += 1) {
    const lon = -180 + i * step;
    const lat = findZeroAltitudeLat(date, lon);
    result.push({ lat, lon });
  }
  return result;
}

/**
 * Compute the subsolar point (where the sun is at zenith) for a given timestamp.
 * Based on the same solar position math used internally by SunCalc (MIT-licensed).
 */
export function getSubsolarPoint(timestamp: Date | number): SubsolarPoint {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
  const d = toDays(date);
  const { dec, ra } = sunCoords(d);
  const gmst = siderealTime(d, 0); // Greenwich mean sidereal time
  const lonRad = normalizeRadians(ra - gmst); // hour angle = 0 at subsolar longitude
  const latDeg = (dec * 180) / Math.PI;
  const lonDeg = ((lonRad * 180) / Math.PI + 540) % 360 - 180; // wrap to [-180, 180)
  return { lat: latDeg, lon: lonDeg };
}

/**
 * Sample the great-circle terminator (sun altitude = 0) as a ring of lat/lon points.
 * Returns points ordered around the circle (not sorted by longitude).
 */
export function sampleTerminatorCircle(subsolar: SubsolarPoint, samples = 361): TerminatorSample[] {
  const lat0 = (subsolar.lat * Math.PI) / 180;
  const lon0 = (subsolar.lon * Math.PI) / 180;
  const cx = Math.cos(lat0) * Math.cos(lon0);
  const cy = Math.cos(lat0) * Math.sin(lon0);
  const cz = Math.sin(lat0);
  const center = [cx, cy, cz];
  const ref = Math.abs(cx) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = normalize(cross(ref, center));
  const v = normalize(cross(center, u));

  const pts: TerminatorSample[] = [];
  for (let i = 0; i < samples; i += 1) {
    const theta = (i / samples) * Math.PI * 2;
    const x = u[0] * Math.cos(theta) + v[0] * Math.sin(theta);
    const y = u[1] * Math.cos(theta) + v[1] * Math.sin(theta);
    const z = u[2] * Math.cos(theta) + v[2] * Math.sin(theta);
    const lon = Math.atan2(y, x);
    const hyp = Math.sqrt(x * x + y * y);
    const lat = Math.atan2(z, hyp);
    pts.push({ lat: (lat * 180) / Math.PI, lon: (lon * 180) / Math.PI });
  }
  return pts;
}

function altitudeAt(date: Date, lat: number, lon: number): number {
  return SunCalc.getPosition(date, lat, lon).altitude;
}

function findZeroAltitudeLat(date: Date, lon: number): number {
  const minLat = -89.9;
  const maxLat = 89.9;
  const altMin = altitudeAt(date, minLat, lon);
  const altMax = altitudeAt(date, maxLat, lon);

  // If there is no crossing (polar day or night), pick the edge.
  if (altMin >= 0 && altMax >= 0) return maxLat;
  if (altMin <= 0 && altMax <= 0) return minLat;

  let low = minLat;
  let high = maxLat;
  for (let i = 0; i < 25; i += 1) {
    const mid = (low + high) / 2;
    const alt = altitudeAt(date, mid, lon);
    if (alt > 0) {
      high = mid;
    } else {
      low = mid;
    }
  }
  return (low + high) / 2;
}

// --- Helpers for subsolar computation (adapted from SunCalc internals) ---
const RAD = Math.PI / 180;
const dayMs = 1000 * 60 * 60 * 24;
const J1970 = 2440588;
const J2000 = 2451545;
const E = RAD * 23.4397; // obliquity of Earth

function toJulian(date: Date): number {
  return date.valueOf() / dayMs - 0.5 + J1970;
}

function toDays(date: Date): number {
  return toJulian(date) - J2000;
}

function rightAscension(l: number, b: number): number {
  return Math.atan2(Math.sin(l) * Math.cos(E) - Math.tan(b) * Math.sin(E), Math.cos(l));
}

function declination(l: number, b: number): number {
  return Math.asin(Math.sin(b) * Math.cos(E) + Math.cos(b) * Math.sin(E) * Math.sin(l));
}

function siderealTime(d: number, lw: number): number {
  return RAD * (280.16 + 360.9856235 * d) - lw;
}

function solarMeanAnomaly(d: number): number {
  return RAD * (357.5291 + 0.98560028 * d);
}

function eclipticLongitude(M: number): number {
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const P = RAD * 102.9372; // perihelion of Earth
  return M + C + P + Math.PI;
}

function sunCoords(d: number): { dec: number; ra: number } {
  const M = solarMeanAnomaly(d);
  const L = eclipticLongitude(M);
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}

function normalizeRadians(rad: number): number {
  const twoPi = Math.PI * 2;
  return ((rad + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;
}

function cross(a: number[], b: number[]) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(v: number[]) {
  const mag = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
  return [v[0] / mag, v[1] / mag, v[2] / mag];
}
