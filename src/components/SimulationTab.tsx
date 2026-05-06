import { useState } from 'react';

import { runAnnualSimulation, type AnnualSimulationResult } from '../simulation/annualSimulation';
import { calculatePlaneOfArrayIrradiance } from '../simulation/irradiance';
import { estimateArrayShadeFactors, buildShadowFeatureCollection } from '../simulation/shading';
import { calculateSolarPosition } from '../simulation/solarPosition';
import { normalizeWeather } from '../simulation/weather';
import { useProjectStore } from '../store/projectStore';

const MINUTES_PER_DAY = 24 * 60;

function dateInputValue(timestamp: string): string {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function minuteOfDay(timestamp: string): number {
  const date = new Date(timestamp);
  return date.getHours() * 60 + date.getMinutes();
}

function timeLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

function timestampFromDateAndMinutes(dateValue: string, minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return new Date(
    Number(dateValue.slice(0, 4)),
    Number(dateValue.slice(5, 7)) - 1,
    Number(dateValue.slice(8, 10)),
    hours,
    mins,
  ).toISOString();
}

function kwhLabel(value: number): string {
  return `${value.toLocaleString('nl-NL', { maximumFractionDigits: 0 })} kWh`;
}

function euroLabel(value: number): string {
  return `€${value.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}`;
}

function MonthlyEnergyChart({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const months = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
  return (
    <div className="monthly-chart" aria-label="Maandopbrengst grafiek">
      {values.map((value, index) => (
        <div key={months[index]} className="monthly-chart__bar">
          <span style={{ height: `${Math.max(4, (value / max) * 100)}%` }} title={`${months[index]}: ${kwhLabel(value)}`} />
          <small>{months[index]}</small>
        </div>
      ))}
    </div>
  );
}

function MonthlyCashflowChart({ values }: { values: number[] }) {
  const max = Math.max(1, ...values.map((value) => Math.abs(value)));
  const months = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
  return (
    <div className="monthly-chart monthly-chart--cashflow" aria-label="Maandelijkse cashflow grafiek">
      {values.map((value, index) => (
        <div key={months[index]} className="monthly-chart__bar">
          <span
            className={value < 0 ? 'monthly-chart__bar-negative' : undefined}
            style={{ height: `${Math.max(4, (Math.abs(value) / max) * 100)}%` }}
            title={`${months[index]}: ${euroLabel(value)}`}
          />
          <small>{months[index]}</small>
        </div>
      ))}
    </div>
  );
}

export function SimulationTab() {
  const project = useProjectStore((s) => s.project);
  const timestamp = useProjectStore((s) => s.simulationPreviewTimestamp);
  const setTimestamp = useProjectStore((s) => s.setSimulationPreviewTimestamp);
  const [annualResult, setAnnualResult] = useState<AnnualSimulationResult | null>(null);
  const [annualError, setAnnualError] = useState<string | null>(null);
  const [isRunningAnnual, setIsRunningAnnual] = useState(false);
  const date = new Date(timestamp);
  const selectedDate = dateInputValue(timestamp);
  const selectedMinute = minuteOfDay(timestamp);
  const solar = calculateSolarPosition(date, project.location);
  const weather = normalizeWeather({}, solar);
  const shadows = buildShadowFeatureCollection(project.scene.objects, solar, { timestamp });
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

  const hasCompleteElectricalModel =
    project.pv.arrays.length > 0 &&
    project.electrical.inverters.length > 0 &&
    project.electrical.wiring.some((item) => item.strings.length > 0);

  const runAnnual = async () => {
    setIsRunningAnnual(true);
    setAnnualError(null);
    try {
      setAnnualResult(await runAnnualSimulation(project, { year: 2025 }));
    } catch (error) {
      setAnnualError(error instanceof Error ? error.message : 'Jaarberekening mislukt');
    } finally {
      setIsRunningAnnual(false);
    }
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
        <button type="button" onClick={runAnnual} disabled={!hasCompleteElectricalModel || isRunningAnnual}>
          {isRunningAnnual ? 'Jaar 2025 wordt berekend…' : 'Bereken jaar 2025'}
        </button>
        {!hasCompleteElectricalModel && (
          <p className="hint">Voeg PV arrays, inverter(s) en bekabelde strings toe voor de jaarberekening.</p>
        )}
        {annualError && <p className="error-text">{annualError}</p>}
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

      {annualResult && (
        <section className="simulation-summary" aria-label="Jaarresultaten 2025">
          <h3>Jaarresultaten 2025</h3>
          <dl className="array-stats simulation-stats">
            <div>
              <dt>AC opbrengst</dt>
              <dd>{kwhLabel(annualResult.acKwh)}</dd>
            </div>
            <div>
              <dt>DC opbrengst</dt>
              <dd>{kwhLabel(annualResult.dcKwh)}</dd>
            </div>
            <div>
              <dt>Schaduwverlies</dt>
              <dd>{kwhLabel(annualResult.shadeLossKwh)}</dd>
            </div>
            <div>
              <dt>Mismatchverlies</dt>
              <dd>{kwhLabel(annualResult.mismatchLossKwh)}</dd>
            </div>
            <div>
              <dt>Clipping</dt>
              <dd>{kwhLabel(annualResult.clippingLossKwh)}</dd>
            </div>
            <div>
              <dt>Weerbron</dt>
              <dd>{annualResult.weatherSource === 'open-meteo-archive' ? 'Open-Meteo 2025' : 'testdata'}</dd>
            </div>
          </dl>
          <MonthlyEnergyChart values={annualResult.monthlyAcKwh} />
          <p className="hint">
            {annualResult.samples.toLocaleString('nl-NL')} uurstappen verwerkt in{' '}
            {(annualResult.elapsedMs / 1000).toFixed(1)} s via worker/fallback.
          </p>
        </section>
      )}

      {annualResult && (
        <section className="simulation-summary" aria-label="Economische resultaten 2025">
          <h3>Economische resultaten 2025</h3>
          <dl className="array-stats simulation-stats">
            <div>
              <dt>V4 besparing</dt>
              <dd>{euroLabel(annualResult.economic.annualSavingsEur)}</dd>
            </div>
            <div>
              <dt>Eigenverbruik</dt>
              <dd>{annualResult.economic.selfConsumptionPct.toFixed(0)}%</dd>
            </div>
            <div>
              <dt>Import</dt>
              <dd>{kwhLabel(annualResult.economic.importKwh)}</dd>
            </div>
            <div>
              <dt>Export</dt>
              <dd>{kwhLabel(annualResult.economic.exportKwh)}</dd>
            </div>
            <div>
              <dt>Accucycli</dt>
              <dd>{annualResult.economic.batteryCycles}</dd>
            </div>
            <div>
              <dt>EV load</dt>
              <dd>{kwhLabel(annualResult.economic.diagnostics.evLoadKwh)}</dd>
            </div>
          </dl>
          <MonthlyCashflowChart values={annualResult.economic.monthlySavingsEur} />
          <p className="hint">
            V4 euro-optimizer · SOC stap {annualResult.economic.diagnostics.socStepKwh.toFixed(2)} kWh · eind-SOC{' '}
            {annualResult.economic.diagnostics.finalSocKwh.toFixed(1)} kWh · dispatch sample{' '}
            {annualResult.economic.dispatchSample.length} uur.
          </p>
        </section>
      )}
    </div>
  );
}
