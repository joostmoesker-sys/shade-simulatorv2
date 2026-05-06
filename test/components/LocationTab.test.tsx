import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

// Mock the heavyweight MapLibre component; the geocoding logic and store
// integration are what we care about here.
vi.mock('../../src/map/OsmMap', () => ({
  OsmMap: ({ value }: { value: { lat: number; lon: number } | null }) => (
    <div data-testid="osm-map-mock">{value ? `${value.lat},${value.lon}` : 'no pin'}</div>
  ),
}));

// Mock geocode so we don't make real network calls.
vi.mock('../../src/location/geocode', async () => {
  const actual = await vi.importActual<typeof import('../../src/location/geocode')>(
    '../../src/location/geocode',
  );
  return {
    ...actual,
    geocode: vi.fn(),
  };
});

import { LocationTab } from '../../src/components/LocationTab';
import { geocode } from '../../src/location/geocode';
import { createProject } from '../../src/model/project';
import { useProjectStore } from '../../src/store/projectStore';

const validLocation = { lat: 52.0, lon: 5.0, timezone: 'Europe/Amsterdam' };

describe('<LocationTab>', () => {
  beforeEach(() => {
    useProjectStore.setState({
      project: createProject({ name: 'Demo', location: validLocation, id: 'proj_demo' }),
      activeTab: 'locatie',
      selectedSceneObjectId: null,
      selectedPVArrayId: null,
      objectMapAddKind: null,
    });
    vi.mocked(geocode).mockReset();
  });

  it('shows the search field and current coordinates', () => {
    render(<LocationTab />);
    expect(screen.getByLabelText('Adres zoeken')).toBeInTheDocument();
    expect(screen.getByText('52.00000')).toBeInTheDocument();
    expect(screen.getByText(/gedeelde kaart/)).toBeInTheDocument();
  });

  it('runs a geocode search and lets the user pick a result', async () => {
    vi.mocked(geocode).mockResolvedValue([
      { label: 'Utrecht, Nederland', lat: 52.09, lon: 5.12 },
    ]);

    render(<LocationTab />);
    fireEvent.change(screen.getByLabelText('Adres zoeken'), { target: { value: 'Utrecht' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zoek' }));

    const result = await screen.findByRole('button', { name: 'Utrecht, Nederland' });
    fireEvent.click(result);

    await waitFor(() => {
      expect(useProjectStore.getState().project.location.label).toBe('Utrecht, Nederland');
    });
    expect(useProjectStore.getState().project.location.lat).toBeCloseTo(52.09);
  });

  it('shows an alert when no results are returned', async () => {
    vi.mocked(geocode).mockResolvedValue([]);
    render(<LocationTab />);
    fireEvent.change(screen.getByLabelText('Adres zoeken'), { target: { value: 'Nowhere' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zoek' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Geen resultaten/);
  });

  it('shows an alert when the geocoder errors', async () => {
    vi.mocked(geocode).mockRejectedValue(new Error('boom'));
    render(<LocationTab />);
    fireEvent.change(screen.getByLabelText('Adres zoeken'), { target: { value: 'Utrecht' } });
    fireEvent.click(screen.getByRole('button', { name: 'Zoek' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
  });
});
