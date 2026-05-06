import { useEffect, useState } from 'react';

import { useProjectStore } from '../store/projectStore';
import type { Inverter, MPPT } from '../model/schema';

type InverterNumberField = Extract<
  keyof Inverter,
  'pAcNomW' | 'pAcMaxW' | 'pDcMaxW' | 'pBatteryMaxW' | 'efficiency' | 'standbyW'
>;
type MPPTNumberField = Extract<keyof MPPT, 'vMinV' | 'vMaxV' | 'vStartV' | 'iMaxA' | 'iScMaxA' | 'pMaxW'>;

export function InvertersTab() {
  const project = useProjectStore((s) => s.project);
  const addInverter = useProjectStore((s) => s.addInverter);
  const updateInverter = useProjectStore((s) => s.updateInverter);
  const removeInverter = useProjectStore((s) => s.removeInverter);
  const addMPPT = useProjectStore((s) => s.addMPPT);
  const updateMPPT = useProjectStore((s) => s.updateMPPT);
  const removeMPPT = useProjectStore((s) => s.removeMPPT);
  const [selectedId, setSelectedId] = useState<string | null>(project.electrical.inverters[0]?.id ?? null);

  useEffect(() => {
    if (!selectedId || !project.electrical.inverters.some((inverter) => inverter.id === selectedId)) {
      setSelectedId(project.electrical.inverters[0]?.id ?? null);
    }
  }, [project.electrical.inverters, selectedId]);

  const selectedInverter =
    project.electrical.inverters.find((inverter) => inverter.id === selectedId) ?? null;

  const handleAddInverter = () => {
    const created = addInverter();
    setSelectedId(created.id);
  };

  const updateInverterNumber = (field: InverterNumberField, rawValue: string) => {
    if (!selectedInverter) return;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;
    updateInverter(selectedInverter.id, { [field]: value });
  };

  const updateMPPTNumber = (mppt: MPPT, field: MPPTNumberField, rawValue: string) => {
    if (!selectedInverter) return;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;
    updateMPPT(selectedInverter.id, mppt.id, { [field]: value });
  };

  return (
    <div className="panel-content editor-page">
      <aside className="editor-sidebar">
        <header className="editor-header">
          <div>
            <h2>Inverters</h2>
            <p className="hint">Configureer omvormers en MPPT-ingangen.</p>
          </div>
          <button type="button" onClick={handleAddInverter}>
            Inverter toevoegen
          </button>
        </header>

        {project.electrical.inverters.length > 0 ? (
          <ul className="entity-list" aria-label="Inverters">
            {project.electrical.inverters.map((inverter) => (
              <li key={inverter.id}>
                <button
                  type="button"
                  aria-current={inverter.id === selectedId ? 'true' : undefined}
                  onClick={() => setSelectedId(inverter.id)}
                >
                  <span>{inverter.name}</span>
                  <small>
                    {(inverter.pAcNomW / 1000).toFixed(1)} kW AC · {inverter.mppts.length} MPPT
                  </small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">Nog geen inverters. Voeg een inverter toe.</p>
        )}
      </aside>

      <section className="editor-detail">
        {selectedInverter ? (
          <form className="property-form inverter-form" aria-label="Inverter eigenschappen">
            <h3>{selectedInverter.name}</h3>
            <label>
              Naam
              <input
                value={selectedInverter.name}
                onChange={(e) => updateInverter(selectedInverter.id, { name: e.target.value })}
              />
            </label>
            <div className="field-grid">
              <label>
                Nominaal AC (W)
                <input
                  type="number"
                  min={1}
                  value={selectedInverter.pAcNomW}
                  onChange={(e) => updateInverterNumber('pAcNomW', e.target.value)}
                />
              </label>
              <label>
                Max AC (W)
                <input
                  type="number"
                  min={1}
                  value={selectedInverter.pAcMaxW}
                  onChange={(e) => updateInverterNumber('pAcMaxW', e.target.value)}
                />
              </label>
              <label>
                Max DC (W)
                <input
                  type="number"
                  min={1}
                  value={selectedInverter.pDcMaxW}
                  onChange={(e) => updateInverterNumber('pDcMaxW', e.target.value)}
                />
              </label>
              <label>
                Max batterij (W)
                <input
                  type="number"
                  min={0}
                  value={selectedInverter.pBatteryMaxW}
                  onChange={(e) => updateInverterNumber('pBatteryMaxW', e.target.value)}
                />
              </label>
              <label>
                Rendement
                <input
                  type="number"
                  min={0.01}
                  max={1}
                  step={0.01}
                  value={selectedInverter.efficiency}
                  onChange={(e) => updateInverterNumber('efficiency', e.target.value)}
                />
              </label>
              <label>
                Standby (W)
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={selectedInverter.standbyW}
                  onChange={(e) => updateInverterNumber('standbyW', e.target.value)}
                />
              </label>
            </div>

            <section className="sub-editor" aria-label="MPPT editor">
              <header>
                <h4>MPPT's</h4>
                <button type="button" onClick={() => addMPPT(selectedInverter.id)}>
                  MPPT toevoegen
                </button>
              </header>
              {selectedInverter.mppts.map((mppt) => (
                <fieldset key={mppt.id}>
                  <legend>{mppt.name}</legend>
                  <label>
                    Naam
                    <input
                      value={mppt.name}
                      onChange={(e) => updateMPPT(selectedInverter.id, mppt.id, { name: e.target.value })}
                    />
                  </label>
                  <div className="field-grid">
                    <label>
                      Vmin (V)
                      <input
                        type="number"
                        min={0.1}
                        step={1}
                        value={mppt.vMinV}
                        onChange={(e) => updateMPPTNumber(mppt, 'vMinV', e.target.value)}
                      />
                    </label>
                    <label>
                      Vmax (V)
                      <input
                        type="number"
                        min={0.1}
                        step={1}
                        value={mppt.vMaxV}
                        onChange={(e) => updateMPPTNumber(mppt, 'vMaxV', e.target.value)}
                      />
                    </label>
                    <label>
                      Vstart (V)
                      <input
                        type="number"
                        min={0.1}
                        step={1}
                        value={mppt.vStartV}
                        onChange={(e) => updateMPPTNumber(mppt, 'vStartV', e.target.value)}
                      />
                    </label>
                    <label>
                      Imax (A)
                      <input
                        type="number"
                        min={0.1}
                        step={0.1}
                        value={mppt.iMaxA}
                        onChange={(e) => updateMPPTNumber(mppt, 'iMaxA', e.target.value)}
                      />
                    </label>
                    <label>
                      Isc max (A)
                      <input
                        type="number"
                        min={0.1}
                        step={0.1}
                        value={mppt.iScMaxA}
                        onChange={(e) => updateMPPTNumber(mppt, 'iScMaxA', e.target.value)}
                      />
                    </label>
                    <label>
                      Pmax (W)
                      <input
                        type="number"
                        min={1}
                        value={mppt.pMaxW}
                        onChange={(e) => updateMPPTNumber(mppt, 'pMaxW', e.target.value)}
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    className="danger-button"
                    disabled={selectedInverter.mppts.length <= 1}
                    onClick={() => removeMPPT(selectedInverter.id, mppt.id)}
                  >
                    MPPT verwijderen
                  </button>
                </fieldset>
              ))}
            </section>

            <button type="button" className="danger-button" onClick={() => removeInverter(selectedInverter.id)}>
              Inverter verwijderen
            </button>
          </form>
        ) : (
          <div className="placeholder">
            <h2>Inverter- en MPPT-editor</h2>
            <p>Voeg een inverter toe om MPPT-ingangen te configureren.</p>
          </div>
        )}
      </section>
    </div>
  );
}
