import { projectEquirectangular, type ProjectedPoint } from './geo';
import { getSubsolarPoint, type SubsolarPoint } from './sun';

export interface DayNightOverlay {
  subsolar: SubsolarPoint;
  sun: ProjectedPoint;
  terminatorPath: string;
  dayPath: string;
  nightPath: string;
  twilightPath: string;
}

const RAD = Math.PI / 180;
const CIVIL_TWILIGHT_DEG = -6;
// Treat declinations within ~0.001° (~4 minutes around equinox) as equinox to avoid degeneracy.
const EQUINOX_LAT_EPS_DEG = 1e-3;

export function computeDayNightOverlay(
  timestamp: Date | number,
  width: number,
  height: number,
  samples = 361
): DayNightOverlay {
  const date = typeof timestamp === 'number' ? new Date(timestamp) : timestamp;
  const subsolar = getSubsolarPoint(date);
  const sun = projectEquirectangular(subsolar, width, height);

  if (width <= 0 || height <= 0) {
    return { subsolar, sun, terminatorPath: '', dayPath: '', nightPath: '', twilightPath: '' };
  }

  if (Math.abs(subsolar.lat) <= EQUINOX_LAT_EPS_DEG) {
    const overlay = computeEquinoxOverlay(subsolar, width, height, sun);
    return { ...overlay, twilightPath: computeTwilightBandPath(subsolar, width, height, samples) };
  }

  const terminator = sampleTerminatorByLongitude(subsolar, width, height, samples);
  const terminatorPath = polylinePath(terminator);

  const northPoly = polygonNorthOfCurve(terminator, width);
  const southPoly = polygonSouthOfCurve(terminator, width, height);

  const dayIsNorth = subsolar.lat > 0;
  const dayPath = dayIsNorth ? northPoly : southPoly;
  const nightPath = dayIsNorth ? southPoly : northPoly;
  const twilightPath = computeTwilightBandPath(subsolar, width, height, samples);

  return { subsolar, sun, terminatorPath, dayPath, nightPath, twilightPath };
}

function computeEquinoxOverlay(subsolar: SubsolarPoint, width: number, height: number, sun: ProjectedPoint): DayNightOverlay {
  const lon1 = normalizeLon(subsolar.lon - 90);
  const lon2 = normalizeLon(subsolar.lon + 90);
  const x1 = lonToX(lon1, width);
  const x2 = lonToX(lon2, width);

  const terminatorPath = `${verticalLinePath(x1, height)} ${verticalLinePath(x2, height)}`.trim();

  const dayRects: string[] = [];
  const nightRects: string[] = [];

  if (x1 <= x2) {
    pushRect(dayRects, x1, x2, width, height);
    pushRect(nightRects, 0, x1, width, height);
    pushRect(nightRects, x2, width, width, height);
  } else {
    pushRect(dayRects, 0, x2, width, height);
    pushRect(dayRects, x1, width, width, height);
    pushRect(nightRects, x2, x1, width, height);
  }

  return {
    subsolar,
    sun,
    terminatorPath,
    dayPath: dayRects.join(' '),
    nightPath: nightRects.join(' '),
    twilightPath: ''
  };
}

function sampleTerminatorByLongitude(
  subsolar: SubsolarPoint,
  width: number,
  height: number,
  samples: number
): ProjectedPoint[] {
  const count = Math.max(2, Math.floor(samples));
  const out: ProjectedPoint[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1);
    const lon = -180 + t * 360;
    const lat = terminatorLatitudeDeg(subsolar, lon);
    out.push(projectEquirectangular({ lat, lon }, width, height));
  }
  return out;
}

function terminatorLatitudeDeg(subsolar: SubsolarPoint, lonDeg: number): number {
  const lat0 = subsolar.lat * RAD;
  const lon0 = subsolar.lon * RAD;
  const lon = lonDeg * RAD;
  const delta = lon - lon0;

  // tan(phi) = -cot(lat0) * cos(delta)
  const y = -Math.cos(lat0) * Math.cos(delta);
  const x = Math.sin(lat0);
  let phi = Math.atan2(y, x);

  // Choose the branch in [-pi/2, pi/2] (latitude range).
  if (phi > Math.PI / 2) phi -= Math.PI;
  if (phi < -Math.PI / 2) phi += Math.PI;

  return phi / RAD;
}

