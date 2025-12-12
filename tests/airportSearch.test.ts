import { describe, expect, it } from 'vitest';

import { buildAirportSearchIndex, searchAirports, type AirportSearchRecord } from '../src/core/airportSearch';

const sampleAirports: AirportSearchRecord[] = [
  {
    id: 1,
    ident: 'LOWW',
    name: 'Vienna International Airport',
    city: 'Vienna',
    country: 'AT',
    iata: 'VIE',
    icao: 'LOWW'
  },
  {
    id: 2,
    ident: 'KCEW',
    name: 'Bob Sikes Airport',
    city: 'Crestview',
    country: 'US',
    iata: 'CEW',
    icao: 'KCEW'
  },
  {
    id: 3,
    ident: 'ZA-0094',
    name: 'Hazyview Airport',
    city: 'Hazyview',
    country: 'ZA',
    iata: 'HZV',
    icao: null
  },
  {
    id: 4,
    ident: 'GGOV',
    name: 'Osvaldo Vieira International Airport',
    city: 'Bissau',
    country: 'GW',
    iata: 'OXB',
    icao: 'GGOV'
  },
  {
    id: 5,
    ident: 'TLPL',
    name: 'Hewanorra International Airport',
    city: 'Vieux Fort',
    country: 'LC',
    iata: 'UVF',
    icao: 'TLPL'
  },
  {
    id: 6,
    ident: 'RPVS',
    name: 'Evelio Javier Airport',
    city: 'San Jose',
    country: 'PH',
    iata: 'EUQ',
    icao: 'RPVS'
  },
  {
    id: 7,
    ident: 'SVIE',
    name: 'Andrés Miguel Salazar Marcano Airport',
    city: 'Isla de Coche',
    country: 'VE',
    iata: 'ICC',
    icao: 'SVIE'
  },
  {
    id: 8,
    ident: 'SNED',
    name: 'Sócrates Rezende Airport',
    city: 'Canavieiras',
    country: 'BR',
    iata: 'CNV',
    icao: 'SNED'
  }
];

describe('airportSearch', () => {
  it('prioritizes exact IATA matches over substring city/name matches', () => {
    const index = buildAirportSearchIndex(sampleAirports);
    const results = searchAirports(index, 'vie', 10);
    expect(results[0]?.iata).toBe('VIE');
  });

  it('matches ICAO codes case-insensitively', () => {
    const index = buildAirportSearchIndex(sampleAirports);
    const results = searchAirports(index, 'loww', 10);
    expect(results[0]?.icao).toBe('LOWW');
  });

  it('handles diacritics in names', () => {
    const index = buildAirportSearchIndex(sampleAirports);
    const results = searchAirports(index, 'socrates', 10);
    expect(results[0]?.ident).toBe('SNED');
  });

  it('supports multi-token city queries', () => {
    const index = buildAirportSearchIndex(sampleAirports);
    const results = searchAirports(index, 'san jose', 10);
    expect(results[0]?.ident).toBe('RPVS');
  });

  it('finds matches by ICAO substring when relevant', () => {
    const index = buildAirportSearchIndex(sampleAirports);
    const results = searchAirports(index, 'svie', 10);
    expect(results[0]?.ident).toBe('SVIE');
  });
});

