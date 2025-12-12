import { describe, expect, it } from 'vitest';

import { buildMapDataset, splitRingAtDateline } from '../scripts/prepare-map';

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

  it('splits projected rings that cross the antimeridian', () => {
    const width = 360;
    const height = 180;
    const ring = [
      [350, 90],
      [355, 80],
      [5, 80],
      [10, 90],
      [350, 90]
    ];
    const split = splitRingAtDateline(ring, width, height);
    expect(split.length).toBeGreaterThan(1);
    for (const r of split) {
      for (let i = 1; i < r.length; i += 1) {
        const dx = r[i][0] - r[i - 1][0];
        expect(Math.abs(dx)).toBeLessThanOrEqual(width / 2);
        expect(r[i][0]).toBeGreaterThanOrEqual(0);
        expect(r[i][0]).toBeLessThanOrEqual(width);
      }
    }
  });

  it('caps polar rings with an odd number of dateline jumps', () => {
    const width = 360;
    const height = 180;
    // A simple ring near the south pole that wraps once across the seam.
    const ring = [
      [0, 160],
      [120, 150],
      [240, 160],
      [350, 170],
      [0, 160]
    ];
    const split = splitRingAtDateline(ring, width, height);
    expect(split).toHaveLength(1);
    const capped = split[0];
    // Should introduce a cap at the nearest map edge (bottom in this case).
    expect(capped.some((p) => p[1] === height)).toBe(true);
    for (let i = 1; i < capped.length; i += 1) {
      const dx = capped[i][0] - capped[i - 1][0];
      expect(Math.abs(dx)).toBeLessThanOrEqual(width / 2);
      expect(capped[i][0]).toBeGreaterThanOrEqual(0);
      expect(capped[i][0]).toBeLessThanOrEqual(width);
    }
  });

  it('buildMapDataset splits dateline-crossing polygons into multiple rings', () => {
    const datelineTopo = {
      type: 'Topology',
      objects: {
        countries: {
          type: 'GeometryCollection',
          geometries: [
            {
              type: 'Polygon',
              id: 'DLN',
              properties: { name: 'Datelinia' },
              arcs: [[0]]
            }
          ]
        }
      },
      arcs: [
        [
          [179, 0],
          [-358, 0],
          [0, 10],
          [358, 0],
          [0, -10]
        ]
      ],
      transform: {
        scale: [1, 1],
        translate: [0, 0]
      }
    };

    const dataset = buildMapDataset(datelineTopo, 360, 180);
    expect(dataset.countries).toHaveLength(1);
    const rings = dataset.countries[0].paths;
    expect(rings.length).toBeGreaterThan(1);
    for (const ring of rings) {
      for (let i = 1; i < ring.length; i += 1) {
        const dx = ring[i][0] - ring[i - 1][0];
        expect(Math.abs(dx)).toBeLessThanOrEqual(180);
      }
    }
  });
});
