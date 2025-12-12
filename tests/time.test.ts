import { describe, it, expect } from 'vitest';
import { describe, it, expect } from 'vitest';
import { durationMinutes, fromUtcMillis, toZonedDateTime } from '../src/core/time';

describe('time core', () => {
  it('converts local time to UTC millis with correct offset', () => {
    const berlin = toZonedDateTime({ year: 2024, month: 6, day: 1, hour: 12, minute: 0 }, 'Europe/Berlin');
    const utc = new Date(berlin.millis).toISOString();
    expect(utc.startsWith('2024-06-01T10:00')).toBe(true); // Berlin summer time is UTC+2
  });

  it('handles different offsets and duration computation', () => {
    const lax = toZonedDateTime({ year: 2024, month: 1, day: 15, hour: 15, minute: 0 }, 'America/Los_Angeles');
    const jfk = toZonedDateTime({ year: 2024, month: 1, day: 15, hour: 23, minute: 30 }, 'America/New_York');
    const duration = durationMinutes(lax.millis, jfk.millis);
    expect(duration).toBe(330); // 5.5 hours difference considering offsets
  });

  it('round-trips UTC millis to local zone', () => {
    const berlin = toZonedDateTime({ year: 2024, month: 12, day: 1, hour: 9, minute: 15 }, 'Europe/Berlin');
    const back = fromUtcMillis(berlin.millis, 'Europe/Berlin');
    expect(back.iso).toContain('09:15');
    expect(back.zone).toBe('Europe/Berlin');
  });

  it('handles DST gaps by shifting forward to the next valid instant', () => {
    const shifted = toZonedDateTime(
      { year: 2024, month: 3, day: 10, hour: 2, minute: 30 },
      'America/Los_Angeles'
    );
    // During the spring-forward gap, 02:30 becomes 03:30 PDT.
    expect(shifted.iso).toContain('T03:30');
  });
});
