import { describe, expect, it } from 'vitest';
import { createFlightPlan, sampleFlightAt, type Airport } from '../src/core/flight';
import { fromUtcMillis } from '../src/core/time';
import {
  allocateByLargestRemainder,
  allocatePercentagesWithMinimum,
  computeFlightSunSummary,
  type FlightSunSummary,
  type SunSummaryBucket
} from '../src/core/sunSummary';

function makeAirport(id: number, lat: number, lon: number): Airport {
  return {
    id,
    name: `Airport ${id}`,
    city: 'Test',
    country: 'TT',
    location: { lat, lon },
    timeZone: 'Etc/UTC'
  };
}

const BUCKETS: SunSummaryBucket[] = ['left', 'right', 'ahead', 'behind', 'night'];
const DAYLIGHT: Array<'day' | 'twilight' | 'night'> = ['day', 'twilight', 'night'];

function sumBucketMillis(summary: FlightSunSummary): number {
  return BUCKETS.reduce((acc, k) => acc + summary.buckets[k].millis, 0);
}

function sumDaylightMillis(summary: FlightSunSummary): number {
  return DAYLIGHT.reduce((acc, k) => acc + summary.daylight.buckets[k].millis, 0);
}

function summaryMillisByBucket(summary: FlightSunSummary): Record<SunSummaryBucket, number> {
  return BUCKETS.reduce(
    (acc, k) => {
      acc[k] = summary.buckets[k].millis;
      return acc;
    },
    {} as Record<SunSummaryBucket, number>
  );
}

function toPercent(bucketMillis: Record<SunSummaryBucket, number>, totalMillis: number): Record<SunSummaryBucket, number> {
  return BUCKETS.reduce(
    (acc, k) => {
      acc[k] = totalMillis > 0 ? (bucketMillis[k] / totalMillis) * 100 : 0;
      return acc;
    },
    {} as Record<SunSummaryBucket, number>
  );
}

