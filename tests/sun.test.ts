import { describe, expect, it } from 'vitest';
import {
  approximateTerminator,
  classifyDaylight,
  getSubsolarPoint,
  getSunPosition,
  sampleTerminatorCircle,
  sunBearingFromNorth
} from '../src/core/sun';
import { projectEquirectangular } from '../src/core/geo';

describe('sun core', () => {
  it('computes sensible sun positions for day vs night', () => {
    const noon = getSunPosition(new Date('2024-06-21T12:00:00Z'), 0, 0);
    const midnight = getSunPosition(new Date('2024-06-21T00:00:00Z'), 0, 0);
    expect(noon.altitude).toBeGreaterThan(0);
    expect(midnight.altitude).toBeLessThan(0);
  });

  it('classifies daylight vs twilight vs night', () => {
    expect(classifyDaylight((10 * Math.PI) / 180)).toBe('day');
    expect(classifyDaylight((-3 * Math.PI) / 180)).toBe('twilight');
    expect(classifyDaylight((-10 * Math.PI) / 180)).toBe('night');
  });

  it('converts SunCalc azimuth to compass bearing', () => {
    const bearing = sunBearingFromNorth(0); // SunCalc azimuth 0 = south
    expect(bearing).toBeCloseTo(180, 5);
  });

  it('generates a coarse terminator polyline', () => {
    const line = approximateTerminator(new Date('2024-06-21T12:00:00Z'), 36);
    expect(line.length).toBe(36);
    expect(line[0]).toHaveProperty('lat');
    expect(line[0]).toHaveProperty('lon');
  });

  it('finds a subsolar point where the sun is near zenith', () => {
    const date = new Date('2024-06-21T12:00:00Z');
    const subsolar = getSubsolarPoint(date);
    expect(subsolar.lat).toBeLessThan(25);
    expect(subsolar.lat).toBeGreaterThan(20);
    expect(subsolar.lon).toBeGreaterThanOrEqual(-180);
    expect(subsolar.lon).toBeLessThan(180);
    const atZenith = getSunPosition(date, subsolar.lat, subsolar.lon);
    expect(atZenith.altitude).toBeGreaterThan((89 * Math.PI) / 180);
  });

  it('subsolar latitude follows solstices', () => {
    const june = getSubsolarPoint(new Date('2024-06-21T12:00:00Z'));
    expect(june.lat).toBeGreaterThan(15);
    expect(june.lat).toBeLessThan(27);

    const dec = getSubsolarPoint(new Date('2024-12-21T12:00:00Z'));
    expect(dec.lat).toBeLessThan(-15);
    expect(dec.lat).toBeGreaterThan(-27);
  });

  it('terminator sampling stays ordered and bounded', () => {
    const line = approximateTerminator(new Date('2024-03-20T12:00:00Z'), 90);
    expect(line.length).toBe(90);
    for (let i = 1; i < line.length; i += 1) {
      expect(line[i].lon).toBeGreaterThan(line[i - 1].lon);
    }
    for (const p of line) {
      expect(p.lat).toBeLessThanOrEqual(90);
      expect(p.lat).toBeGreaterThanOrEqual(-90);
      expect(p.lon).toBeGreaterThanOrEqual(-180);
      expect(p.lon).toBeLessThanOrEqual(180);
    }
  });

  it('terminator ring projects inside map bounds', () => {
    const subsolar = getSubsolarPoint(new Date('2024-06-21T12:00:00Z'));
    const ring = sampleTerminatorCircle(subsolar, 360);
    const projected = ring.map((p) => projectEquirectangular(p, 1800, 900));
    const minY = Math.min(...projected.map((p) => p.y));
    const maxY = Math.max(...projected.map((p) => p.y));
    expect(minY).toBeGreaterThanOrEqual(-1e-6);
    expect(maxY).toBeLessThanOrEqual(900 + 1e-6);
  });

  it('terminator ring can be shifted fully inside the map width', () => {
    const subsolar = getSubsolarPoint(new Date('2024-06-21T12:00:00Z'));
    const ring = sampleTerminatorCircle(subsolar, 360);
    const projected = ring.map((p) => projectEquirectangular(p, 1800, 900));

    const unwrapped: Array<{ x: number; y: number }> = [projected[0]];
    for (let i = 1; i < projected.length; i += 1) {
      const prev = unwrapped[i - 1];
      let x = projected[i].x;
      const dx = x - prev.x;
      if (dx > 900) x -= 1800;
      if (dx < -900) x += 1800;
      unwrapped.push({ x, y: projected[i].y });
    }

    const minX = Math.min(...unwrapped.map((p) => p.x));
    const maxX = Math.max(...unwrapped.map((p) => p.x));
    const span = Math.max(1, maxX - minX);
    let shift = (1800 - span) / 2 - minX;
    const shiftedMin = minX + shift;
    const shiftedMax = maxX + shift;
    if (shiftedMin < 0) shift -= shiftedMin;
    if (shiftedMax > 1800) shift -= shiftedMax - 1800;

    const shifted = unwrapped.map((p) => ({ x: p.x + shift, y: p.y }));
    const finalMin = Math.min(...shifted.map((p) => p.x));
    const finalMax = Math.max(...shifted.map((p) => p.x));
    expect(finalMin).toBeGreaterThanOrEqual(-1e-6);
    expect(finalMax).toBeLessThanOrEqual(1800 + 1e-6);
  });
});
