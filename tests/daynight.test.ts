import { describe, expect, it } from 'vitest';
import { computeDayNightOverlay } from '../src/core/daynight';

function extractNumbers(path: string): number[] {
  const matches = path.match(/-?\d+(?:\.\d+)?/g);
  return matches ? matches.map((m) => Number(m)) : [];
}

function expectPathPairsInBounds(path: string, width: number, height: number) {
  if (!path) return;
  const nums = extractNumbers(path);
  expect(nums.length % 2).toBe(0);
  for (let i = 0; i < nums.length; i += 2) {
    const x = nums[i];
    const y = nums[i + 1];
    expect(x).toBeGreaterThanOrEqual(-1e-6);
    expect(x).toBeLessThanOrEqual(width + 1e-6);
    expect(y).toBeGreaterThanOrEqual(-1e-6);
    expect(y).toBeLessThanOrEqual(height + 1e-6);
  }
}

function extractPointPairs(path: string): Array<{ x: number; y: number }> {
  const nums = extractNumbers(path);
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    out.push({ x: nums[i], y: nums[i + 1] });
  }
  return out;
}

function normalizeLon(lonDeg: number): number {
  return ((lonDeg + 540) % 360) - 180;
}

function altitudeDegFromSubsolar(subsolar: { lat: number; lon: number }, point: { lat: number; lon: number }): number {
  const RAD = Math.PI / 180;
  const lat0 = subsolar.lat * RAD;
  const lon0 = subsolar.lon * RAD;
  const lat = point.lat * RAD;
  const lon = point.lon * RAD;
  const dot = Math.sin(lat) * Math.sin(lat0) + Math.cos(lat) * Math.cos(lat0) * Math.cos(lon - lon0);
  const altitudeRad = Math.asin(Math.max(-1, Math.min(1, dot)));
  return (altitudeRad * 180) / Math.PI;
}

function unprojectEquirectangular(point: { x: number; y: number }, width: number, height: number): { lat: number; lon: number } {
  const lon = (point.x / width) * 360 - 180;
  const lat = 90 - (point.y / height) * 180;
  return { lat, lon: normalizeLon(lon) };
}

function sampleEvenly<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const out: T[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(items[Math.floor((i / count) * items.length)]);
  }
  return out;
}

function maxConsecutiveDx(points: Array<{ x: number; y: number }>): number {
  if (points.length < 2) return 0;
  let maxDx = 0;
  for (let i = 1; i < points.length; i += 1) {
    maxDx = Math.max(maxDx, Math.abs(points[i].x - points[i - 1].x));
  }
  return maxDx;
}

