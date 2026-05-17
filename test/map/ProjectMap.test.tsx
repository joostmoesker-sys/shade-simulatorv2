import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { FakeMap, FakeMarker } = vi.hoisted(() => {
  class FakeMap {
    static instances: FakeMap[] = [];
    layoutCalls: Array<[string, string, string]> = [];
    private sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
    private clickHandlers: Array<(event: { lngLat: { lat: number; lng: number } }) => void> = [];

    constructor() {
      FakeMap.instances.push(this);
    }

    addControl = vi.fn();
    addSource = vi.fn((id: string) => {
      this.sources.set(id, { setData: vi.fn() });
    });
    addLayer = vi.fn();
    setFilter = vi.fn();
    easeTo = vi.fn();
    remove = vi.fn();
    getCanvas = vi.fn(() => ({ style: {} }));
    setLayoutProperty = vi.fn((layer: string, property: string, value: string) => {
      this.layoutCalls.push([layer, property, value]);
    });
    getSource = vi.fn((id: string) => this.sources.get(id));
    on = vi.fn((event: string, layerOrHandler: unknown, maybeHandler?: unknown) => {
      if (event === 'load' && typeof layerOrHandler === 'function') {
        setTimeout(() => (layerOrHandler as () => void)(), 0);
      }
      if (event === 'click' && typeof layerOrHandler === 'function') {
        this.clickHandlers.push(
          layerOrHandler as (event: { lngLat: { lat: number; lng: number } }) => void,
        );
      }
      if (event === 'click' && typeof maybeHandler === 'function') {
        this.clickHandlers.push(
          maybeHandler as (event: { lngLat: { lat: number; lng: number } }) => void,
        );
      }
    });

    triggerClick(lat: number, lon: number) {
      for (const handler of this.clickHandlers) handler({ lngLat: { lat, lng: lon } });
    }
  }

  class FakeMarker {
    private lngLat = { lat: 0, lng: 0 };
    on = vi.fn();
    addTo = vi.fn(() => this);
    remove = vi.fn();
    setLngLat = vi.fn(([lng, lat]: [number, number]) => {
      this.lngLat = { lat, lng };
      return this;
    });
    getLngLat = vi.fn(() => this.lngLat);
    getElement = vi.fn(() => {
      const outer = document.createElement('div');
      outer.appendChild(document.createElement('div'));
      return outer;
    });
  }

  return { FakeMap, FakeMarker };
});

vi.mock('maplibre-gl', () => ({
  default: {
    Map: FakeMap,
    Marker: FakeMarker,
    NavigationControl: class {},
  },
  Map: FakeMap,
  Marker: FakeMarker,
  NavigationControl: class {},
}));

import { createProject } from '../../src/model/project';
import { ProjectMap } from '../../src/map/ProjectMap';
import { useProjectStore } from '../../src/store/projectStore';

const validLocation = { lat: 52.0, lon: 5.0, timezone: 'Europe/Amsterdam' };

describe('<ProjectMap>', () => {
  beforeEach(() => {
    FakeMap.instances = [];
    useProjectStore.setState({
      project: createProject({ name: 'Demo', location: validLocation, id: 'proj_demo' }),
      activeTab: 'objecten',
      selectedSceneObjectId: null,
      selectedPVArrayId: null,
      objectMapAddKind: null,
      simulationPreviewTimestamp: '2026-06-21T12:00:00.000Z',
    });
  });

  it('switches to satellite base layer', async () => {
    render(<ProjectMap />);

    fireEvent.click(screen.getByRole('button', { name: 'Satelliet' }));

    await waitFor(() => {
      expect(FakeMap.instances[0].layoutCalls).toContainEqual(['satellite', 'visibility', 'visible']);
    });
  });

  it('places a tree on map click when object placement mode is active', async () => {
    useProjectStore.getState().setObjectMapAddKind('tree');
    render(<ProjectMap />);

    await waitFor(() => expect(FakeMap.instances[0]).toBeDefined());
    act(() => {
      FakeMap.instances[0].triggerClick(52.01, 5.01);
    });

    expect(useProjectStore.getState().project.scene.objects[0]).toMatchObject({
      kind: 'tree',
      position: { lat: 52.01, lon: 5.01 },
    });
  });

  it('adds a dynamic shade overlay source and layers', async () => {
    render(<ProjectMap />);

    await waitFor(() => {
      expect(FakeMap.instances[0].addSource).toHaveBeenCalledWith(
        'shade-shadows',
        expect.objectContaining({ type: 'geojson' }),
      );
      expect(FakeMap.instances[0].addLayer).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'shade-shadows-fill', source: 'shade-shadows' }),
      );
    });
  });

  it('renders scene objects as 3D extrusions', async () => {
    render(<ProjectMap />);

    await waitFor(() => {
      expect(FakeMap.instances[0].addLayer).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'buildings-extrusion', type: 'fill-extrusion' }),
      );
      expect(FakeMap.instances[0].addLayer).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'building-roofs-extrusion', type: 'fill-extrusion' }),
      );
      expect(FakeMap.instances[0].addLayer).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tree-crowns-extrusion', type: 'fill-extrusion' }),
      );
    });
  });
});
