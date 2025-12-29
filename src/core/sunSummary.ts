import { sampleFlightAt, type FlightPlan } from './flight';
import type { DaylightStatus } from './sun';

export type SunSummaryBucket = 'left' | 'right' | 'ahead' | 'behind' | 'night';

export type SunSummaryUnit = 'percent' | 'time';

export type FlightSunSummaryBucket = {
  millis: number;
  fraction: number; // 0..1
  percent: number; // integer, sums to 100 across buckets
  minutes: number; // integer, sums to totalMinutes across buckets
};

export type FlightDaylightSummary = {
  buckets: Record<DaylightStatus, FlightSunSummaryBucket>;
};

export type FlightSunSummary = {
  totalMillis: number;
  totalMinutes: number;
  buckets: Record<SunSummaryBucket, FlightSunSummaryBucket>;
  daylight: FlightDaylightSummary;
};

export type FlightSunSummaryOptions = {
  intervalTargetMinutes?: number;
  minIntervals?: number;
  maxIntervals?: number;
};

const BUCKET_ORDER: SunSummaryBucket[] = ['left', 'right', 'ahead', 'behind', 'night'];
const DAYLIGHT_ORDER: DaylightStatus[] = ['day', 'twilight', 'night'];

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

/**
 * Allocate an integer total across entries, minimizing rounding error by distributing remainders.
 * - Deterministic tie-break: lower index wins.
 */
export function allocateByLargestRemainder(exactValues: number[], total: number): number[] {
  const target = clampInt(total, 0, Number.MAX_SAFE_INTEGER);
  if (target === 0) return exactValues.map(() => 0);

  const safe = exactValues.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const base = safe.map((v) => Math.floor(v));
  const initialDiff = target - sum(base);

  const indexed = safe.map((v, i) => ({ i, frac: v - base[i] }));

  if (initialDiff > 0) {
    indexed.sort((a, b) => b.frac - a.frac || a.i - b.i);
    for (let k = 0; k < initialDiff; k += 1) {
      base[indexed[k % indexed.length].i] += 1;
    }
  } else if (initialDiff < 0) {
    indexed.sort((a, b) => a.frac - b.frac || a.i - b.i);
    let remaining = -initialDiff;
    while (remaining > 0) {
      let changed = false;
      for (const entry of indexed) {
        if (remaining === 0) break;
        if (base[entry.i] <= 0) continue;
        base[entry.i] -= 1;
        remaining -= 1;
        changed = true;
      }
      if (!changed) break;
    }
  }

  // Final correction (should be rare in practice).
  let diff = target - sum(base);
  if (diff > 0 && base.length) {
    base[0] += diff;
  } else if (diff < 0 && base.length) {
    let remaining = -diff;
    for (let i = 0; i < base.length && remaining > 0; i += 1) {
      const take = Math.min(base[i], remaining);
      base[i] -= take;
      remaining -= take;
    }
  }

  return base;
}

export function allocatePercentagesWithMinimum(exactPercentages: number[], total = 100, minNonZero = 1): number[] {
  const target = clampInt(total, 0, 100);
  const minValue = clampInt(minNonZero, 0, target);
  const safeExact = exactPercentages.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const rounded = allocateByLargestRemainder(safeExact, target);

  if (target === 0 || minValue === 0 || rounded.length === 0) return rounded;

  const positive = safeExact.map((v) => v > 0);
  const positiveCount = positive.reduce((acc, v) => acc + (v ? 1 : 0), 0);
  if (positiveCount === 0) return rounded;
  if (positiveCount * minValue > target) return rounded;

  const out = [...rounded];

  const needIndices: number[] = [];
  let required = 0;
  for (let i = 0; i < out.length; i += 1) {
    if (!positive[i]) continue;
    if (out[i] >= minValue) continue;
    needIndices.push(i);
    required += minValue - out[i];
    out[i] = minValue;
  }

  if (required === 0) return out;

  const needSet = new Set(needIndices);
  const donors = out
    .map((value, i) => ({ i, value }))
    .filter(({ i, value }) => positive[i] && !needSet.has(i) && value > minValue)
    .sort((a, b) => b.value - a.value || a.i - b.i);

  const available = donors.reduce((acc, { i }) => acc + Math.max(0, out[i] - minValue), 0);
  if (available < required) return rounded;

  let remaining = required;
  for (const { i } of donors) {
    if (remaining === 0) break;
    const canGive = out[i] - minValue;
    if (canGive <= 0) continue;
    const take = Math.min(canGive, remaining);
    out[i] -= take;
    remaining -= take;
  }

  const diff = target - sum(out);
  if (diff !== 0) {
    const adjustIdx = donors[0]?.i ?? positive.findIndex((v) => v);
    if (adjustIdx >= 0) out[adjustIdx] += diff;
  }

  return out;
}

