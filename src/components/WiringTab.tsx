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

function panelTypeForArray(array: PVArray, panelTypes: PanelType[]): PanelType | null {
  return panelTypes.find((panelType) => panelType.id === array.panelTypeId) ?? null;
}

function summarizeString(
  string: WiringString,
  arrays: PVArray[],
  panelTypes: PanelType[],
) {
  const panelRefs = string.panels.flatMap((panel) => {
    const array = arrays.find((item) => item.id === panel.arrayId);
    const panelType = array ? panelTypeForArray(array, panelTypes) : null;
    return array && panelType ? [{ array, panelType }] : [];
  });
  if (panelRefs.length === 0) return null;
  return {
    panelCount: panelRefs.length,
    arrayCount: new Set(panelRefs.map((panel) => panel.array.id)).size,
    vmpV: panelRefs.reduce((sum, panel) => sum + panel.panelType.vmpV, 0),
    vocV: panelRefs.reduce((sum, panel) => sum + panel.panelType.vocV, 0),
    // Series strings are current-limited by the weakest panel when arrays use different panel types.
    impA: Math.min(...panelRefs.map((panel) => panel.panelType.impA)),
    iscA: Math.min(...panelRefs.map((panel) => panel.panelType.iscA)),
    pmaxW: panelRefs.reduce((sum, panel) => sum + panel.panelType.pmaxW, 0),
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

function panelKey(arrayId: string, row: number, column: number): string {
  return `${arrayId}:${row}:${column}`;
}

function pendingPanelLabel(panels: WiringString['panels'], arrayId: string, row: number, column: number): number | null {
  const index = panels.findIndex((panel) => panel.arrayId === arrayId && panel.row === row && panel.column === column);
  return index >= 0 ? index + 1 : null;
}

interface PanelGridProps {
  array: PVArray;
  assignedKeys: Set<string>;
  pendingPanels: WiringString['panels'];
  highlightedStringPanelKeys: Set<string>;
  isBuilding: boolean;
  onToggle: (arrayId: string, row: number, column: number) => void;
}

function PanelGrid({ array, assignedKeys, pendingPanels, highlightedStringPanelKeys, isBuilding, onToggle }: PanelGridProps) {
  const pendingKeys = useMemo(
    () => new Set(pendingPanels.map((p) => panelKey(array.id, p.row, p.column))),
    [pendingPanels, array.id],
  );

  return (
    <div
      className="panel-grid"
      style={{ '--panel-grid-columns': array.columns } as React.CSSProperties}
      aria-label={`Paneelraster ${array.name}`}
    >
      {Array.from({ length: array.rows }, (_, row) =>
        Array.from({ length: array.columns }, (_, column) => {
          const key = panelKey(array.id, row, column);
          const isAssigned = assignedKeys.has(key);
          const isPending = pendingKeys.has(key);
          const isHighlighted = highlightedStringPanelKeys.has(key);
          const orderNumber = isPending ? pendingPanelLabel(pendingPanels, array.id, row, column) : null;

          let state: 'available' | 'pending' | 'assigned' | 'highlighted' = 'available';
          if (isAssigned) state = 'assigned';
          else if (isPending) state = 'pending';
          else if (isHighlighted) state = 'highlighted';

          return (
            <button
              key={key}
              type="button"
              className={`panel-cell panel-cell--${state}`}
              disabled={isAssigned || !isBuilding}
              aria-label={`${array.name} Rij ${row + 1} Kolom ${column + 1}${isAssigned ? ' (toegewezen)' : ''}${isPending ? ` (geselecteerd #${orderNumber ?? ''})` : ''}`}
              aria-pressed={isPending ? true : undefined}
              onClick={() => onToggle(array.id, row, column)}
            >
              {isPending && orderNumber !== null ? (
                <span className="panel-cell__order">{orderNumber}</span>
              ) : null}
            </button>
          );
        }),
      )}
    </div>
  );
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
  const [pendingPanels, setPendingPanels] = useState<WiringString['panels']>([]);
  const [isBuilding, setIsBuilding] = useState(false);
  const [hoveredStringId, setHoveredStringId] = useState<string | null>(null);

  const selected = useMemo(
    () => findSelectedMPPT(project.electrical.inverters, selectedKey),
    [project.electrical.inverters, selectedKey],
  );
  const selectedWiring = selected
    ? getMPPTWiring(project.electrical.wiring, selected.inverter.id, selected.mppt.id)
    : null;
  const strings = selectedWiring?.strings ?? [];
  const warnings = selected
    ? wiringWarnings(selected.mppt, strings, project.pv.arrays, project.pv.panelTypes)
    : [];

  const assignedPanelKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const mpptWiring of project.electrical.wiring) {
      for (const string of mpptWiring.strings) {
        for (const panel of string.panels) {
          keys.add(panelKey(panel.arrayId, panel.row, panel.column));
        }
      }
    }
    return keys;
  }, [project.electrical.wiring]);

  const hoveredStringPanelKeys = useMemo(() => {
    if (!hoveredStringId) return new Set<string>();
    const keys = new Set<string>();
    for (const mpptWiring of project.electrical.wiring) {
      for (const string of mpptWiring.strings) {
        if (string.id !== hoveredStringId) continue;
        for (const panel of string.panels) {
          keys.add(panelKey(panel.arrayId, panel.row, panel.column));
        }
      }
    }
    return keys;
  }, [project.electrical.wiring, hoveredStringId]);

  useEffect(() => {
    const nextKey = selected ? mpptKey(selected.inverter.id, selected.mppt.id) : null;
    if (selectedKey !== nextKey) {
      setSelectedKey(nextKey);
    }
  }, [selected, selectedKey]);

  const startBuilding = () => {
    setPendingPanels([]);
    setIsBuilding(true);
  };

  const cancelBuilding = () => {
    setPendingPanels([]);
    setIsBuilding(false);
  };

  const commitString = () => {
    if (!selected || pendingPanels.length === 0) return;
    addWiringString(selected.inverter.id, selected.mppt.id, pendingPanels);
    setPendingPanels([]);
    setIsBuilding(false);
  };

  const togglePanel = (arrayId: string, row: number, column: number) => {
    if (!isBuilding || !project.pv.arrays.some((array) => array.id === arrayId)) return;
    const key = panelKey(arrayId, row, column);
    if (assignedPanelKeys.has(key)) return;
    setPendingPanels((prev) => {
      const existingIndex = prev.findIndex(
        (panel) => panel.arrayId === arrayId && panel.row === row && panel.column === column,
      );
      if (existingIndex >= 0) {
        return prev.filter((_, index) => index !== existingIndex);
      }
      return [...prev, { arrayId, row, column }];
    });
  };

  return (
    <div className="panel-content wiring-page">
      <div className="wiring-layout">
        <aside className="wiring-sidebar">
          <header className="editor-header">
            <div>
              <h2>Bekabeling</h2>
              <p className="hint">
                Kies een MPPT, klik op panelen om een seriestring samen te stellen.
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
                        onClick={() => {
                          setSelectedKey(key);
                          cancelBuilding();
                        }}
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
            <p className="empty-state">Definieer eerst een inverter met MPPTs.</p>
          )}
        </aside>

        <div className="wiring-main">
          {selected ? (
            <>
              <div className="wiring-array-panel">
                <div className="wiring-array-header">
                  <div className="wiring-array-title">
                    <strong>PV arrays</strong>
                    <span className="wiring-dim">
                      Selecteer panelen uit alle arrays om één seriestring samen te stellen.
                    </span>
                  </div>
                </div>

                {project.pv.arrays.length > 0 ? (
                  <>
                    <div className="wiring-array-grids">
                      {project.pv.arrays.map((array) => (
                        <section key={array.id} className="wiring-array-grid-card" aria-label={`Array ${array.name}`}>
                          <header>
                            <strong>{array.name}</strong>
                            <span className="wiring-dim">
                              {array.rows} rijen × {array.columns} kolommen
                            </span>
                          </header>
                          <PanelGrid
                            array={array}
                            assignedKeys={assignedPanelKeys}
                            pendingPanels={pendingPanels}
                            highlightedStringPanelKeys={hoveredStringPanelKeys}
                            isBuilding={isBuilding}
                            onToggle={togglePanel}
                          />
                        </section>
                      ))}
                    </div>
                    <div className="wiring-legend">
                      <span className="legend-item legend-item--available">Beschikbaar</span>
                      <span className="legend-item legend-item--pending">Selectie</span>
                      <span className="legend-item legend-item--assigned">Toegewezen</span>
                      {hoveredStringId && (
                        <span className="legend-item legend-item--highlighted">Gemarkeerde string</span>
                      )}
                    </div>
                    <div className="wiring-actions">
                      {isBuilding ? (
                        <>
                          <span className="wiring-pending-count">
                            {pendingPanels.length} paneel{pendingPanels.length !== 1 ? 'en' : ''} geselecteerd
                          </span>
                          <button type="button" onClick={commitString} disabled={pendingPanels.length === 0}>
                            String bevestigen
                          </button>
                          <button type="button" className="secondary-button" onClick={cancelBuilding}>
                            Annuleren
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={startBuilding}>
                          + Nieuwe string
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="empty-state">Voeg eerst één of meer PV arrays toe.</p>
                )}
              </div>

              <div className="wiring-strings-panel">
                <div className="wiring-strings-header">
                  <h3>
                    {selected.inverter.name} · {selected.mppt.name}
                  </h3>
                  <dl className="array-stats">
                    <div>
                      <dt>Spanning</dt>
                      <dd>
                        {selected.mppt.vMinV}–{selected.mppt.vMaxV} V
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
                </div>

                <section className="sub-editor" aria-label="Aangesloten strings">
                  <header>
                    <h4>Aangesloten strings</h4>
                    <span className="string-count">{strings.length} parallel</span>
                  </header>
                  {strings.length > 0 ? (
                    strings.map((string, index) => {
                      const summary = summarizeString(string, project.pv.arrays, project.pv.panelTypes);
                      return (
                        <article
                          key={string.id}
                          className="string-card"
                          onMouseEnter={() => setHoveredStringId(string.id)}
                          onMouseLeave={() => setHoveredStringId(null)}
                        >
                          <div>
                            <strong>String {index + 1}</strong>
                            {summary && (
                              <small>
                                {`${summary.panelCount} panelen uit ${summary.arrayCount} array${summary.arrayCount !== 1 ? 's' : ''} · Vmp ${summary.vmpV.toFixed(0)} V · Voc ${summary.vocV.toFixed(0)} V · ${summary.pmaxW.toFixed(0)} Wp`}
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
            </>
          ) : (
            <div className="placeholder">
              <h2>Bekabeling</h2>
              <p>Definieer eerst een inverter en MPPT voordat je panelen aansluit.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
