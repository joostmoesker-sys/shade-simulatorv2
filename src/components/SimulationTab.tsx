import { calculatePlaneOfArrayIrradiance } from '../simulation/irradiance';
import { estimateArrayShadeFactors, buildShadowFeatureCollection } from '../simulation/shading';
import { calculateSolarPosition } from '../simulation/solarPosition';
import { normalizeWeather } from '../simulation/weather';
import { useProjectStore } from '../store/projectStore';

const MINUTES_PER_DAY = 24 * 60;

function dateInputValue(timestamp: string): string {
  return timestamp.slice(0, 10);
}

function minuteOfDay(timestamp: string): number {
  const date = new Date(timestamp);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function timeLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

function timestampFromDateAndMinutes(dateValue: string, minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return new Date(Date.UTC(Number(dateValue.slice(0, 4)), Number(dateValue.slice(5, 7)) - 1, Number(dateValue.slice(8, 10)), hours, mins)).toISOString();
}

export function SimulationTab() {
  const project = useProjectStore((s) => s.project);
  const timestamp = useProjectStore((s) => s.simulationPreviewTimestamp);
  const setTimestamp = useProjectStore((s) => s.setSimulationPreviewTimestamp);
  const date = new Date(timestamp);
  const selectedDate = dateInputValue(timestamp);
  const selectedMinute = minuteOfDay(timestamp);
  const solar = calculateSolarPosition(date, project.location);
  const weather = normalizeWeather({}, solar);
  const shadows = buildShadowFeatureCollection(project.scene.objects, solar);
  const shadeResults = estimateArrayShadeFactors(project.pv.arrays, project.pv.panelTypes, shadows);

  const arrayResults = project.pv.arrays.map((array) => {
    const irradiance = calculatePlaneOfArrayIrradiance(weather, solar, array);
    const shadeFactor = shadeResults.find((item) => item.arrayId === array.id)?.shadeFactor ?? 0;
    return {
      array,
      irradiance,
      shadeFactor,
      effectiveWm2: irradiance.totalWm2 * (1 - shadeFactor),
    };
  });

  const updateDate = (dateValue: string) => {
    setTimestamp(timestampFromDateAndMinutes(dateValue, selectedMinute));
  };

  const updateMinute = (minutes: number) => {
    setTimestamp(timestampFromDateAndMinutes(selectedDate, minutes));
  };

  return (
    <div className="panel-content simulation-tab">
      <section className="simulation-controls">
        <h2>Simulatiepreview</h2>
        <p className="hint">
          Valideer zonpositie, instraling en schaduwpatronen op de kaart voor een gekozen datum en tijd.
        </p>
        <label>
          Datum
          <input type="date" value={selectedDate} onChange={(e) => updateDate(e.target.value)} />
        </label>
        <label>
          Tijd: <strong>{timeLabel(selectedMinute)}</strong>
          <input
            type="range"
            min={0}
            max={MINUTES_PER_DAY - 1}
            step={15}
            value={selectedMinute}
            onChange={(e) => updateMinute(Number(e.target.value))}
          />
        </label>
      </section>

      <section className="simulation-summary" aria-label="Simulatiepreview resultaten">
        <h3>Zonpositie en weer</h3>
        <dl className="array-stats simulation-stats">
          <div>
            <dt>Azimuth</dt>
            <dd>{solar.azimuthDeg.toFixed(0)}°</dd>
          </div>
          <div>
            <dt>Hoogte</dt>
            <dd>{solar.elevationDeg.toFixed(0)}°</dd>
          </div>
          <div>
            <dt>GHI</dt>
            <dd>{weather.ghiWm2.toFixed(0)} W/m²</dd>
          </div>
          <div>
            <dt>DNI</dt>
            <dd>{weather.dniWm2.toFixed(0)} W/m²</dd>
          </div>
          <div>
            <dt>DHI</dt>
            <dd>{weather.dhiWm2.toFixed(0)} W/m²</dd>
          </div>
          <div>
            <dt>Bron</dt>
            <dd>{weather.source === 'clear-sky-preview' ? 'clear-sky' : 'gemeten'}</dd>
          </div>
        </dl>

        <h3>Plane-of-array en schaduw</h3>
        {arrayResults.length > 0 ? (
          <ul className="simulation-array-list">
            {arrayResults.map((result) => (
              <li key={result.array.id}>
                <strong>{result.array.name}</strong>
                <span>
                  POA {result.irradiance.totalWm2.toFixed(0)} W/m² · schaduw{' '}
                  {(result.shadeFactor * 100).toFixed(0)}% · effectief {result.effectiveWm2.toFixed(0)} W/m²
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">Voeg PV arrays toe om POA-instraling en schaduwfactoren te zien.</p>
        )}
      </section>
    </div>
  );
}
