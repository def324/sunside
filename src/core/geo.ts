// Core geographic utilities for Sunside.
// Implements great-circle math on a spherical Earth and a simple projection.

export interface GeoPoint {
  lat: number; // degrees
  lon: number; // degrees
}

export interface ProjectedPoint {
  x: number;
  y: number;
}

export interface GreatCirclePath {
  from: GeoPoint;
  to: GeoPoint;
  distanceMeters: number;
  centralAngle: number; // radians
}

const EARTH_RADIUS_METERS = 6371000; // Mean Earth radius.

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

function haversineDistance(from: GeoPoint, to: GeoPoint): { distance: number; centralAngle: number } {
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const dLat = lat2 - lat1;
  const dLon = toRadians(to.lon - from.lon);

  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const centralAngle = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  return { distance: EARTH_RADIUS_METERS * centralAngle, centralAngle };
}

function toCartesian(point: GeoPoint): [number, number, number] {
  const lat = toRadians(point.lat);
  const lon = toRadians(point.lon);
  const x = Math.cos(lat) * Math.cos(lon);
  const y = Math.cos(lat) * Math.sin(lon);
  const z = Math.sin(lat);
  return [x, y, z];
}

function fromCartesian([x, y, z]: [number, number, number]): GeoPoint {
  const lon = Math.atan2(y, x);
  const hyp = Math.sqrt(x * x + y * y);
  const lat = Math.atan2(z, hyp);
  return { lat: toDegrees(lat), lon: toDegrees(lon) };
}

/**
 * Compute the initial bearing (forward azimuth) from point A to B in degrees.
 * Bearing is measured clockwise from true north.
 */
export function bearingDegrees(from: GeoPoint, to: GeoPoint): number {
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const dLon = toRadians(to.lon - from.lon);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const brng = Math.atan2(y, x);
  const deg = (toDegrees(brng) + 360) % 360;
  return deg;
}

/**
 * Create a great-circle path description between two geographic points.
 */
export function createGreatCirclePath(from: GeoPoint, to: GeoPoint): GreatCirclePath {
  const { distance, centralAngle } = haversineDistance(from, to);
  return { from, to, distanceMeters: distance, centralAngle };
}

/**
 * Interpolate along a great-circle path using spherical linear interpolation (slerp).
 * @param path Great-circle path descriptor.
 * @param t Parameter from 0 (start) to 1 (end).
 */
export function interpolateOnGreatCircle(path: GreatCirclePath, t: number): GeoPoint {
  const clamped = Math.min(1, Math.max(0, t));
  const a = toCartesian(path.from);
  const b = toCartesian(path.to);

  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const omega = Math.acos(Math.min(1, Math.max(-1, dot)));

  if (omega === 0 || Number.isNaN(omega)) {
    return path.from;
  }

  const sinOmega = Math.sin(omega);
  const factorA = Math.sin((1 - clamped) * omega) / sinOmega;
  const factorB = Math.sin(clamped * omega) / sinOmega;

  const x = factorA * a[0] + factorB * b[0];
  const y = factorA * a[1] + factorB * b[1];
  const z = factorA * a[2] + factorB * b[2];

  return fromCartesian([x, y, z]);
}

/**
 * Project a geographic point into map coordinates using an equirectangular projection.
 */
export function projectEquirectangular(point: GeoPoint, width: number, height: number): ProjectedPoint {
  const lat = Math.max(-90, Math.min(90, point.lat));
  const lon = Math.max(-180, Math.min(180, point.lon));
  return {
    x: ((lon + 180) / 360) * width,
    y: ((90 - lat) / 180) * height
  };
}

/**
 * Split a projected polyline into multiple segments when it crosses the map seam at x=0/width.
 * This prevents drawing a long line across the map when longitudes wrap at the antimeridian.
 */
export function splitPolylineAtMapSeam(points: ProjectedPoint[], width: number): ProjectedPoint[][] {
  if (!Number.isFinite(width) || width <= 0) return [points];
  if (points.length <= 1) return points.length ? [points] : [];

  const segments: ProjectedPoint[][] = [];
  let current: ProjectedPoint[] = [];
  const jumpThreshold = width / 2;

  for (const point of points) {
    const prev = current.at(-1);
    if (!prev) {
      current = [point];
      continue;
    }

    const dx = point.x - prev.x;
    if (Math.abs(dx) <= jumpThreshold) {
      current.push(point);
      continue;
    }

    if (prev.x > point.x) {
      const unwrappedX = point.x + width;
      const denom = unwrappedX - prev.x;
      if (!Number.isFinite(denom) || denom === 0) {
        segments.push(current);
        current = [point];
        continue;
      }
      const t = (width - prev.x) / denom;
      const y = prev.y + t * (point.y - prev.y);
      current.push({ x: width, y });
      segments.push(current);
      current = [{ x: 0, y }, point];
      continue;
    }

    const unwrappedX = point.x - width;
    const denom = unwrappedX - prev.x;
    if (!Number.isFinite(denom) || denom === 0) {
      segments.push(current);
      current = [point];
      continue;
    }
    const t = (0 - prev.x) / denom;
    const y = prev.y + t * (point.y - prev.y);
    current.push({ x: 0, y });
    segments.push(current);
    current = [{ x: width, y }, point];
  }

  if (current.length) segments.push(current);
  return segments;
}

/**
 * Compute great-circle distance (meters) between two points.
 */
export function distanceMeters(from: GeoPoint, to: GeoPoint): number {
  return haversineDistance(from, to).distance;
}
