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
  });
});

