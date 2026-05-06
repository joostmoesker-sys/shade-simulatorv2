import { useEffect, useMemo, useState } from 'react';

import type { Inverter, MPPT, MPPTWiring, PanelType, PVArray, WiringString } from '../model/schema';
import { useProjectStore } from '../store/projectStore';

type SelectedMPPT = {
  inverter: Inverter;
  mppt: MPPT;
};

function findSelectedMPPT(inverters: Inverter[], selectedKey: string | null): SelectedMPPT | null {
  const fallback = inverters[0]?.mppts[0]
    ? { inverter: inverters[0], mppt: inverters[0].mppts[0] }
    : null;
  if (!selectedKey) return fallback;
  const [inverterId, mpptId] = selectedKey.split(':');
  for (const inverter of inverters) {
    const mppt = inverter.mppts.find((item) => item.id === mpptId);
    if (inverter.id === inverterId && mppt) return { inverter, mppt };
  }
  return fallback;
}

function mpptKey(inverterId: string, mpptId: string) {
  return `${inverterId}:${mpptId}`;
}

function getMPPTWiring(wiring: MPPTWiring[], inverterId: string, mpptId: string): MPPTWiring | null {
  return wiring.find((item) => item.inverterId === inverterId && item.mpptId === mpptId) ?? null;
}

function panelsForRow(array: PVArray, row: number): WiringString['panels'] {
  return Array.from({ length: array.columns }, (_, column) => ({
    arrayId: array.id,
    row,
    column,
  }));
}

function panelsForColumn(array: PVArray, column: number): WiringString['panels'] {
  return Array.from({ length: array.rows }, (_, row) => ({
    arrayId: array.id,
    row,
    column,
  }));
}

function panelsForSnake(array: PVArray): WiringString['panels'] {
  return Array.from({ length: array.rows }).flatMap((_, row) => {
    const columns = Array.from({ length: array.columns }, (_, column) => column);
    const orderedColumns = row % 2 === 0 ? columns : columns.reverse();
    return orderedColumns.map((column) => ({
      arrayId: array.id,
      row,
      column,
    }));
  });
}

function describePanels(panels: WiringString['panels'], arrays: PVArray[]): string {
  if (panels.length === 0) return 'Geen panelen';
  const first = panels[0];
  const arrayName = arrays.find((array) => array.id === first.arrayId)?.name ?? first.arrayId;
  const sameArray = panels.every((panel) => panel.arrayId === first.arrayId);
  if (!sameArray) return `${panels.length} panelen over meerdere arrays`;
  return `${arrayName}: ${panels.map((panel) => `R${panel.row + 1}C${panel.column + 1}`).join(' → ')}`;
}

function panelTypeForArray(array: PVArray, panelTypes: PanelType[]): PanelType | null {
  return panelTypes.find((panelType) => panelType.id === array.panelTypeId) ?? null;
}

function summarizeString(
  string: WiringString,
  arrays: PVArray[],
  panelTypes: PanelType[],
) {
  const firstPanel = string.panels[0];
  const array = firstPanel ? arrays.find((item) => item.id === firstPanel.arrayId) : null;
  const panelType = array ? panelTypeForArray(array, panelTypes) : null;
  if (!panelType) return null;
  const panelCount = string.panels.length;
  return {
    panelCount,
    vmpV: panelType.vmpV * panelCount,
    vocV: panelType.vocV * panelCount,
    impA: panelType.impA,
    iscA: panelType.iscA,
    pmaxW: panelType.pmaxW * panelCount,
  };
}