export function computeFlightSunSummary(plan: FlightPlan, options: FlightSunSummaryOptions = {}): FlightSunSummary {
  const totalMillisRaw = plan.arrivalUtc - plan.departureUtc;
  const totalMillis = Math.max(0, Math.round(totalMillisRaw));
  const totalMinutes = Math.max(0, Math.round(plan.durationMinutes));

  const bucketMillis: Record<SunSummaryBucket, number> = {
    left: 0,
    right: 0,
    ahead: 0,
    behind: 0,
    night: 0
  };

  if (totalMillis <= 0) {
    const daylightBuckets = DAYLIGHT_ORDER.reduce(
      (acc, key) => {
        acc[key] = { millis: 0, fraction: 0, percent: 0, minutes: 0 };
        return acc;
      },
      {} as Record<DaylightStatus, FlightSunSummaryBucket>
    );

    return {
      totalMillis,
      totalMinutes,
      buckets: BUCKET_ORDER.reduce(
        (acc, key) => {
          acc[key] = { millis: 0, fraction: 0, percent: 0, minutes: 0 };
          return acc;
        },
        {} as Record<SunSummaryBucket, FlightSunSummaryBucket>
      ),
      daylight: { buckets: daylightBuckets }
    };
  }

  const statusMillis: Record<DaylightStatus, number> = {
    day: 0,
    twilight: 0,
    night: 0
  };

  const intervalTargetMinutes =
    options.intervalTargetMinutes && options.intervalTargetMinutes > 0 ? options.intervalTargetMinutes : 2;
  const minIntervals = options.minIntervals && options.minIntervals > 0 ? Math.floor(options.minIntervals) : 180;
  const maxIntervals = options.maxIntervals && options.maxIntervals > 0 ? Math.floor(options.maxIntervals) : 5000;

  const totalMinutesExact = totalMillis / 60000;
  const targetIntervals = Math.max(1, Math.ceil(totalMinutesExact / intervalTargetMinutes));
  let intervals = clampInt(Math.max(minIntervals, targetIntervals), 1, maxIntervals);
  intervals = Math.min(intervals, Math.max(1, totalMillis));

  for (let i = 0; i < intervals; i += 1) {
    const start = plan.departureUtc + Math.floor((i * totalMillis) / intervals);
    const end = plan.departureUtc + Math.floor(((i + 1) * totalMillis) / intervals);
    const span = end - start;
    if (span <= 0) continue;

    const midUtcMillis = start + span / 2;
    const t = (midUtcMillis - plan.departureUtc) / totalMillis;
    const sample = sampleFlightAt(plan, t);
    statusMillis[sample.sun.status] += span;
    const bucket = sample.sun.status === 'night' ? 'night' : (sample.sun.side as Exclude<SunSummaryBucket, 'night'>);
    bucketMillis[bucket] += span;
  }

  const percentExact = BUCKET_ORDER.map((k) => (bucketMillis[k] / totalMillis) * 100);
  const percentRounded = allocatePercentagesWithMinimum(percentExact, 100, 1);

  const minutesExact = BUCKET_ORDER.map((k) => bucketMillis[k] / 60000);
  const minutesRounded = allocateByLargestRemainder(minutesExact, totalMinutes);

  const daylightPercentExact = DAYLIGHT_ORDER.map((k) => (statusMillis[k] / totalMillis) * 100);
  const daylightPercentRounded = allocatePercentagesWithMinimum(daylightPercentExact, 100, 1);
  const daylightMinutesExact = DAYLIGHT_ORDER.map((k) => statusMillis[k] / 60000);
  const daylightMinutesRounded = allocateByLargestRemainder(daylightMinutesExact, totalMinutes);

  const buckets = BUCKET_ORDER.reduce(
    (acc, key, idx) => {
      const millis = bucketMillis[key];
      acc[key] = {
        millis,
        fraction: millis / totalMillis,
        percent: percentRounded[idx],
        minutes: minutesRounded[idx]
      };
      return acc;
    },
    {} as Record<SunSummaryBucket, FlightSunSummaryBucket>
  );

  const daylightBuckets = DAYLIGHT_ORDER.reduce(
    (acc, key, idx) => {
      const millis = statusMillis[key];
      acc[key] = {
        millis,
        fraction: millis / totalMillis,
        percent: daylightPercentRounded[idx],
        minutes: daylightMinutesRounded[idx]
      };
      return acc;
    },
    {} as Record<DaylightStatus, FlightSunSummaryBucket>
  );

  return { totalMillis, totalMinutes, buckets, daylight: { buckets: daylightBuckets } };
}