describe('day/night overlay', () => {
  it('produces bounded paths and correct hemisphere (June solstice)', () => {
    const width = 1800;
    const height = 900;
    const overlay = computeDayNightOverlay(new Date('2024-06-21T12:00:00Z'), width, height, 361);

    expect(overlay.subsolar.lat).toBeGreaterThan(10);
    expect(overlay.sun.x).toBeGreaterThanOrEqual(0);
    expect(overlay.sun.x).toBeLessThanOrEqual(width);
    expect(overlay.sun.y).toBeGreaterThanOrEqual(0);
    expect(overlay.sun.y).toBeLessThanOrEqual(height);

    expect(overlay.dayPath).toContain(`${width.toFixed(1)} 0.0`);
    expect(overlay.nightPath).toContain(`${width.toFixed(1)} ${height.toFixed(1)}`);

    expectPathPairsInBounds(overlay.terminatorPath, width, height);
    expectPathPairsInBounds(overlay.dayPath, width, height);
    expectPathPairsInBounds(overlay.nightPath, width, height);
    expectPathPairsInBounds(overlay.twilightPath, width, height);
  });

  it('produces correct hemisphere (December solstice)', () => {
    const width = 1800;
    const height = 900;
    const overlay = computeDayNightOverlay(new Date('2024-12-21T12:00:00Z'), width, height, 361);
    expect(overlay.subsolar.lat).toBeLessThan(-10);
    expect(overlay.dayPath).toContain(`${width.toFixed(1)} ${height.toFixed(1)}`);
    expect(overlay.nightPath).toContain(`${width.toFixed(1)} 0.0`);
  });

  it('stays bounded when the subsolar longitude is near the seam', () => {
    const width = 1800;
    const height = 900;
    let found: ReturnType<typeof computeDayNightOverlay> | null = null;

    for (let hour = 0; hour < 24; hour += 1) {
      const date = new Date(Date.UTC(2024, 5, 21, hour, 0, 0));
      const overlay = computeDayNightOverlay(date, width, height, 361);
      if (Math.abs(overlay.subsolar.lon) > 170) {
        found = overlay;
        break;
      }
    }

    expect(found).not.toBeNull();
    expectPathPairsInBounds(found?.terminatorPath ?? '', width, height);
    expectPathPairsInBounds(found?.dayPath ?? '', width, height);
    expectPathPairsInBounds(found?.nightPath ?? '', width, height);
    expectPathPairsInBounds(found?.twilightPath ?? '', width, height);

    // Ensure the twilight band does not create a long across-map segment near the seam.
    const pts = extractPointPairs(found?.twilightPath ?? '');
    expect(pts.length).toBeGreaterThan(10);
    expect(maxConsecutiveDx(pts)).toBeLessThan(width / 4);
  });

  it('handles equinox degeneracy with vertical terminator lines', () => {
    const width = 1800;
    const height = 900;
    let found: ReturnType<typeof computeDayNightOverlay> | null = null;

    // Search around March equinox for a time where declination is extremely close to 0.
    const start = Date.UTC(2024, 2, 19, 0, 0, 0);
    const end = Date.UTC(2024, 2, 21, 0, 0, 0);
    const stepMs = 5 * 60 * 1000;
    for (let t = start; t <= end; t += stepMs) {
      const overlay = computeDayNightOverlay(t, width, height, 361);
      if (Math.abs(overlay.subsolar.lat) <= 1e-3) {
        found = overlay;
        break;
      }
    }

    expect(found).not.toBeNull();
    const nums = extractNumbers(found?.terminatorPath ?? '');
    expect(nums.length).toBeGreaterThanOrEqual(8);

    const xs = new Set<number>();
    for (let i = 0; i < nums.length; i += 2) {
      xs.add(nums[i]);
    }
    expect(xs.size).toBeLessThanOrEqual(2);
    expectPathPairsInBounds(found?.terminatorPath ?? '', width, height);
    expectPathPairsInBounds(found?.twilightPath ?? '', width, height);
  });

  it('generates a civil twilight band between 0° and -6° sun altitude', () => {
    const width = 1800;
    const height = 900;
    const date = new Date('2024-06-21T12:00:00Z');
    const overlay = computeDayNightOverlay(date, width, height, 361);
    expect(overlay.twilightPath).toBeTruthy();

    const pts = extractPointPairs(overlay.twilightPath);
    expect(pts.length).toBeGreaterThan(20);
    expect(pts.length % 2).toBe(0);

    const half = pts.length / 2;
    const inner = pts.slice(0, half); // terminator boundary (alt ~ 0)
    const outer = pts.slice(half); // civil boundary (alt ~ -6), reversed

    const safeInner = inner.filter((p) => p.x > 5 && p.x < width - 5 && p.y > 5 && p.y < height - 5);
    const safeOuter = outer.filter((p) => p.x > 5 && p.x < width - 5 && p.y > 5 && p.y < height - 5);

    expect(safeInner.length).toBeGreaterThan(10);
    expect(safeOuter.length).toBeGreaterThan(10);

    const innerSample = sampleEvenly(safeInner, 24);
    const outerSample = sampleEvenly(safeOuter, 24);

    for (const p of innerSample) {
      const ll = unprojectEquirectangular(p, width, height);
      const alt = altitudeDegFromSubsolar(overlay.subsolar, ll);
      expect(Math.abs(alt)).toBeLessThan(1.5);
    }

    for (const p of outerSample) {
      const ll = unprojectEquirectangular(p, width, height);
      const alt = altitudeDegFromSubsolar(overlay.subsolar, ll);
      expect(alt).toBeLessThan(-4.5);
      expect(alt).toBeGreaterThan(-7.5);
    }
  });

  it('keeps the twilight inner edge aligned with the terminator and stable over time', () => {
    const width = 1800;
    const height = 900;
    const samples = 361;
    const start = Date.UTC(2024, 5, 21, 0, 0, 0);
    const stepMs = 60 * 60 * 1000;

    for (let t = start; t < start + 24 * stepMs; t += stepMs) {
      const overlay = computeDayNightOverlay(t, width, height, samples);
      const terminator = extractPointPairs(overlay.terminatorPath);
      const twilight = extractPointPairs(overlay.twilightPath);
      expect(twilight.length).toBeGreaterThan(terminator.length);
      const inner = twilight.slice(0, terminator.length);
      expect(inner.length).toBe(terminator.length);

      for (let i = 0; i < terminator.length; i += 1) {
        const dx = Math.abs(inner[i].x - terminator[i].x);
        const dy = Math.abs(inner[i].y - terminator[i].y);
        expect(dx).toBeLessThanOrEqual(0.11);
        expect(dy).toBeLessThanOrEqual(0.11);
      }

      // Ensure the seam closure remains vertical (no angled cutoff at map edges).
      const lastInner = inner.at(-1);
      const firstInner = inner[0];
      const firstOuter = twilight[terminator.length];
      const lastOuter = twilight.at(-1);
      expect(lastInner).toBeTruthy();
      expect(firstOuter).toBeTruthy();
      expect(lastOuter).toBeTruthy();

      expect(Math.abs((lastInner?.x ?? 0) - (firstOuter?.x ?? 0))).toBeLessThanOrEqual(0.11);
      expect(Math.abs((lastOuter?.x ?? 0) - (firstInner?.x ?? 0))).toBeLessThanOrEqual(0.11);
      expect((firstInner?.x ?? 0)).toBeLessThanOrEqual(0.11);
      expect((lastInner?.x ?? width)).toBeGreaterThanOrEqual(width - 0.11);
    }

    const overlayA = computeDayNightOverlay(start, width, height, samples);
    const overlayB = computeDayNightOverlay(start + 5 * 60 * 1000, width, height, samples);
    const ptsA = extractPointPairs(overlayA.twilightPath);
    const ptsB = extractPointPairs(overlayB.twilightPath);
    expect(ptsA.length).toBe(ptsB.length);

    let maxMove = 0;
    for (let i = 0; i < ptsA.length; i += 1) {
      const dx = ptsB[i].x - ptsA[i].x;
      const dy = ptsB[i].y - ptsA[i].y;
      maxMove = Math.max(maxMove, Math.hypot(dx, dy));
    }

    // A 5-minute step should never cause large point jumps in a stable visualization.
    expect(maxMove).toBeLessThan(25);
  });
});