function polygonNorthOfCurve(points: ProjectedPoint[], width: number): string {
  if (!points.length) return '';
  const d = `${polylinePath(points)} L ${fmt(width)} 0.0 L 0.0 0.0 Z`;
  return d;
}

function polygonSouthOfCurve(points: ProjectedPoint[], width: number, height: number): string {
  if (!points.length) return '';
  const d = `${polylinePath(points)} L ${fmt(width)} ${fmt(height)} L 0.0 ${fmt(height)} Z`;
  return d;
}

function pushRect(out: string[], x0: number, x1: number, width: number, height: number) {
  const start = clamp(Math.min(x0, x1), 0, width);
  const end = clamp(Math.max(x0, x1), 0, width);
  if (end - start <= 1e-6) return;
  out.push(rectPath(start, end, height));
}

function rectPath(x0: number, x1: number, height: number): string {
  return `M ${fmt(x0)} 0.0 L ${fmt(x1)} 0.0 L ${fmt(x1)} ${fmt(height)} L ${fmt(x0)} ${fmt(height)} Z`;
}

function verticalLinePath(x: number, height: number): string {
  const cx = clamp(x, 0, Number.POSITIVE_INFINITY);
  return `M ${fmt(cx)} 0.0 L ${fmt(cx)} ${fmt(height)}`;
}

function polylinePath(points: ProjectedPoint[]): string {
  if (!points.length) return '';
  const [first, ...rest] = points;
  let d = `M ${fmt(first.x)} ${fmt(first.y)}`;
  for (const p of rest) {
    d += ` L ${fmt(p.x)} ${fmt(p.y)}`;
  }
  return d;
}

function lonToX(lonDeg: number, width: number): number {
  return ((lonDeg + 180) / 360) * width;
}

function normalizeLon(lonDeg: number): number {
  return ((lonDeg + 540) % 360) - 180;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function fmt(value: number): string {
  const v = Math.round(value * 10) / 10;
  return (Object.is(v, -0) ? 0 : v).toFixed(1);
}

type Vec3 = [number, number, number];

type SphericalPoint = { lat: number; lon: number };

type ContourBasis = { n: Vec3; u: Vec3; v: Vec3 };

function computeTwilightBandPath(subsolar: SubsolarPoint, width: number, height: number, samples: number): string {
  if (width <= 0 || height <= 0) return '';
  const count = Math.max(3, Math.floor(samples));

  if (Math.abs(subsolar.lat) <= EQUINOX_LAT_EPS_DEG) {
    // Close to equinox the terminator becomes nearly vertical; fall back to a full spherical contour
    // to avoid numerical instability in the longitude-sampled solver.
    return computeTwilightBandPathByContour(subsolar, width, height, count);
  }

  return computeTwilightBandPathByLongitude(subsolar, width, height, count);
}

function computeTwilightBandPathByLongitude(subsolar: SubsolarPoint, width: number, height: number, samples: number): string {
  const count = Math.max(3, Math.floor(samples));
  const inner: ProjectedPoint[] = [];
  const outer: ProjectedPoint[] = [];
  const dayIsNorth = subsolar.lat > 0;

  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : i / (count - 1);
    const lon = -180 + t * 360;
    const termLat = terminatorLatitudeDeg(subsolar, lon);
    const civilLat =
      solarAltitudeContourLatitudeDeg(subsolar, lon, CIVIL_TWILIGHT_DEG, termLat) ?? (dayIsNorth ? -90 : 90);
    inner.push(projectEquirectangular({ lat: termLat, lon }, width, height));
    outer.push(projectEquirectangular({ lat: civilLat, lon }, width, height));
  }

  return bandPolygonPath(inner, outer);
}