function computeReferenceBucketMillis(plan: ReturnType<typeof createFlightPlan>, stepSeconds: number) {
  const totalMillis = plan.arrivalUtc - plan.departureUtc;
  const stepMs = Math.max(1, Math.floor(stepSeconds * 1000));
  const out: Record<SunSummaryBucket, number> = { left: 0, right: 0, ahead: 0, behind: 0, night: 0 };

  const steps = Math.max(1, Math.ceil(totalMillis / stepMs));
  for (let i = 0; i < steps; i += 1) {
    const start = plan.departureUtc + i * stepMs;
    const end = Math.min(plan.arrivalUtc, start + stepMs);
    const span = end - start;
    if (span <= 0) continue;
    const midUtcMillis = start + span / 2;
    const t = (midUtcMillis - plan.departureUtc) / totalMillis;
    const sample = sampleFlightAt(plan, t);
    const bucket = sample.sun.status === 'night' ? 'night' : (sample.sun.side as Exclude<SunSummaryBucket, 'night'>);
    out[bucket] += span;
  }

  return out;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

describe('sun summary core', () => {
  it('allocates integers with stable largest-remainder rounding', () => {
    expect(allocateByLargestRemainder([1.2, 1.2, 1.2], 4)).toEqual([2, 1, 1]);
    expect(allocateByLargestRemainder([0.1, 0.9], 1)).toEqual([0, 1]);
    expect(allocateByLargestRemainder([-1, Number.NaN, 2.4], 3)).toEqual([0, 0, 3]);
    expect(allocateByLargestRemainder([1.1, 1.1], 1)).toEqual([0, 1]);
    expect(allocateByLargestRemainder([0, 2.1], 1)).toEqual([0, 1]);
  });

  it('ensures non-zero percent for non-zero buckets (minimum 1%)', () => {
    expect(allocatePercentagesWithMinimum([0.4, 99.6], 100, 1)).toEqual([1, 99]);
    expect(allocatePercentagesWithMinimum([0.4, 0.4, 99.2], 100, 1)).toEqual([1, 1, 98]);
    expect(allocatePercentagesWithMinimum([0.2, 0.2, 0.2, 0.2, 99.2], 100, 1)).toEqual([1, 1, 1, 1, 96]);
    expect(allocatePercentagesWithMinimum([0, 0, 100], 100, 1)).toEqual([0, 0, 100]);
    expect(allocatePercentagesWithMinimum([-1, Number.NaN, 0.49, 99.51], 100, 1)).toEqual([0, 0, 1, 99]);
  });

  it('produces integer % that sum to 100 and minutes that sum to plan duration', () => {
    const dep = makeAirport(1, 0, 0);
    const arr = makeAirport(2, 0, 90);
    const departureTime = fromUtcMillis(Date.UTC(2024, 5, 21, 12, 0), 'Etc/UTC');
    const arrivalTime = fromUtcMillis(Date.UTC(2024, 5, 21, 15, 0), 'Etc/UTC');
    const plan = createFlightPlan(dep, arr, departureTime, arrivalTime);
    const summary = computeFlightSunSummary(plan);

    const percentSum = BUCKETS.reduce((acc, k) => acc + summary.buckets[k].percent, 0);
    const minuteSum = BUCKETS.reduce((acc, k) => acc + summary.buckets[k].minutes, 0);
    const daylightPercentSum = DAYLIGHT.reduce((acc, k) => acc + summary.daylight.buckets[k].percent, 0);
    const daylightMinuteSum = DAYLIGHT.reduce((acc, k) => acc + summary.daylight.buckets[k].minutes, 0);

    expect(percentSum).toBe(100);
    expect(minuteSum).toBe(plan.durationMinutes);
    expect(sumBucketMillis(summary)).toBe(plan.arrivalUtc - plan.departureUtc);
    expect(daylightPercentSum).toBe(100);
    expect(daylightMinuteSum).toBe(plan.durationMinutes);
    expect(sumDaylightMillis(summary)).toBe(plan.arrivalUtc - plan.departureUtc);
  });

  it('stays close to a higher-resolution reference across representative routes', () => {
    const cases: Array<{
      name: string;
      from: { lat: number; lon: number };
      to: { lat: number; lon: number };
      departUtc: number;
      durationMinutes: number;
    }> = [
      {
        name: 'equator eastbound (solstice noon)',
        from: { lat: 0, lon: 0 },
        to: { lat: 0, lon: 120 },
        departUtc: Date.UTC(2024, 5, 21, 12, 0),
        durationMinutes: 480
      },
      {
        name: 'dateline crossing',
        from: { lat: 10, lon: 170 },
        to: { lat: 10, lon: -170 },
        departUtc: Date.UTC(2024, 2, 20, 8, 0),
        durationMinutes: 360
      },
      {
        name: 'high latitude (summer)',
        from: { lat: 60, lon: -100 },
        to: { lat: 60, lon: 100 },
        departUtc: Date.UTC(2024, 5, 21, 18, 0),
        durationMinutes: 600
      },
      {
        name: 'high latitude (winter)',
        from: { lat: 60, lon: -100 },
        to: { lat: 60, lon: 100 },
        departUtc: Date.UTC(2024, 11, 21, 18, 0),
        durationMinutes: 600
      },
      {
        name: 'near polar',
        from: { lat: 80, lon: 0 },
        to: { lat: 80, lon: 90 },
        departUtc: Date.UTC(2024, 5, 21, 12, 0),
        durationMinutes: 240
      }
    ];

    const referenceStepSeconds = 10;
    const maxBucketAbsPercentDiff = 5;

    for (const c of cases) {
      const dep = makeAirport(1, c.from.lat, c.from.lon);
      const arr = makeAirport(2, c.to.lat, c.to.lon);
      const departureTime = fromUtcMillis(c.departUtc, 'Etc/UTC');
      const arrivalTime = fromUtcMillis(c.departUtc + c.durationMinutes * 60_000, 'Etc/UTC');
      const plan = createFlightPlan(dep, arr, departureTime, arrivalTime);

      const summary = computeFlightSunSummary(plan, { intervalTargetMinutes: 2, minIntervals: 180, maxIntervals: 5000 });
      const referenceMillis = computeReferenceBucketMillis(plan, referenceStepSeconds);
      const summaryMillis = summaryMillisByBucket(summary);

      const refPct = toPercent(referenceMillis, plan.arrivalUtc - plan.departureUtc);
      const sumPct = toPercent(summaryMillis, plan.arrivalUtc - plan.departureUtc);

      for (const k of BUCKETS) {
        const diff = Math.abs(sumPct[k] - refPct[k]);
        expect(diff, `${c.name} bucket ${k} diff ${diff.toFixed(2)}pp`).toBeLessThanOrEqual(maxBucketAbsPercentDiff);
      }
    }
  });

  it('is stable across a seeded random suite', () => {
    const rand = mulberry32(0x5a11d00d);
    const referenceStepSeconds = 10;
    const maxBucketAbsPercentDiff = 5;

    for (let i = 0; i < 25; i += 1) {
      const from = { lat: (rand() * 170 - 85) * 0.98, lon: rand() * 360 - 180 };
      const to = { lat: (rand() * 170 - 85) * 0.98, lon: rand() * 360 - 180 };

      const month = Math.floor(rand() * 12);
      const day = Math.floor(rand() * 28) + 1;
      const hour = Math.floor(rand() * 24);
      const minute = Math.floor(rand() * 60);
      const departUtc = Date.UTC(2024, month, day, hour, minute);

      const durationMinutes = Math.floor(rand() * 1000) + 30; // 0.5h..~17h

      const dep = makeAirport(1, from.lat, from.lon);
      const arr = makeAirport(2, to.lat, to.lon);
      const departureTime = fromUtcMillis(departUtc, 'Etc/UTC');
      const arrivalTime = fromUtcMillis(departUtc + durationMinutes * 60_000, 'Etc/UTC');
      const plan = createFlightPlan(dep, arr, departureTime, arrivalTime);

      const summary = computeFlightSunSummary(plan, { intervalTargetMinutes: 2, minIntervals: 180, maxIntervals: 5000 });
      const referenceMillis = computeReferenceBucketMillis(plan, referenceStepSeconds);
      const summaryMillis = summaryMillisByBucket(summary);

      const refPct = toPercent(referenceMillis, plan.arrivalUtc - plan.departureUtc);
      const sumPct = toPercent(summaryMillis, plan.arrivalUtc - plan.departureUtc);

      for (const k of BUCKETS) {
        const diff = Math.abs(sumPct[k] - refPct[k]);
        expect(diff, `random #${i} bucket ${k} diff ${diff.toFixed(2)}pp`).toBeLessThanOrEqual(maxBucketAbsPercentDiff);
      }

      const percentSum = BUCKETS.reduce((acc, k) => acc + summary.buckets[k].percent, 0);
      const minuteSum = BUCKETS.reduce((acc, k) => acc + summary.buckets[k].minutes, 0);
      expect(percentSum).toBe(100);
      expect(minuteSum).toBe(plan.durationMinutes);
    }
  });
});
