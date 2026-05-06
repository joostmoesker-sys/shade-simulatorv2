import { useEffect, useState } from 'react';

import { useProjectStore } from '../store/projectStore';
import type { BuildingObject, SceneObject, TreeObject } from '../model/schema';

type TreeNumberField = Extract<keyof TreeObject, 'heightM' | 'crownRadiusM' | 'trunkHeightM' | 'density'>;
type BuildingNumberField = Extract<keyof BuildingObject, 'heightM'>;
type Undergrowth = TreeObject['undergrowth'];

const UNDERGROWTH_OPTIONS: { value: Undergrowth; label: string }[] = [
  { value: 'none', label: 'Geen ondergroei' },
  { value: 'grass', label: 'Gras / laag' },
  { value: 'shrubs', label: 'Struiken' },
  { value: 'dense', label: 'Dichte ondergroei' },
];

function objectLabel(object: SceneObject): string {
  return object.kind === 'tree' ? 'Boom' : 'Gebouw';
}

export function ObjectsTab() {
  const project = useProjectStore((s) => s.project);
  const addSceneObject = useProjectStore((s) => s.addSceneObject);
  const updateSceneObject = useProjectStore((s) => s.updateSceneObject);
  const removeSceneObject = useProjectStore((s) => s.removeSceneObject);
  const selectedId = useProjectStore((s) => s.selectedSceneObjectId);
  const setSelectedId = useProjectStore((s) => s.setSelectedSceneObjectId);
  const objectMapAddKind = useProjectStore((s) => s.objectMapAddKind);
  const setObjectMapAddKind = useProjectStore((s) => s.setObjectMapAddKind);
  const [footprintText, setFootprintText] = useState('');
  const [footprintError, setFootprintError] = useState<string | null>(null);

  const selectedObject = project.scene.objects.find((object) => object.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId || !project.scene.objects.some((object) => object.id === selectedId)) {
      setSelectedId(project.scene.objects[0]?.id ?? null);
    }
  }, [project.scene.objects, selectedId, setSelectedId]);

  useEffect(() => {
    if (selectedObject?.kind === 'building') {
      setFootprintText(JSON.stringify(selectedObject.footprint, null, 2));
      setFootprintError(null);
    }
  }, [selectedObject]);

  const handleAdd = (kind: 'tree' | 'building') => {
    const created = addSceneObject({ kind });
    setSelectedId(created.id);
  };

  const updateNumber = (field: TreeNumberField | BuildingNumberField, rawValue: string) => {
    if (!selectedObject) return;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;
    updateSceneObject(selectedObject.id, { [field]: value } as Partial<SceneObject>);
  };

  const updatePosition = (axis: 'lat' | 'lon', rawValue: string) => {
    if (!selectedObject) return;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;
    updateSceneObject(selectedObject.id, {
      position: { ...selectedObject.position, [axis]: value },
    } as Partial<SceneObject>);
  };

  const applyFootprint = () => {
    if (selectedObject?.kind !== 'building') return;
    try {
      const parsed = JSON.parse(footprintText) as [number, number][];
      updateSceneObject(selectedObject.id, { footprint: parsed } as Partial<SceneObject>);
      setFootprintError(null);
    } catch (err) {
      setFootprintError((err as Error).message);
    }
  };

  return (
    <div className="panel-content editor-page">
      <aside className="editor-sidebar">
        <header className="editor-header">
          <div>
            <h2>Objecten</h2>
            <p className="hint">Maak schaduwobjecten aan voor bomen en gebouwen.</p>
          </div>
          <div className="button-row">
            <button type="button" onClick={() => handleAdd('tree')}>
              Boom toevoegen
            </button>
            <button type="button" onClick={() => handleAdd('building')}>
              Gebouw toevoegen
            </button>
            <button
              type="button"
              aria-pressed={objectMapAddKind === 'tree'}
              onClick={() => setObjectMapAddKind(objectMapAddKind === 'tree' ? null : 'tree')}
            >
              Boom op kaart
            </button>
            <button
              type="button"
              aria-pressed={objectMapAddKind === 'building'}
              onClick={() => setObjectMapAddKind(objectMapAddKind === 'building' ? null : 'building')}
            >
              Gebouw op kaart
            </button>
          </div>
        </header>

        {project.scene.objects.length > 0 ? (
          <ul className="entity-list" aria-label="Schaduwobjecten">
            {project.scene.objects.map((object) => (
              <li key={object.id}>
                <button
                  type="button"
                  aria-current={object.id === selectedId ? 'true' : undefined}
                  onClick={() => setSelectedId(object.id)}
                >
                  <span>{object.name}</span>
                  <small>
                    {objectLabel(object)} · {object.position.lat.toFixed(5)}, {object.position.lon.toFixed(5)}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">Nog geen objecten. Voeg een boom of gebouw toe.</p>
        )}
      </aside>

      <section className="editor-detail">
        {selectedObject ? (
          <form className="property-form object-form" aria-label="Object eigenschappen">
            <h3>{objectLabel(selectedObject)}</h3>
            <label>
              Naam
              <input
                value={selectedObject.name}
                onChange={(e) => updateSceneObject(selectedObject.id, { name: e.target.value })}
              />
            </label>
            <div className="field-grid">
              <label>
                Latitude
                <input
                  type="number"
                  step={0.00001}
                  value={selectedObject.position.lat}
                  onChange={(e) => updatePosition('lat', e.target.value)}
                />
              </label>
              <label>
                Longitude
                <input
                  type="number"
                  step={0.00001}
                  value={selectedObject.position.lon}
                  onChange={(e) => updatePosition('lon', e.target.value)}
                />
              </label>
            </div>

            {selectedObject.kind === 'tree' ? (
              <>
                <div className="field-grid">
                  <label>
                    Hoogte (m)
                    <input
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={selectedObject.heightM}
                      onChange={(e) => updateNumber('heightM', e.target.value)}
                    />
                  </label>
                  <label>
                    Kroonradius (m)
                    <input
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={selectedObject.crownRadiusM}
                      onChange={(e) => updateNumber('crownRadiusM', e.target.value)}
                    />
                  </label>
                  <label>
                    Stamhoogte (m)
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={selectedObject.trunkHeightM}
                      onChange={(e) => updateNumber('trunkHeightM', e.target.value)}
                    />
                  </label>
                  <label>
                    Dichtheid
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      value={selectedObject.density}
                      onChange={(e) => updateNumber('density', e.target.value)}
                    />
                  </label>
                </div>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedObject.deciduous}
                    onChange={(e) =>
                      updateSceneObject(selectedObject.id, { deciduous: e.target.checked } as Partial<SceneObject>)
                    }
                  />
                  Bladverliezend
                </label>
                <label>
                  Ondergroei
                  <select
                    value={selectedObject.undergrowth}
                    onChange={(e) =>
                      updateSceneObject(selectedObject.id, {
                        undergrowth: e.target.value as Undergrowth,
                      } as Partial<SceneObject>)
                    }
                  >
                    {UNDERGROWTH_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <>
                <label>
                  Hoogte (m)
                  <input
                    type="number"
                    min={0.1}
                    step={0.1}
                    value={selectedObject.heightM}
                    onChange={(e) => updateNumber('heightM', e.target.value)}
                  />
                </label>
                <label>
                  Footprint [[lon, lat], ...]
                  <textarea
                    rows={6}
                    value={footprintText}
                    onChange={(e) => setFootprintText(e.target.value)}
                    onBlur={applyFootprint}
                  />
                </label>
                {footprintError && (
                  <p role="alert" className="error">
                    Ongeldige footprint: {footprintError}
                  </p>
                )}
              </>
            )}

            <button type="button" className="danger-button" onClick={() => removeSceneObject(selectedObject.id)}>
              Object verwijderen
            </button>
          </form>
        ) : (
          <div className="placeholder">
            <h2>Objecteditor</h2>
            <p>Voeg een boom of gebouw toe om de eigenschappen te bewerken.</p>
          </div>
        )}
      </section>
    </div>
  );
}
