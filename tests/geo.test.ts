import { describe, it, expect } from 'vitest';
import { createGreatCirclePath, distanceMeters, interpolateOnGreatCircle, projectEquirectangular } from '../src/core/geo';

describe('geo core', () => {
  it('computes realistic great-circle distances', () => {
    const lax = { lat: 33.9416, lon: -118.4085 };
    const jfk = { lat: 40.6413, lon: -73.7781 };
    const d = distanceMeters(lax, jfk);
    expect(d / 1000).toBeGreaterThan(3900);
    expect(d / 1000).toBeLessThan(4100);
  });

  it('interpolates great-circle midpoints correctly on orthogonal legs', () => {
    const path = createGreatCirclePath({ lat: 0, lon: 0 }, { lat: 0, lon: 90 });
    const mid = interpolateOnGreatCircle(path, 0.5);
    expect(mid.lat).toBeCloseTo(0, 5);
    expect(mid.lon).toBeCloseTo(45, 5);
  });

  it('projects points using equirectangular projection', () => {
    const projected = projectEquirectangular({ lat: 0, lon: 0 }, 360, 180);
    expect(projected.x).toBeCloseTo(180, 5);
    expect(projected.y).toBeCloseTo(90, 5);
    const northPole = projectEquirectangular({ lat: 90, lon: 0 }, 360, 180);
    expect(northPole.y).toBeCloseTo(0, 5);
  });

  it('clamps projection to map bounds', () => {
    const p1 = projectEquirectangular({ lat: 95, lon: 200 }, 360, 180);
    expect(p1.x).toBeCloseTo(360, 5);
    expect(p1.y).toBeCloseTo(0, 5);
    const p2 = projectEquirectangular({ lat: -95, lon: -200 }, 360, 180);
    expect(p2.x).toBeCloseTo(0, 5);
    expect(p2.y).toBeCloseTo(180, 5);
  });
});
