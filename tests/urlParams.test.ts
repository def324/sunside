import { describe, it, expect } from 'vitest';
import {
  buildShareUrl,
  findAirportFromParam,
  parseAutoplayParams,
  parseLocalDateTimeParam,
  parseShareFlightParams
} from '../src/ui/urlParams';
import type { AirportRecord } from '../src/ui/types';

const airports = [
  { id: 1, iata: 'LAX', icao: 'KLAX', ident: 'KLAX' },
  { id: 2, iata: 'VIE', icao: 'LOWW', ident: 'LOWW' }
] as unknown as AirportRecord[];

describe('urlParams', () => {
  describe('findAirportFromParam', () => {
    it('resolves by numeric id', () => {
      expect(findAirportFromParam(airports, '2')?.iata).toBe('VIE');
    });

    it('resolves by IATA/ICAO/ident (case-insensitive)', () => {
      expect(findAirportFromParam(airports, 'lax')?.id).toBe(1);
      expect(findAirportFromParam(airports, 'klax')?.id).toBe(1);
      expect(findAirportFromParam(airports, 'loWW')?.id).toBe(2);
    });

    it('returns null for unknown values', () => {
      expect(findAirportFromParam(airports, 'XXX')).toBeNull();
    });
  });

  describe('parseLocalDateTimeParam', () => {
    it('parses a strict local date/time format', () => {
      expect(parseLocalDateTimeParam('2025-12-13T11:00')).toEqual({ date: '2025-12-13', time: '11:00' });
    });

    it('rejects invalid formats or dates', () => {
      expect(parseLocalDateTimeParam('2025-12-13 11:00')).toBeNull();
      expect(parseLocalDateTimeParam('2025-02-30T11:00')).toBeNull();
    });
  });

  describe('parseAutoplayParams', () => {
    it('defaults to disabled with no params', () => {
      const { enabled, speed, delayMs } = parseAutoplayParams(new URLSearchParams());
      expect(enabled).toBe(false);
      expect(speed).toBeNull();
      expect(delayMs).toBe(0);
    });

    it('parses enabled + speed + delay', () => {
      const params = new URLSearchParams({ autoplay: 'true', autoplaySpeed: '4', autoplayDelayMs: '123' });
      const { enabled, speed, delayMs } = parseAutoplayParams(params);
      expect(enabled).toBe(true);
      expect(speed).toBe(4);
      expect(delayMs).toBe(123);
    });

    it('clamps delay and ignores unsupported speeds', () => {
      const params = new URLSearchParams({ autoplay: 'true', autoplaySpeed: '9', autoplayDelayMs: '20000' });
      const { speed, delayMs } = parseAutoplayParams(params);
      expect(speed).toBeNull();
      expect(delayMs).toBe(10_000);
    });
  });

  describe('parseShareFlightParams', () => {
    it('returns null when required params are missing', () => {
      expect(parseShareFlightParams(airports, new URLSearchParams({ from: 'LAX' }))).toBeNull();
    });

    it('parses from/to and local times when valid', () => {
      const params = new URLSearchParams({
        from: 'LAX',
        to: 'vie',
        depart: '2025-12-13T11:00',
        arrive: '2025-12-13T19:00'
      });
      const parsed = parseShareFlightParams(airports, params);
      expect(parsed?.departure.id).toBe(1);
      expect(parsed?.arrival.id).toBe(2);
      expect(parsed?.departureDate).toBe('2025-12-13');
      expect(parsed?.departureTime).toBe('11:00');
      expect(parsed?.arrivalTime).toBe('19:00');
    });

    it('returns null if airports are unknown', () => {
      const params = new URLSearchParams({
        from: 'XXX',
        to: 'VIE',
        depart: '2025-12-13T11:00',
        arrive: '2025-12-13T19:00'
      });
      expect(parseShareFlightParams(airports, params)).toBeNull();
    });
  });

  describe('buildShareUrl', () => {
    it('builds a stable URL without autoplay by default', () => {
      const url = new URL(
        buildShareUrl('https://example.com/sunside/', {
          from: 'AMS',
          to: 'GRU',
          depart: '2025-12-13T11:00',
          arrive: '2025-12-13T19:00'
        })
      );
      expect(url.searchParams.get('from')).toBe('AMS');
      expect(url.searchParams.get('to')).toBe('GRU');
      expect(url.searchParams.get('depart')).toBe('2025-12-13T11:00');
      expect(url.searchParams.get('arrive')).toBe('2025-12-13T19:00');
      expect(url.searchParams.has('autoplay')).toBe(false);
      expect(url.searchParams.has('autoplaySpeed')).toBe(false);
    });

    it('adds autoplay parameters when enabled', () => {
      const url = new URL(
        buildShareUrl('https://example.com/sunside/', {
          from: 'AMS',
          to: 'GRU',
          depart: '2025-12-13T11:00',
          arrive: '2025-12-13T19:00',
          autoplay: true,
          autoplaySpeed: 2
        })
      );
      expect(url.searchParams.get('autoplay')).toBe('true');
      expect(url.searchParams.get('autoplaySpeed')).toBe('2');
    });
  });
});

