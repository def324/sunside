export type AirportsData = typeof import('../data/airports.json').default;

export type AirportRecord = AirportsData[number];

export type DistanceUnit = 'km' | 'mi' | 'nmi';

export type PlaybackSpeed = 1 | 2 | 4;

export type TimelineInfo = {
  routeLabel: string;
  utcDate: string;
  utcTime: string;
  localTime: string;
  localOffset: string;
  elapsed: string;
  remaining: string;
  status: 'day' | 'twilight' | 'night';
  statusLabel: string;
  directionLabel: string | null;
};

