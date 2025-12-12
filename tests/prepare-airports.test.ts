import { describe, expect, it } from 'vitest';

import {
  buildAirportDataset,
  normalizeAirportRow,
  parseAirportCsv,
  type RawAirportRow
} from '../scripts/prepare-airports';

const sampleCsv = `id,ident,type,name,latitude_deg,longitude_deg,municipality,iso_country,iata_code,icao_code,scheduled_service
1,AAA,small_airport,Alpha,10,20,Alphaville,AA,AAA,AAAA,yes
2,BBB,heliport,Heli,11,21,Heli City,AA,BBB,BBBB,yes
3,CCC,small_airport,Charlie,12,22,Charlestown,AA,,CCCC,no
4,DDD,medium_airport,Delta,13,23,Delta City,BB,,DDDD,no
5,EEE,small_airport,EmptyTZ,,50.0,,EE,,,no
6,FFF,small_airport,Paris,48.8566,2.3522,Paris,FR,,FFFF,no
`;

describe('parseAirportCsv', () => {
  it('parses CSV rows with headers', () => {
    const rows = parseAirportCsv(sampleCsv);
    expect(rows).toHaveLength(6);
    expect(rows[0]).toMatchObject({
      ident: 'AAA',
      name: 'Alpha'
    });
  });
});

describe('normalizeAirportRow', () => {
  it('returns null when lat/lon are missing or invalid', () => {
    const rows = parseAirportCsv(sampleCsv);
    const invalidRow = rows.find((r) => r.ident === 'EEE') as RawAirportRow;
    expect(normalizeAirportRow(invalidRow)).toBeNull();
  });

  it('derives tz and strips empty optional fields', () => {
    const rows = parseAirportCsv(sampleCsv);
    const row = rows.find((r) => r.ident === 'AAA') as RawAirportRow;
    const normalized = normalizeAirportRow(row);
    expect(normalized).not.toBeNull();
    expect(normalized?.tz).toBeDefined();
    expect(normalized?.iata).toBe('AAA');
    expect(normalized?.city).toBe('Alphaville');
  });
});

describe('buildAirportDataset', () => {
  it('applies type and significance filters by default', () => {
    const rows = parseAirportCsv(sampleCsv);
    const dataset = buildAirportDataset(rows);
    // Expect: include AAA (small + scheduled yes), exclude heliport, exclude non-significant rows, exclude invalid coords.
    const idents = dataset.map((d) => d.ident);
    expect(idents).toEqual(['AAA']);
  });

  it('accepts allowlist for significance failures when type is allowed', () => {
    const rows = parseAirportCsv(sampleCsv);
    const dataset = buildAirportDataset(rows, ['DDD', 'FFF']);
    const idents = dataset.map((d) => d.ident);
    // AAA passes filters; DDD is allowlisted; FFF (Paris) is allowlisted even without significance because type is allowed.
    expect(idents).toEqual(['AAA', 'DDD', 'FFF']);
  });
});
