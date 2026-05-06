import { LocationTab } from './components/LocationTab';
import { InvertersTab } from './components/InvertersTab';
import { ObjectsTab } from './components/ObjectsTab';
import { PVArraysTab } from './components/PVArraysTab';
import { ProjectFileActions } from './components/ProjectFileActions';
import { SimulationTab } from './components/SimulationTab';
import { StorageLoadsTab } from './components/StorageLoadsTab';
import { WiringTab } from './components/WiringTab';
import { ProjectMap } from './map/ProjectMap';
import { PROJECT_TABS, useProjectStore } from './store/projectStore';

import './app.css';

export function App() {
  const activeTab = useProjectStore((s) => s.activeTab);
  const setActiveTab = useProjectStore((s) => s.setActiveTab);
  const projectName = useProjectStore((s) => s.project.name);
  const panelOnly = activeTab === 'bekabeling';

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Shade Simulator v2</h1>
        <span className="project-name">{projectName}</span>
        <ProjectFileActions />
      </header>
      <nav className="app-tabs" aria-label="Projectstappen">
        {PROJECT_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-current={activeTab === tab.id ? 'page' : undefined}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <main className={`app-main${panelOnly ? ' app-main--panel-only' : ''}`}>
        {!panelOnly && <ProjectMap />}
        <section className={`app-panel${panelOnly ? ' app-panel--full' : ''}`} aria-label="Projecteigenschappen">
          {activeTab === 'locatie' && <LocationTab />}
          {activeTab === 'objecten' && <ObjectsTab />}
          {activeTab === 'pv-arrays' && <PVArraysTab />}
          {activeTab === 'inverters' && <InvertersTab />}
          {activeTab === 'bekabeling' && <WiringTab />}
          {activeTab === 'accu-verbruik' && <StorageLoadsTab />}
          {activeTab === 'simulatie' && <SimulationTab />}
          {activeTab !== 'locatie' &&
            activeTab !== 'objecten' &&
            activeTab !== 'pv-arrays' &&
            activeTab !== 'inverters' &&
            activeTab !== 'bekabeling' &&
            activeTab !== 'accu-verbruik' &&
            activeTab !== 'simulatie' && (
              <div className="placeholder">
                <h2>{PROJECT_TABS.find((t) => t.id === activeTab)?.label}</h2>
                <p>Deze stap wordt geïmplementeerd in een latere fase.</p>
              </div>
            )}
        </section>
      </main>
    </div>
  );
}
