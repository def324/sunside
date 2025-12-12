import { projectEquirectangular, type ProjectedPoint } from './geo';
import { getSubsolarPoint, type SubsolarPoint } from './sun';

export interface DayNightOverlay {
  subsolar: SubsolarPoint;
  sun: ProjectedPoint;
  terminatorPath: string;
  dayPath: string;
  nightPath: string;
}

const RAD = Math.PI / 180;
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
    return { subsolar, sun, terminatorPath: '', dayPath: '', nightPath: '' };
  }

  if (Math.abs(subsolar.lat) <= EQUINOX_LAT_EPS_DEG) {
    return computeEquinoxOverlay(subsolar, width, height, sun);
  }

  const terminator = sampleTerminatorByLongitude(subsolar, width, height, samples);
  const terminatorPath = polylinePath(terminator);

  const northPoly = polygonNorthOfCurve(terminator, width);
  const southPoly = polygonSouthOfCurve(terminator, width, height);

  const dayIsNorth = subsolar.lat > 0;
  const dayPath = dayIsNorth ? northPoly : southPoly;
  const nightPath = dayIsNorth ? southPoly : northPoly;

  return { subsolar, sun, terminatorPath, dayPath, nightPath };
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
    nightPath: nightRects.join(' ')
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