function solarAltitudeContourLatitudeDeg(
  subsolar: SubsolarPoint,
  lonDeg: number,
  altitudeDeg: number,
  terminatorLatDeg: number
): number | null {
  const alt = altitudeDeg * RAD;
  const sinAlt = Math.sin(alt);

  const lat0 = subsolar.lat * RAD;
  const lon0 = subsolar.lon * RAD;
  const lon = lonDeg * RAD;
  const delta = lon - lon0;

  const a = Math.sin(lat0);
  const b = Math.cos(lat0) * Math.cos(delta);
  const r = Math.hypot(a, b);
  if (!Number.isFinite(r) || r === 0) return null;

  const v = sinAlt / r;
  if (!Number.isFinite(v) || v < -1 || v > 1) return null;

  // Solve A*sin(phi) + B*cos(phi) = sin(alt) for latitude phi in [-pi/2, pi/2].
  // We use a cosine form: R*cos(phi - deltaAngle) = sin(alt), then phi = deltaAngle ± acos(sin(alt)/R).
  const deltaAngle = Math.atan2(a, b);
  const offset = Math.acos(v);

  const candidates = [wrapToPi(deltaAngle + offset), wrapToPi(deltaAngle - offset)].filter(
    (phi) => phi >= -Math.PI / 2 && phi <= Math.PI / 2
  );
  if (!candidates.length) return null;

  const termPhi = terminatorLatDeg * RAD;
  const wantNorth = subsolar.lat < 0;

  let best = candidates[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const phi of candidates) {
    const d = phi - termPhi;
    const onNightSide = wantNorth ? d >= 0 : d <= 0;
    const score = Math.abs(d) + (onNightSide ? 0 : 10);
    if (score < bestScore) {
      best = phi;
      bestScore = score;
    }
  }

  return best / RAD;
}

function wrapToPi(angleRad: number): number {
  return Math.atan2(Math.sin(angleRad), Math.cos(angleRad));
}

function computeTwilightBandPathByContour(subsolar: SubsolarPoint, width: number, height: number, samples: number): string {
  const count = Math.max(3, Math.floor(samples));
  const basis = buildContourBasis(subsolar);
  const terminator = sampleSolarAltitudeContour(basis, 0, count);
  const civil = sampleSolarAltitudeContour(basis, CIVIL_TWILIGHT_DEG, count);
  if (!terminator.length || terminator.length !== civil.length) return '';

  const terminatorLon = unwrapLongitudes(terminator.map((p) => p.lon));
  const civilLon = alignLongitudes(terminatorLon, civil.map((p) => p.lon));

  const termProj = terminator.map((p, i) =>
    projectEquirectangular({ lat: p.lat, lon: normalizeLon(terminatorLon[i]) }, width, height)
  );
  const civilProj = civil.map((p, i) =>
    projectEquirectangular({ lat: p.lat, lon: normalizeLon(civilLon[i]) }, width, height)
  );

  const startIndex = findRightToLeftSeamIndex(termProj, width);
  const termRot = rotate(termProj, startIndex);
  const civilRot = rotate(civilProj, startIndex);

  return splitBandAtMapSeam(termRot, civilRot, width);
}

function buildContourBasis(subsolar: SubsolarPoint): ContourBasis {
  const lat0 = subsolar.lat * RAD;
  const lon0 = subsolar.lon * RAD;
  const n: Vec3 = [Math.cos(lat0) * Math.cos(lon0), Math.cos(lat0) * Math.sin(lon0), Math.sin(lat0)];
  const ref: Vec3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = normalizeVec3(crossVec3(ref, n));
  const v = normalizeVec3(crossVec3(n, u));
  return { n, u, v };
}

function sampleSolarAltitudeContour(basis: ContourBasis, altitudeDeg: number, samples: number): SphericalPoint[] {
  const count = Math.max(3, Math.floor(samples));
  const alt = altitudeDeg * RAD;
  const sinAlt = Math.sin(alt);
  const cosAlt = Math.cos(alt);
  const out: SphericalPoint[] = [];

  for (let i = 0; i < count; i += 1) {
    const theta = (i / count) * Math.PI * 2;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const x = basis.n[0] * sinAlt + basis.u[0] * cosAlt * cosT + basis.v[0] * cosAlt * sinT;
    const y = basis.n[1] * sinAlt + basis.u[1] * cosAlt * cosT + basis.v[1] * cosAlt * sinT;
    const z = basis.n[2] * sinAlt + basis.u[2] * cosAlt * cosT + basis.v[2] * cosAlt * sinT;

    const lon = normalizeLon((Math.atan2(y, x) / RAD) as number);
    const hyp = Math.sqrt(x * x + y * y);
    const lat = (Math.atan2(z, hyp) / RAD) as number;
    out.push({ lat, lon });
  }
  return out;
}

function bandPolygonPath(inner: ProjectedPoint[], outer: ProjectedPoint[]): string {
  if (!inner.length || inner.length !== outer.length) return '';
  let d = `M ${fmt(inner[0].x)} ${fmt(inner[0].y)}`;
  for (let i = 1; i < inner.length; i += 1) {
    d += ` L ${fmt(inner[i].x)} ${fmt(inner[i].y)}`;
  }
  for (let i = outer.length - 1; i >= 0; i -= 1) {
    d += ` L ${fmt(outer[i].x)} ${fmt(outer[i].y)}`;
  }
  d += ' Z';
  return d;
}

