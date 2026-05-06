import { useState } from 'react';

import { runAnnualSimulation, type AnnualSimulationResult } from '../simulation/annualSimulation';
import { useProjectStore } from '../store/projectStore';

const MONTHS = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];

function kwhLabel(value: number): string {
  return `${value.toLocaleString('nl-NL', { maximumFractionDigits: 0 })} kWh`;
}

function euroLabel(value: number): string {
  return `€${value.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}`;
}

function percentLabel(value: number): string {
  return `${value.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}%`;
}

function safeFileName(name: string, suffix: string): string {
  const cleaned = name.trim().toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/-+/g, '-');
  return `${cleaned || 'shade-project'}-${suffix}`;
}

function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildResultsCsv(result: AnnualSimulationResult): string {
  const rows: Array<Array<string | number>> = [
    ['section', 'metric', 'month', 'value'],
    ['annual', 'ac_kwh', '', result.acKwh],
    ['annual', 'dc_kwh', '', result.dcKwh],
    ['annual', 'shade_loss_kwh', '', result.shadeLossKwh],
    ['annual', 'mismatch_loss_kwh', '', result.mismatchLossKwh],
    ['annual', 'clipping_loss_kwh', '', result.clippingLossKwh],
    ['annual', 'import_kwh', '', result.economic.importKwh],
    ['annual', 'export_kwh', '', result.economic.exportKwh],
    ['annual', 'self_consumption_pct', '', result.economic.selfConsumptionPct],
    ['annual', 'annual_savings_eur', '', result.economic.annualSavingsEur],
    ['annual', 'baseline_cost_eur', '', result.economic.baselineCostEur],
    ['annual', 'import_cost_eur', '', result.economic.importCostEur],
    ['annual', 'export_revenue_eur', '', result.economic.exportRevenueEur],
  ];

  for (let month = 0; month < 12; month++) {
    rows.push(['monthly', 'ac_kwh', MONTHS[month], result.monthlyAcKwh[month] ?? 0]);
    rows.push(['monthly', 'savings_eur', MONTHS[month], result.economic.monthlySavingsEur[month] ?? 0]);
    rows.push(['monthly', 'import_cost_eur', MONTHS[month], result.economic.monthlyImportCostEur[month] ?? 0]);
    rows.push(['monthly', 'export_revenue_eur', MONTHS[month], result.economic.monthlyRevenueEur[month] ?? 0]);
  }

  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function MonthlyChart({
  values,
  label,
  formatter,
  cashflow = false,
}: {
  values: number[];
  label: string;
  formatter: (value: number) => string;
  cashflow?: boolean;
}) {
  const max = Math.max(1, ...values.map((value) => Math.abs(value)));
  return (
    <div className={`monthly-chart${cashflow ? ' monthly-chart--cashflow' : ''}`} aria-label={label}>
      {values.map((value, index) => (
        <div key={MONTHS[index]} className="monthly-chart__bar">
          <span
            className={cashflow && value < 0 ? 'monthly-chart__bar-negative' : undefined}
            style={{ height: `${Math.max(4, (Math.abs(value) / max) * 100)}%` }}
            title={`${MONTHS[index]}: ${formatter(value)}`}
          />
          <small>{MONTHS[index]}</small>
        </div>
      ))}
    </div>
  );
}

export function ResultsTab() {
  const project = useProjectStore((s) => s.project);
  const result = useProjectStore((s) => s.annualSimulationResult);
  const setResult = useProjectStore((s) => s.setAnnualSimulationResult);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasCompleteElectricalModel =
    project.pv.arrays.length > 0 &&
    project.electrical.inverters.length > 0 &&
    project.electrical.wiring.some((item) => item.strings.length > 0);

  const runAnnual = async () => {
    setIsRunning(true);
    setError(null);
    try {
      setResult(await runAnnualSimulation(project, { year: 2025 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Jaarberekening mislukt');
    } finally {
      setIsRunning(false);
    }
  };

  const exportJson = () => {
    if (!result) return;
    downloadText(
      safeFileName(project.name, 'resultaten-2025.json'),
      JSON.stringify({ project: { id: project.id, name: project.name }, result }, null, 2),
      'application/json',
    );
  };

  const exportCsv = () => {
    if (!result) return;
    downloadText(safeFileName(project.name, 'resultaten-2025.csv'), buildResultsCsv(result), 'text/csv;charset=utf-8');
  };

  return (
    <div className="panel-content results-tab">
      <section className="simulation-controls">
        <h2>Resultaten</h2>
        <p className="hint">
          Fase 5: bekijk de jaarresultaten, verliesposten en economie op één plek en exporteer de samenvatting.
        </p>
        <div className="results-actions">
          <button type="button" onClick={runAnnual} disabled={!hasCompleteElectricalModel || isRunning}>
            {isRunning ? 'Jaar 2025 wordt berekend…' : result ? 'Herbereken jaar 2025' : 'Bereken jaar 2025'}
          </button>
          <button type="button" onClick={exportCsv} disabled={!result}>
            Exporteer CSV
          </button>
          <button type="button" onClick={exportJson} disabled={!result}>
            Exporteer JSON
          </button>
        </div>
        {!hasCompleteElectricalModel && (
          <p className="hint">Voeg PV arrays, inverter(s) en bekabelde strings toe voordat resultaten berekend kunnen worden.</p>
        )}
        {error && <p className="error-text">{error}</p>}
      </section>

      {!result ? (
        <section className="simulation-summary">
          <h3>Nog geen jaarresultaat</h3>
          <p className="empty-state">Start een jaarberekening vanuit Simulatie of Resultaten om opbrengst en economie te tonen.</p>
        </section>
      ) : (
        <>
          <section className="simulation-summary" aria-label="Resultaten samenvatting 2025">
            <h3>Samenvatting 2025</h3>
            <dl className="array-stats simulation-stats">
              <div>
                <dt>AC opbrengst</dt>
                <dd>{kwhLabel(result.acKwh)}</dd>
              </div>
              <div>
                <dt>Besparing</dt>
                <dd>{euroLabel(result.economic.annualSavingsEur)}</dd>
              </div>
              <div>
                <dt>Eigenverbruik</dt>
                <dd>{percentLabel(result.economic.selfConsumptionPct)}</dd>
              </div>
              <div>
                <dt>Accucycli</dt>
                <dd>{result.economic.batteryCycles}</dd>
              </div>
            </dl>
          </section>

          <section className="simulation-summary" aria-label="Verliesposten 2025">
            <h3>Verliesposten</h3>
            <dl className="array-stats simulation-stats">
              <div>
                <dt>Schaduw</dt>
                <dd>{kwhLabel(result.shadeLossKwh)}</dd>
              </div>
              <div>
                <dt>Mismatch</dt>
                <dd>{kwhLabel(result.mismatchLossKwh)}</dd>
              </div>
              <div>
                <dt>Clipping</dt>
                <dd>{kwhLabel(result.clippingLossKwh)}</dd>
              </div>
              <div>
                <dt>Voltage/stroom</dt>
                <dd>{kwhLabel(result.voltageCurrentLossKwh)}</dd>
              </div>
            </dl>
          </section>

          <section className="simulation-summary" aria-label="Maandresultaten 2025">
            <h3>Maandopbrengst</h3>
            <MonthlyChart values={result.monthlyAcKwh} label="Maandopbrengst grafiek" formatter={kwhLabel} />
            <h3>Maandelijkse cashflow</h3>
            <MonthlyChart
              values={result.economic.monthlySavingsEur}
              label="Maandelijkse cashflow grafiek"
              formatter={euroLabel}
              cashflow
            />
          </section>

          <section className="simulation-summary" aria-label="Economische details 2025">
            <h3>Economische details</h3>
            <dl className="array-stats simulation-stats">
              <div>
                <dt>Baseline kosten</dt>
                <dd>{euroLabel(result.economic.baselineCostEur)}</dd>
              </div>
              <div>
                <dt>Importkosten</dt>
                <dd>{euroLabel(result.economic.importCostEur)}</dd>
              </div>
              <div>
                <dt>Exportopbrengst</dt>
                <dd>{euroLabel(result.economic.exportRevenueEur)}</dd>
              </div>
              <div>
                <dt>Import/export</dt>
                <dd>
                  {kwhLabel(result.economic.importKwh)} / {kwhLabel(result.economic.exportKwh)}
                </dd>
              </div>
            </dl>
            <p className="hint">
              Bron: {result.weatherSource === 'open-meteo-archive' ? 'Open-Meteo 2025' : 'testdata'} ·{' '}
              {result.samples.toLocaleString('nl-NL')} uurstappen · dynamische prijzen gebruiken ruwe NL day-ahead data 2025.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
