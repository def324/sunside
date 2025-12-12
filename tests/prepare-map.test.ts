import { describe, expect, it } from 'vitest';

import { buildMapDataset } from '../scripts/prepare-map';

// Minimal synthetic TopoJSON with one country as a triangle near the equator.
const syntheticTopo = {
  type: 'Topology',
  objects: {
    countries: {
      type: 'GeometryCollection',
      geometries: [
        {
          type: 'Polygon',
          id: 'TST',
          properties: { name: 'Testland' },
          arcs: [[0]]
        }
      ]
    }
  },
  arcs: [
    [
      [0, 0],
      [10, 0],
      [0, 10],
      [0, 0]
    ]
  ],
  transform: {
    scale: [1, 1],
    translate: [0, 0]
  }
};

describe('prepare-map', () => {
  it('projects polygon coordinates into the configured width/height', () => {
    const dataset = buildMapDataset(syntheticTopo, 360, 180);
    expect(dataset.width).toBe(360);
    expect(dataset.height).toBe(180);
    expect(dataset.countries).toHaveLength(1);
    const country = dataset.countries[0];
    expect(country.id).toBe('TST');
    expect(country.name).toBe('Testland');
    const ring = country.paths[0];
    const [p1, p2, p3] = ring;
    // TopoJSON arcs are delta-encoded; this synthetic fixture decodes to points:
    // (0,0) -> (10,0) -> (10,10)
    expect(p1[0]).toBeCloseTo(((0 + 180) / 360) * 360, 5);
    expect(p2[0]).toBeCloseTo(((10 + 180) / 360) * 360, 5);
    expect(p3[0]).toBeCloseTo(((10 + 180) / 360) * 360, 5);
    expect(p1[1]).toBeCloseTo(((90 - 0) / 180) * 180, 5);
    expect(p2[1]).toBeCloseTo(((90 - 0) / 180) * 180, 5);
    expect(p3[1]).toBeCloseTo(((90 - 10) / 180) * 180, 5);
  });
});
