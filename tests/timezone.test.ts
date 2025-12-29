import { describe, expect, it } from 'vitest';
import { computeTimeZonesForSamples, localTimeZoneInfoAtLocation, timeZoneFromLatLon } from '../src/core/timezone';

describe('timezone core', () => {
  describe('timeZoneFromLatLon', () => {
    it('returns the expected IANA zones for known coordinates', () => {
      expect(timeZoneFromLatLon(27.7172, 85.324)).toBe('Asia/Kathmandu');
      expect(timeZoneFromLatLon(-31.68, 128.88)).toBe('Australia/Eucla');
      expect(timeZoneFromLatLon(-34.9285, 138.6007)).toBe('Australia/Adelaide');
      expect(timeZoneFromLatLon(40.7128, -74.006)).toBe('America/New_York');
      expect(timeZoneFromLatLon(51.5074, -0.1278)).toBe('Europe/London');
    });

    it('normalizes longitudes outside [-180, 180]', () => {
      // 359.8722° wraps to -0.1278°
      expect(timeZoneFromLatLon(51.5074, 359.8722)).toBe('Europe/London');
    });

    it('returns null for non-finite inputs', () => {
      expect(timeZoneFromLatLon(Number.NaN, 0)).toBeNull();
      expect(timeZoneFromLatLon(0, Number.NaN)).toBeNull();
      expect(timeZoneFromLatLon(Number.POSITIVE_INFINITY, 0)).toBeNull();
      expect(timeZoneFromLatLon(0, Number.NEGATIVE_INFINITY)).toBeNull();
    });
  });

  describe('localTimeZoneInfoAtLocation', () => {
    it('computes offsets that are not whole hours', () => {
      const utcMillis = Date.UTC(2024, 0, 1, 0, 0, 0);
      expect(localTimeZoneInfoAtLocation(utcMillis, 27.7172, 85.324)?.offsetMinutes).toBe(345); // Nepal: UTC+5:45
      expect(localTimeZoneInfoAtLocation(utcMillis, -31.68, 128.88)?.offsetMinutes).toBe(525); // Eucla: UTC+8:45
    });

    it('reflects DST changes where applicable', () => {
      const nyLat = 40.7128;
      const nyLon = -74.006;
      const winterUtc = Date.UTC(2024, 0, 15, 12, 0, 0);
      const summerUtc = Date.UTC(2024, 6, 15, 12, 0, 0);

      expect(localTimeZoneInfoAtLocation(winterUtc, nyLat, nyLon)?.offsetMinutes).toBe(-300);
      expect(localTimeZoneInfoAtLocation(summerUtc, nyLat, nyLon)?.offsetMinutes).toBe(-240);
    });
  });

  describe('computeTimeZonesForSamples', () => {
    it('returns a zone per sample and supports endpoint overrides', () => {
      const samples = [
        { location: { lat: 40.7128, lon: -74.006 } }, // NYC
        { location: { lat: 51.5074, lon: -0.1278 } }, // London
        { location: { lat: -34.9285, lon: 138.6007 } } // Adelaide
      ];

      const zones = computeTimeZonesForSamples(samples, {
        departureTimeZone: 'Europe/London',
        arrivalTimeZone: 'Asia/Kathmandu'
      });

      expect(zones).toHaveLength(samples.length);
      expect(zones[0]).toBe('Europe/London');
      expect(zones[1]).toBe('Europe/London');
      expect(zones[2]).toBe('Asia/Kathmandu');
    });

    it('uses fallback zones when a lookup fails', () => {
      const zones = computeTimeZonesForSamples(
        [{ location: { lat: 0, lon: 0 } }, { location: { lat: Number.NaN, lon: 0 } }],
        { fallbackTimeZone: 'utc' }
      );

      expect(zones).toEqual([timeZoneFromLatLon(0, 0) ?? 'utc', 'utc']);
    });
  });
});

