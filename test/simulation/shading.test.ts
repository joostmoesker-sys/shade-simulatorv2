import { describe, expect, it } from 'vitest';

import {
  buildShadowFeatureCollection,
  estimateArrayShadeFactors,
  type ShadePreviewFeatureCollection,
} from '../../src/simulation/shading';
import type { PanelType, PVArray, SceneObject } from '../../src/model/schema';

const panelType: PanelType = {
  id: 'panel',
  manufacturer: 'Test',
  model: '400',
  pmaxW: 400,
  vmpV: 34,
  impA: 11.8,
  vocV: 41,
  iscA: 12.6,
  tempCoeffPmaxPctPerC: -0.35,
  tempCoeffVocPctPerC: -0.28,
  cells: 108,
  bypassDiodes: 3,
  widthM: 1,
  heightM: 1.7,
};

describe('shading preview', () => {
  it('projects tree and building shadows when the sun is above the horizon', () => {
    const objects: SceneObject[] = [
      {
        id: 'tree',
        kind: 'tree',
        name: 'Boom',
        position: { lat: 52, lon: 5 },
        heightM: 8,
        crownRadiusM: 3,
        trunkHeightM: 2,
        density: 0.7,
        undergrowth: 'grass',
        deciduous: true,
      },
      {
        id: 'building',
        kind: 'building',
        name: 'Huis',
        position: { lat: 52.0001, lon: 5 },
        footprint: [
          [4.99995, 52.00005],
          [5.00005, 52.00005],
          [5.00005, 52.00015],
          [4.99995, 52.00015],
        ],
        heightM: 6,
      },
    ];

    const shadows = buildShadowFeatureCollection(objects, { azimuthDeg: 180, elevationDeg: 30, zenithDeg: 60 }, { timestamp: '2026-06-21T12:00:00Z' });

    expect(shadows.features).toHaveLength(3);
    expect(shadows.features[0].geometry.coordinates[0].length).toBeGreaterThan(4);
    expect(shadows.features.map((feature) => feature.properties.part)).toEqual(['crown', 'undergrowth', 'building']);
    for (const feature of shadows.features) {
      const ring = feature.geometry.coordinates[0];
      expect(ring[0]).toEqual(ring[ring.length - 1]);
    }
  });

  it('uses prototype-style seasonal foliage and skips undergrowth when disabled', () => {
    const tree: SceneObject = {
      id: 'tree',
      kind: 'tree',
      name: 'Boom',
      position: { lat: 52, lon: 5 },
      heightM: 8,
      crownRadiusM: 6,
      trunkHeightM: 2,
      density: 0.7,
      undergrowth: 'none',
      deciduous: true,
    };

    const solar = { azimuthDeg: 180, elevationDeg: 30, zenithDeg: 60 };
    const winter = buildShadowFeatureCollection([tree], solar, { timestamp: '2026-01-15T12:00:00Z' });
    const summer = buildShadowFeatureCollection([tree], solar, { timestamp: '2026-06-15T12:00:00Z' });

    expect(winter.features).toHaveLength(1);
    expect(winter.features[0].properties.part).toBe('crown');
    expect(summer.features[0].geometry.coordinates[0][0][1]).not.toBe(winter.features[0].geometry.coordinates[0][0][1]);
  });

  it('projects imported roof surfaces separately for non-flat building shadows', () => {
    const building: SceneObject = {
      id: 'building',
      kind: 'building',
      name: 'Huis',
      position: { lat: 52, lon: 5 },
      footprint: [
        [4.99995, 51.99995],
        [5.00005, 51.99995],
        [5.00005, 52.00005],
        [4.99995, 52.00005],
      ],
      heightM: 7,
      roofSurfaces: [
        {
          footprint: [
            [4.99995, 51.99995],
            [5.00005, 51.99995],
            [5, 52.00005],
          ],
          baseHeightM: 4,
          heightM: 7,
        },
        {
          footprint: [
            [4.99995, 52.00005],
            [5, 52.00005],
            [5.00005, 51.99995],
          ],
          baseHeightM: 4,
          heightM: 7,
        },
      ],
    };

    const shadows = buildShadowFeatureCollection([building], { azimuthDeg: 180, elevationDeg: 30, zenithDeg: 60 });

    expect(shadows.features).toHaveLength(2);
    expect(shadows.features.map((feature) => feature.id)).toEqual(['shadow_building_roof_0', 'shadow_building_roof_1']);
  });

  it('estimates array shade when an array point falls inside a shadow polygon', () => {
    const array: PVArray = {
      id: 'array',
      name: 'Dak',
      panelTypeId: panelType.id,
      position: { lat: 52, lon: 5 },
      rows: 1,
      columns: 1,
      orientation: 'portrait',
      azimuthDeg: 180,
      tiltDeg: 35,
      baseHeightM: 3,
      panelGapM: 0.02,
      rowGapM: 0.3,
    };
    const shadows: ShadePreviewFeatureCollection = {
      type: 'FeatureCollection' as const,
      features: [
        {
          type: 'Feature' as const,
          id: 'shadow',
          properties: { id: 'shadow', objectId: 'object', kind: 'building' as const, opacity: 0.55 },
          geometry: {
            type: 'Polygon' as const,
            coordinates: [
              [
                [4.9999, 51.9999],
                [5.0001, 51.9999],
                [5.0001, 52.0001],
                [4.9999, 52.0001],
                [4.9999, 51.9999],
              ],
            ],
          },
        },
      ],
    };

    expect(estimateArrayShadeFactors([array], [panelType], shadows)[0].shadeFactor).toBe(0.55);
  });
});
