import { useEffect, useMemo, useState } from 'react';

import { PVArrayMap } from '../map/PVArrayMap';
import { getArrayDimensions } from '../map/pvArrayGeometry';
import { useProjectStore } from '../store/projectStore';
import type { LatLon, PVArray } from '../model/schema';

type NumberField = Extract<
  keyof PVArray,
  'rows' | 'columns' | 'azimuthDeg' | 'tiltDeg' | 'baseHeightM' | 'panelGapM' | 'rowGapM'
>;

const wholeNumberFields: NumberField[] = ['rows', 'columns'];

export function PVArraysTab() {
  const project = useProjectStore((s) => s.project);
  const addPVArray = useProjectStore((s) => s.addPVArray);
  const updatePVArray = useProjectStore((s) => s.updatePVArray);
  const removePVArray = useProjectStore((s) => s.removePVArray);
  const ensureDefaultPanelType = useProjectStore((s) => s.ensureDefaultPanelType);
  const [selectedId, setSelectedId] = useState<string | null>(project.pv.arrays[0]?.id ?? null);

  useEffect(() => {
    ensureDefaultPanelType();
  }, [ensureDefaultPanelType]);

  useEffect(() => {
    if (!selectedId || !project.pv.arrays.some((array) => array.id === selectedId)) {
      setSelectedId(project.pv.arrays[0]?.id ?? null);
    }
  }, [project.pv.arrays, selectedId]);

  const selectedArray = project.pv.arrays.find((array) => array.id === selectedId) ?? null;
  const selectedPanelType = selectedArray
    ? project.pv.panelTypes.find((panelType) => panelType.id === selectedArray.panelTypeId)
    : null;

  const panelCount = selectedArray ? selectedArray.rows * selectedArray.columns : 0;
  const arrayWp = selectedPanelType ? panelCount * selectedPanelType.pmaxW : 0;
  const dimensions = useMemo(
    () =>
      selectedArray && selectedPanelType
        ? getArrayDimensions(selectedArray, selectedPanelType)
        : null,
    [selectedArray, selectedPanelType],
  );

  const mapCenter: LatLon = {
    lat: project.location.lat,
    lon: project.location.lon,
  };

  const handleAddArray = () => {
    const created = addPVArray();
    setSelectedId(created.id);
  };

  const updateNumber = (field: NumberField, rawValue: string) => {
    if (!selectedArray) return;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;
    updatePVArray(selectedArray.id, {
      [field]: wholeNumberFields.includes(field) ? Math.max(1, Math.trunc(value)) : value,
    });
  };

  return (
    <div className="pv-arrays-tab">
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
      </aside>

      <div className="pv-array-map-container">
        <PVArrayMap
          arrays={project.pv.arrays}
          panelTypes={project.pv.panelTypes}
          selectedId={selectedId}
          center={mapCenter}
          onSelect={setSelectedId}
          onMove={(id, position) => updatePVArray(id, { position })}
          onRotate={(id, azimuthDeg) => updatePVArray(id, { azimuthDeg })}
        />
      </div>
    </div>
  );
}
