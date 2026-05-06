import { useState, type FormEvent } from 'react';

import { OsmMap } from '../map/OsmMap';
import { geocode, type GeocodeResult, isInsideNetherlands } from '../location/geocode';
import { useProjectStore } from '../store/projectStore';

export function LocationTab() {
  const project = useProjectStore((s) => s.project);
  const setLocation = useProjectStore((s) => s.setLocation);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value =
    project.location.lat && project.location.lon
      ? { lat: project.location.lat, lon: project.location.lon }
      : null;
  const inside = value ? isInsideNetherlands(value) : true;

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setIsSearching(true);
    setError(null);
    try {
      const found = await geocode({ query, limit: 5 });
      setResults(found);
      if (found.length === 0) setError('Geen resultaten gevonden binnen Nederland.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="location-tab">
      <aside className="location-sidebar">
        <h2>Locatie</h2>
        <p className="hint">
          Zoek je adres of klik op de kaart om de simulatielocatie binnen Nederland te kiezen.
        </p>
        <form onSubmit={handleSearch} className="search-form">
          <input
            type="search"
            placeholder="Adres, postcode of plaats…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Adres zoeken"
          />
          <button type="submit" disabled={isSearching || !query.trim()}>
            {isSearching ? 'Zoeken…' : 'Zoek'}
          </button>
        </form>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <ul className="results">
          {results.map((r) => (
            <li key={`${r.lat},${r.lon}`}>
              <button
                type="button"
                onClick={() =>
                  setLocation({
                    lat: r.lat,
                    lon: r.lon,
                    label: r.label,
                    timezone: project.location.timezone,
                  })
                }
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
        <dl className="coords">
          <dt>Breedtegraad</dt>
          <dd>{project.location.lat.toFixed(5)}</dd>
          <dt>Lengtegraad</dt>
          <dd>{project.location.lon.toFixed(5)}</dd>
          {project.location.label && (
            <>
              <dt>Adres</dt>
              <dd>{project.location.label}</dd>
            </>
          )}
        </dl>
        {!inside && (
          <p role="alert" className="error">
            Locatie ligt buiten Nederland.
          </p>
        )}
      </aside>
      <div className="location-map">
        <OsmMap
          value={value}
          onChange={(point) =>
            setLocation({
              lat: point.lat,
              lon: point.lon,
              timezone: project.location.timezone,
            })
          }
        />
      </div>
    </div>
  );
}
