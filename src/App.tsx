import { LocationTab } from './components/LocationTab';
import { PVArraysTab } from './components/PVArraysTab';
import { PROJECT_TABS, useProjectStore } from './store/projectStore';

import './app.css';

export function App() {
  const activeTab = useProjectStore((s) => s.activeTab);
  const setActiveTab = useProjectStore((s) => s.setActiveTab);
  const projectName = useProjectStore((s) => s.project.name);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Shade Simulator v2</h1>
        <span className="project-name">{projectName}</span>
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
      <main className="app-main">
        {activeTab === 'locatie' && <LocationTab />}
        {activeTab === 'pv-arrays' && <PVArraysTab />}
        {activeTab !== 'locatie' && activeTab !== 'pv-arrays' && (
          <div className="placeholder">
            <h2>{PROJECT_TABS.find((t) => t.id === activeTab)?.label}</h2>
            <p>Deze stap wordt geïmplementeerd in een latere fase.</p>
          </div>
        )}
      </main>
    </div>
  );
}