function findRightToLeftSeamIndex(points: ProjectedPoint[], width: number): number {
  if (points.length < 2 || !Number.isFinite(width) || width <= 0) return 0;
  const jumpThreshold = width / 2;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    const dx = cur.x - prev.x;
    if (Math.abs(dx) > jumpThreshold && prev.x > cur.x) {
      return i;
    }
  }
  return 0;
}

function splitBandAtMapSeam(inner: ProjectedPoint[], outer: ProjectedPoint[], width: number): string {
  if (inner.length < 2 || inner.length !== outer.length) return '';
  if (!Number.isFinite(width) || width <= 0) return bandPolygonPath(inner, outer);

  const jumpThreshold = width / 2;
  const paths: string[] = [];

  let currentInner: ProjectedPoint[] = [inner[0]];
  let currentOuter: ProjectedPoint[] = [outer[0]];

  const flush = () => {
    if (currentInner.length >= 2 && currentOuter.length >= 2) {
      paths.push(bandPolygonPath(currentInner, currentOuter));
    }
    currentInner = [];
    currentOuter = [];
  };

  for (let i = 1; i < inner.length; i += 1) {
    const prevI = inner[i - 1];
    const curI = inner[i];
    const prevO = outer[i - 1];
    const curO = outer[i];

    const dx = curI.x - prevI.x;
    if (Math.abs(dx) <= jumpThreshold) {
      currentInner.push(curI);
      currentOuter.push(curO);
      continue;
    }

    const seam = seamIntersections(prevI, curI, width);
    const seamOuter = seamIntersections(prevO, curO, width);
    if (!seam || !seamOuter) {
      flush();
      currentInner = [curI];
      currentOuter = [curO];
      continue;
    }

    currentInner.push(seam.end);
    currentOuter.push(seamOuter.end);
    flush();

    currentInner = [seam.start, curI];
    currentOuter = [seamOuter.start, curO];
  }

  flush();
  return paths.join(' ');
}

function seamIntersections(from: ProjectedPoint, to: ProjectedPoint, width: number): { end: ProjectedPoint; start: ProjectedPoint } | null {
  if (!Number.isFinite(width) || width <= 0) return null;
  if (from.x > to.x) {
    const unwrappedX = to.x + width;
    const denom = unwrappedX - from.x;
    if (!Number.isFinite(denom) || denom === 0) return null;
    const t = (width - from.x) / denom;
    const y = from.y + t * (to.y - from.y);
    return { end: { x: width, y }, start: { x: 0, y } };
  }

  const unwrappedX = to.x - width;
  const denom = unwrappedX - from.x;
  if (!Number.isFinite(denom) || denom === 0) return null;
  const t = (0 - from.x) / denom;
  const y = from.y + t * (to.y - from.y);
  return { end: { x: 0, y }, start: { x: width, y } };
}

function rotate<T>(arr: T[], startIndex: number): T[] {
  if (!arr.length) return arr;
  const idx = ((startIndex % arr.length) + arr.length) % arr.length;
  if (idx === 0) return arr;
  return arr.slice(idx).concat(arr.slice(0, idx));
}

function unwrapLongitudes(lons: number[]): number[] {
  if (!lons.length) return [];
  const out = [lons[0]];
  for (let i = 1; i < lons.length; i += 1) {
    let lon = lons[i];
    const prev = out[i - 1];
    while (lon - prev > 180) lon -= 360;
    while (lon - prev < -180) lon += 360;
    out.push(lon);
  }
  return out;
}

function alignLongitudes(reference: number[], raw: number[]): number[] {
  if (!reference.length || reference.length !== raw.length) return raw;
  const out: number[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const base = raw[i];
    const target = reference[i];
    let lon = base + 360 * Math.round((target - base) / 360);
    if (i > 0) {
      const prev = out[i - 1];
      while (lon - prev > 180) lon -= 360;
      while (lon - prev < -180) lon += 360;
    }
    out.push(lon);
  }
  return out;
}

function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalizeVec3(v: Vec3): Vec3 {
  const mag = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
  return [v[0] / mag, v[1] / mag, v[2] / mag];
}