function wiringWarnings(
  mppt: MPPT,
  strings: WiringString[],
  arrays: PVArray[],
  panelTypes: PanelType[],
): string[] {
  const summaries = strings
    .map((string) => summarizeString(string, arrays, panelTypes))
    .filter((summary): summary is NonNullable<typeof summary> => summary !== null);
  const warnings: string[] = [];
  for (const [index, summary] of summaries.entries()) {
    if (summary.vmpV < mppt.vMinV) warnings.push(`String ${index + 1}: Vmp ligt onder Vmin.`);
    if (summary.vocV > mppt.vMaxV) warnings.push(`String ${index + 1}: Voc ligt boven Vmax.`);
    if (summary.pmaxW > mppt.pMaxW) warnings.push(`String ${index + 1}: Pmax ligt boven MPPT-limiet.`);
  }
  const parallelImpA = summaries.reduce((sum, summary) => sum + summary.impA, 0);
  const parallelIscA = summaries.reduce((sum, summary) => sum + summary.iscA, 0);
  if (parallelImpA > mppt.iMaxA) warnings.push('Parallelle strings overschrijden Imax.');
  if (parallelIscA > mppt.iScMaxA) warnings.push('Parallelle strings overschrijden Isc max.');
  return warnings;
}

export function WiringTab() {
  const project = useProjectStore((s) => s.project);
  const addWiringString = useProjectStore((s) => s.addWiringString);
  const removeWiringString = useProjectStore((s) => s.removeWiringString);
  const [selectedKey, setSelectedKey] = useState<string | null>(() => {
    const firstInverter = project.electrical.inverters[0];
    const firstMPPT = firstInverter?.mppts[0];
    return firstInverter && firstMPPT ? mpptKey(firstInverter.id, firstMPPT.id) : null;
  });
  const [selectedArrayId, setSelectedArrayId] = useState<string>(() => project.pv.arrays[0]?.id ?? '');

  const selected = useMemo(
    () => findSelectedMPPT(project.electrical.inverters, selectedKey),
    [project.electrical.inverters, selectedKey],
  );
  const selectedArray = project.pv.arrays.find((array) => array.id === selectedArrayId) ?? project.pv.arrays[0];
  const selectedWiring = selected
    ? getMPPTWiring(project.electrical.wiring, selected.inverter.id, selected.mppt.id)
    : null;
  const strings = selectedWiring?.strings ?? [];
  const warnings = selected
    ? wiringWarnings(selected.mppt, strings, project.pv.arrays, project.pv.panelTypes)
    : [];

  useEffect(() => {
    if (!selectedArrayId || !project.pv.arrays.some((array) => array.id === selectedArrayId)) {
      setSelectedArrayId(project.pv.arrays[0]?.id ?? '');
    }
  }, [project.pv.arrays, selectedArrayId]);

  useEffect(() => {
    const nextKey = selected ? mpptKey(selected.inverter.id, selected.mppt.id) : null;
    if (selectedKey !== nextKey) {
      setSelectedKey(nextKey);
    }
  }, [selected, selectedKey]);

  const addString = (panels: WiringString['panels']) => {
    if (!selected) return;
    addWiringString(selected.inverter.id, selected.mppt.id, panels);
  };

  return (
    <div className="panel-content editor-page wiring-page">
      <aside className="editor-sidebar">
        <header className="editor-header">
          <div>
            <h2>Bekabeling</h2>
            <p className="hint">
              Kies een MPPT en verbind panelen als seriestrings. Meerdere strings op dezelfde MPPT worden parallel gezet.
            </p>
          </div>
        </header>

        {project.electrical.inverters.length > 0 ? (
          <ul className="entity-list" aria-label="MPPT aansluitingen">
            {project.electrical.inverters.map((inverter) =>
              inverter.mppts.map((mppt) => {
                const key = mpptKey(inverter.id, mppt.id);
                const mpptWiring = getMPPTWiring(project.electrical.wiring, inverter.id, mppt.id);
                return (
                  <li key={key}>
                    <button
                      type="button"
                      aria-current={key === selectedKey ? 'true' : undefined}
                      onClick={() => setSelectedKey(key)}
                    >
                      <span>
                        {inverter.name} · {mppt.name}
                      </span>
                      <small>{mpptWiring?.strings.length ?? 0} string(s) aangesloten</small>
                    </button>
                  </li>
                );
              }),
            )}
          </ul>
        ) : (
          <p className="empty-state">Definieer eerst een inverter met MPPT's.</p>
        )}
      </aside>

      <section className="editor-detail">
        {selected ? (
          <div className="property-form wiring-editor" aria-label="Bekabeling editor">
            <h3>
              {selected.inverter.name} · {selected.mppt.name}
            </h3>
            <dl className="array-stats">
              <div>
                <dt>Spanning</dt>
                <dd>
                  {selected.mppt.vMinV}-{selected.mppt.vMaxV} V
                </dd>
              </div>
              <div>
                <dt>Stroom</dt>
                <dd>{selected.mppt.iMaxA} A</dd>
              </div>
              <div>
                <dt>Vermogen</dt>
                <dd>{(selected.mppt.pMaxW / 1000).toFixed(1)} kW</dd>
              </div>
            </dl>

            {project.pv.arrays.length > 0 && selectedArray ? (
              <section className="string-builder" aria-label="String toevoegen">
                <label>
                  PV array
                  <select value={selectedArray.id} onChange={(e) => setSelectedArrayId(e.target.value)}>
                    {project.pv.arrays.map((array) => (
                      <option key={array.id} value={array.id}>
                        {array.name} ({array.rows}×{array.columns})
                      </option>
                    ))}
                  </select>
                </label>

                <div className="string-template-grid">
                  <section>
                    <h4>Rijen</h4>
                    <div className="template-buttons">
                      {Array.from({ length: selectedArray.rows }, (_, row) => (
                        <button key={row} type="button" onClick={() => addString(panelsForRow(selectedArray, row))}>
                          Rij {row + 1}
                        </button>
                      ))}
                    </div>
                  </section>
                  <section>
                    <h4>Kolommen</h4>
                    <div className="template-buttons">
                      {Array.from({ length: selectedArray.columns }, (_, column) => (
                        <button
                          key={column}
                          type="button"
                          onClick={() => addString(panelsForColumn(selectedArray, column))}
                        >
                          Kolom {column + 1}
                        </button>
                      ))}
                    </div>
                  </section>
                </div>
                <button type="button" onClick={() => addString(panelsForSnake(selectedArray))}>
                  Hele array als snake-string toevoegen
                </button>
              </section>
            ) : (
              <p className="empty-state">Voeg eerst één of meer PV arrays toe.</p>
            )}

            <section className="sub-editor" aria-label="Aangesloten strings">
              <header>
                <h4>Aangesloten strings</h4>
                <span className="string-count">{strings.length} parallel</span>
              </header>
              {strings.length > 0 ? (
                strings.map((string, index) => {
                  const summary = summarizeString(string, project.pv.arrays, project.pv.panelTypes);
                  return (
                    <article key={string.id} className="string-card">
                      <div>
                        <strong>String {index + 1}</strong>
                        <p>{describePanels(string.panels, project.pv.arrays)}</p>
                        {summary && (
                          <small>
                            {`${summary.panelCount} panelen · Vmp ${summary.vmpV.toFixed(0)} V · Voc ${summary.vocV.toFixed(0)} V · ${summary.pmaxW.toFixed(0)} Wp`}
                          </small>
                        )}
                      </div>
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => removeWiringString(selected.inverter.id, selected.mppt.id, string.id)}
                      >
                        Verwijderen
                      </button>
                    </article>
                  );
                })
              ) : (
                <p className="empty-state">Nog geen strings op deze MPPT.</p>
              )}
            </section>

            {warnings.length > 0 && (
              <section className="wiring-warnings" aria-label="Bekabeling waarschuwingen">
                <h4>Waarschuwingen</h4>
                <ul>
                  {warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        ) : (
          <div className="placeholder">
            <h2>Bekabeling</h2>
            <p>Definieer eerst een inverter en MPPT voordat je panelen aansluit.</p>
          </div>
        )}
      </section>
    </div>
  );
}
