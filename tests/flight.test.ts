import { describe, it, expect } from 'vitest';
import { createFlightPlan, sampleFlight } from '../src/core/flight';
import { toZonedDateTime } from '../src/core/time';

describe('flight core', () => {
  const departureAirport = {
    id: 1,
    name: 'Test Departure',
    city: 'City A',
    country: 'AA',
    location: { lat: 0, lon: 0 },
    timeZone: 'Etc/UTC'
  };

  const arrivalAirport = {
    id: 2,
    name: 'Test Arrival',
    city: 'City B',
    country: 'BB',
    location: { lat: 0, lon: 90 },
    timeZone: 'Etc/UTC'
  };

  it('builds a validated flight plan with duration and path', () => {
    const departureTime = toZonedDateTime({ year: 2024, month: 6, day: 1, hour: 12, minute: 0 }, 'Etc/UTC');
    const arrivalTime = toZonedDateTime({ year: 2024, month: 6, day: 1, hour: 15, minute: 0 }, 'Etc/UTC');
    const plan = createFlightPlan(departureAirport, arrivalAirport, departureTime, arrivalTime);

    expect(plan.durationMinutes).toBe(180);
    expect(plan.path.distanceMeters).toBeGreaterThan(0);
  });

  it('samples flight positions and sun-side classification', () => {
    const departureTime = toZonedDateTime({ year: 2024, month: 6, day: 1, hour: 12, minute: 0 }, 'Etc/UTC');
    const arrivalTime = toZonedDateTime({ year: 2024, month: 6, day: 1, hour: 15, minute: 0 }, 'Etc/UTC');
    const plan = createFlightPlan(departureAirport, arrivalAirport, departureTime, arrivalTime);
    const samples = sampleFlight(plan, 5, { width: 360, height: 180 });

    expect(samples.length).toBe(5);
    expect(samples[0].location.lon).toBeCloseTo(0, 5);
    expect(samples.at(-1)?.location.lon ?? 0).toBeCloseTo(90, 5);
    expect(samples[0].sun.side).toBeDefined();
    expect(samples[0].projected).toBeDefined();
  });
});
