import { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import './index.css';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import AlertsPage from './pages/Alerts';
import Settings from './pages/Settings';
import { bootstrapTauriEvents } from './lib/tauriEvents';

export default function App() {
  useEffect(() => {
    bootstrapTauriEvents();
  }, []);

  return (
    <HashRouter>
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/history" element={<History />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
