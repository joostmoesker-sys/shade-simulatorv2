import { useEffect, useMemo, useState } from 'react';

import { getArrayDimensions } from '../map/pvArrayGeometry';
import { PANEL_DATABASE } from '../model/panelDatabase';
import { useProjectStore } from '../store/projectStore';
import type { PanelType, PVArray } from '../model/schema';

type NumberField = Extract<
  keyof PVArray,
  'rows' | 'columns' | 'azimuthDeg' | 'tiltDeg' | 'baseHeightM' | 'panelGapM' | 'rowGapM'
>;
type PanelNumberField = Extract<
  keyof PanelType,
  | 'pmaxW'
  | 'vmpV'
  | 'impA'
  | 'vocV'
  | 'iscA'
  | 'tempCoeffPmaxPctPerC'
  | 'tempCoeffVocPctPerC'
  | 'cells'
  | 'bypassDiodes'
  | 'widthM'
  | 'heightM'
>;

const wholeNumberFields: NumberField[] = ['rows', 'columns'];

export function PVArraysTab() {
  const project = useProjectStore((s) => s.project);
  const addPVArray = useProjectStore((s) => s.addPVArray);
  const updatePVArray = useProjectStore((s) => s.updatePVArray);
  const removePVArray = useProjectStore((s) => s.removePVArray);
  const addPanelType = useProjectStore((s) => s.addPanelType);
  const updatePanelType = useProjectStore((s) => s.updatePanelType);
  const removePanelType = useProjectStore((s) => s.removePanelType);
  const ensureDefaultPanelType = useProjectStore((s) => s.ensureDefaultPanelType);
  const selectedId = useProjectStore((s) => s.selectedPVArrayId);
  const setSelectedId = useProjectStore((s) => s.setSelectedPVArrayId);
  const [selectedPanelTypeId, setSelectedPanelTypeId] = useState<string | null>(
    project.pv.panelTypes[0]?.id ?? null,
  );

  useEffect(() => {
    ensureDefaultPanelType();
  }, [ensureDefaultPanelType]);

  useEffect(() => {
    if (!selectedId || !project.pv.arrays.some((array) => array.id === selectedId)) {
      setSelectedId(project.pv.arrays[0]?.id ?? null);
    }
  }, [project.pv.arrays, selectedId, setSelectedId]);

  useEffect(() => {
    if (!selectedPanelTypeId || !project.pv.panelTypes.some((panelType) => panelType.id === selectedPanelTypeId)) {
      setSelectedPanelTypeId(project.pv.panelTypes[0]?.id ?? null);
    }
  }, [project.pv.panelTypes, selectedPanelTypeId]);

  const selectedArray = project.pv.arrays.find((array) => array.id === selectedId) ?? null;
  const selectedPanelType = selectedArray
    ? project.pv.panelTypes.find((panelType) => panelType.id === selectedArray.panelTypeId)
    : null;
  const selectedPanelEditorType =
    project.pv.panelTypes.find((panelType) => panelType.id === selectedPanelTypeId) ??
    project.pv.panelTypes[0] ??
    null;

  const panelCount = selectedArray ? selectedArray.rows * selectedArray.columns : 0;
  const arrayWp = selectedPanelType ? panelCount * selectedPanelType.pmaxW : 0;
  const dimensions = useMemo(
    () =>
      selectedArray && selectedPanelType
        ? getArrayDimensions(selectedArray, selectedPanelType)
        : null,
    [selectedArray, selectedPanelType],
  );

  const handleAddArray = () => {
    const created = addPVArray();
    setSelectedId(created.id);
  };

  const handleAddPresetPanel = (presetIndex: string) => {
    const preset = PANEL_DATABASE[Number(presetIndex)];
    if (!preset) return;
    const created = addPanelType({
      manufacturer: preset.manufacturer,
      model: preset.model,
      pmaxW: preset.pmaxW,
      vmpV: preset.vmpV,
      impA: preset.impA,
      vocV: preset.vocV,
      iscA: preset.iscA,
      tempCoeffPmaxPctPerC: preset.tempCoeffPmaxPctPerC,
      tempCoeffVocPctPerC: preset.tempCoeffVocPctPerC,
      cells: preset.cells,
      bypassDiodes: preset.bypassDiodes,
      widthM: preset.widthM,
      heightM: preset.heightM,
    });
    setSelectedPanelTypeId(created.id);
  };

  const handleAddManualPanel = () => {
    const created = addPanelType();
    setSelectedPanelTypeId(created.id);
  };

  const updateNumber = (field: NumberField, rawValue: string) => {
    if (!selectedArray) return;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;
    updatePVArray(selectedArray.id, {
      [field]: wholeNumberFields.includes(field) ? Math.max(1, Math.trunc(value)) : value,
    });
  };

  const updatePanelNumber = (field: PanelNumberField, rawValue: string) => {
    if (!selectedPanelEditorType) return;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;
    updatePanelType(selectedPanelEditorType.id, {
      [field]: field === 'cells' || field === 'bypassDiodes' ? Math.max(1, Math.trunc(value)) : value,
    });
  };

  return (
    <div className="panel-content pv-arrays-tab">
      <aside className="editor-sidebar">
        <header className="editor-header">
          <div>
            <h2>PV Arrays</h2>
            <p className="hint">
              Voeg arrays toe en sleep ze op de kaart om ze te plaatsen en te draaien.
            </p>
          </div>
          <button type="button" onClick={handleAddArray}>
            Array toevoegen
          </button>
        </header>

        {project.pv.arrays.length > 0 ? (
          <ul className="entity-list" aria-label="PV arrays">
            {project.pv.arrays.map((array) => (
              <li key={array.id}>
                <button
                  type="button"
                  aria-current={array.id === selectedId ? 'true' : undefined}
                  onClick={() => setSelectedId(array.id)}
                >
                  <span>{array.name}</span>
                  <small>
                    {array.rows}×{array.columns} panelen
                  </small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">
            Nog geen PV arrays. Voeg een array toe om op de kaart te plaatsen.
          </p>
        )}

        {selectedArray && selectedPanelType && dimensions && (
          <>
            <dl className="array-stats">
              <div>
                <dt>Panelen</dt>
                <dd>{panelCount}</dd>
              </div>
              <div>
                <dt>DC vermogen</dt>
                <dd>{(arrayWp / 1000).toFixed(1)} kWp</dd>
              </div>
              <div>
                <dt>Afmeting</dt>
                <dd>
                  {dimensions.widthM.toFixed(1)} × {dimensions.depthM.toFixed(1)} m
                </dd>
              </div>
            </dl>

            <form className="property-form" aria-label="PV array eigenschappen">
              <label>
                Naam
                <input
                  value={selectedArray.name}
                  onChange={(e) => updatePVArray(selectedArray.id, { name: e.target.value })}
                />
              </label>
              <label>
                Paneeltype
                <select
                  value={selectedArray.panelTypeId}
                  onChange={(e) => {
                    updatePVArray(selectedArray.id, { panelTypeId: e.target.value });
                    setSelectedPanelTypeId(e.target.value);
                  }}
                >
                  {project.pv.panelTypes.map((panelType) => (
                    <option key={panelType.id} value={panelType.id}>
                      {panelType.manufacturer} {panelType.model} ({panelType.pmaxW} Wp)
                    </option>
                  ))}
                </select>
              </label>
              <div className="field-grid">
                <label>
                  Rijen
                  <input
                    type="number"
                    min={1}
                    value={selectedArray.rows}
                    onChange={(e) => updateNumber('rows', e.target.value)}
                  />
                </label>
                <label>
                  Kolommen
                  <input
                    type="number"
                    min={1}
                    value={selectedArray.columns}
                    onChange={(e) => updateNumber('columns', e.target.value)}
                  />
                </label>
                <label>
                  Oriëntatie
                  <select
                    value={selectedArray.orientation}
                    onChange={(e) =>
                      updatePVArray(selectedArray.id, {
                        orientation: e.target.value as PVArray['orientation'],
                      })
                    }
                  >
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </label>
                <label>
                  Azimuth (°)
                  <input
                    type="number"
                    min={0}
                    max={359}
                    value={selectedArray.azimuthDeg}
                    onChange={(e) => updateNumber('azimuthDeg', e.target.value)}
                  />
                </label>
                <label>
                  Tilt (°)
                  <input
                    type="number"
                    min={0}
                    max={90}
                    value={selectedArray.tiltDeg}
                    onChange={(e) => updateNumber('tiltDeg', e.target.value)}
                  />
                </label>
                <label>
                  Basishoogte (m)
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={selectedArray.baseHeightM}
                    onChange={(e) => updateNumber('baseHeightM', e.target.value)}
                  />
                </label>
                <label>
                  Paneelafstand (m)
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={selectedArray.panelGapM}
                    onChange={(e) => updateNumber('panelGapM', e.target.value)}
                  />
                </label>
                <label>
                  Rijafstand (m)
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={selectedArray.rowGapM}
                    onChange={(e) => updateNumber('rowGapM', e.target.value)}
                  />
                </label>
              </div>
              <button
                type="button"
                className="danger-button"
                onClick={() => removePVArray(selectedArray.id)}
              >
                Array verwijderen
              </button>
            </form>
          </>
        )}

        <section className="panel-editor" aria-label="Paneeldatabase en handmatige invoer">
          <h3>Paneeldatabase</h3>
          <label>
            Preset toevoegen
            <select defaultValue="" onChange={(e) => handleAddPresetPanel(e.target.value)}>
              <option value="" disabled>
                Kies paneel…
              </option>
              {PANEL_DATABASE.map((panel, index) => (
                <option key={panel.label} value={index}>
                  {panel.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={handleAddManualPanel}>
            Handmatig paneel toevoegen
          </button>

          {project.pv.panelTypes.length > 0 && (
            <label>
              Te bewerken paneeltype
              <select
                value={selectedPanelEditorType?.id ?? ''}
                onChange={(e) => setSelectedPanelTypeId(e.target.value)}
              >
                {project.pv.panelTypes.map((panelType) => (
                  <option key={panelType.id} value={panelType.id}>
                    {panelType.manufacturer} {panelType.model}
                  </option>
                ))}
              </select>
            </label>
          )}

          {selectedPanelEditorType && (
            <form className="property-form" aria-label="Paneeltype eigenschappen">
              <div className="field-grid">
                <label>
                  Fabrikant
                  <input
                    value={selectedPanelEditorType.manufacturer}
                    onChange={(e) =>
                      updatePanelType(selectedPanelEditorType.id, { manufacturer: e.target.value })
                    }
                  />
                </label>
                <label>
                  Model
                  <input
                    value={selectedPanelEditorType.model}
                    onChange={(e) => updatePanelType(selectedPanelEditorType.id, { model: e.target.value })}
                  />
                </label>
                <label>
                  Pmax (Wp)
                  <input
                    type="number"
                    min={1}
                    value={selectedPanelEditorType.pmaxW}
                    onChange={(e) => updatePanelNumber('pmaxW', e.target.value)}
                  />
                </label>
                <label>
                  Vmp (V)
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={selectedPanelEditorType.vmpV}
                    onChange={(e) => updatePanelNumber('vmpV', e.target.value)}
                  />
                </label>
                <label>
                  Imp (A)
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={selectedPanelEditorType.impA}
                    onChange={(e) => updatePanelNumber('impA', e.target.value)}
                  />
                </label>
                <label>
                  Voc (V)
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={selectedPanelEditorType.vocV}
                    onChange={(e) => updatePanelNumber('vocV', e.target.value)}
                  />
                </label>
                <label>
                  Isc (A)
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={selectedPanelEditorType.iscA}
                    onChange={(e) => updatePanelNumber('iscA', e.target.value)}
                  />
                </label>
                <label>
                  Pmax tempco (%/°C)
                  <input
                    type="number"
                    step={0.01}
                    value={selectedPanelEditorType.tempCoeffPmaxPctPerC}
                    onChange={(e) => updatePanelNumber('tempCoeffPmaxPctPerC', e.target.value)}
                  />
                </label>
                <label>
                  Voc tempco (%/°C)
                  <input
                    type="number"
                    step={0.01}
                    value={selectedPanelEditorType.tempCoeffVocPctPerC}
                    onChange={(e) => updatePanelNumber('tempCoeffVocPctPerC', e.target.value)}
                  />
                </label>
                <label>
                  Cellen
                  <input
                    type="number"
                    min={1}
                    value={selectedPanelEditorType.cells}
                    onChange={(e) => updatePanelNumber('cells', e.target.value)}
                  />
                </label>
                <label>
                  Bypassdiodes
                  <input
                    type="number"
                    min={1}
                    value={selectedPanelEditorType.bypassDiodes}
                    onChange={(e) => updatePanelNumber('bypassDiodes', e.target.value)}
                  />
                </label>
                <label>
                  Breedte (m)
                  <input
                    type="number"
                    min={0.1}
                    step={0.001}
                    value={selectedPanelEditorType.widthM}
                    onChange={(e) => updatePanelNumber('widthM', e.target.value)}
                  />
                </label>
                <label>
                  Hoogte (m)
                  <input
                    type="number"
                    min={0.1}
                    step={0.001}
                    value={selectedPanelEditorType.heightM}
                    onChange={(e) => updatePanelNumber('heightM', e.target.value)}
                  />
                </label>
              </div>
              <button
                type="button"
                className="danger-button"
                disabled={project.pv.arrays.some((array) => array.panelTypeId === selectedPanelEditorType.id)}
                onClick={() => removePanelType(selectedPanelEditorType.id)}
              >
                Paneeltype verwijderen
              </button>
            </form>
          )}
        </section>
      </aside>
    </div>
  );
}
