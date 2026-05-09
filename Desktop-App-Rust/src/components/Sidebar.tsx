import { NavLink } from 'react-router-dom';
import { useState } from 'react';
import {
  LayoutDashboard, History, Bell, Settings,
  Activity, Wifi, WifiOff, Cloud, CloudOff,
  FlaskConical, FlaskConicalOff
} from 'lucide-react';
import { useSerialStore, useAlertsStore, useBedsStore } from '../store';
import { format } from 'date-fns';
import { startSimulation, stopSimulation } from '../mock/simulator';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
  { path: '/history', label: 'History', icon: <History size={16} /> },
  { path: '/alerts', label: 'Alerts', icon: <Bell size={16} /> },
  { path: '/settings', label: 'Settings', icon: <Settings size={16} /> },
];

export default function Sidebar() {
  const { connected, port, mqttConnected, packetCount } = useSerialStore();
  const activeAlerts = useAlertsStore((s) => s.activeAlerts);
  const [simRunning, setSimRunning] = useState(false);
  const now = new Date();

  const handleSimToggle = () => {
    if (simRunning) {
      if (!window.confirm('Stop the simulation? All mock data will be cleared.')) return;
      stopSimulation();
      // Clear beds store so the grid goes back to empty
      useBedsStore.getState().clearBeds?.();
      setSimRunning(false);
    } else {
      if (!window.confirm('Start simulation mode? This will populate the ward with 16 mock beds for demonstration purposes.')) return;
      startSimulation();
      setSimRunning(true);
    }
  };

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="logo-mark">
          <div className="logo-icon">
            <Activity size={20} color="#fff" />
          </div>
          <div>
            <div className="logo-text">Smart<span>IV</span></div>
            <div className="logo-sub">NURSE STATION v1.0</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        <div className="nav-section-label">Navigation</div>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.path === '/'}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
            {item.path === '/alerts' && activeAlerts.length > 0 && (
              <span style={{
                marginLeft: 'auto', background: 'var(--red-500)',
                color: '#fff', fontSize: 10, fontWeight: 700,
                padding: '1px 6px', borderRadius: 99,
              }}>
                {activeAlerts.length}
              </span>
            )}
          </NavLink>
        ))}

        {/* Simulation Mode */}
        <div className="nav-section-label" style={{ marginTop: 12 }}>Developer</div>
        <button
          onClick={handleSimToggle}
          className="nav-item"
          style={{
            width: '100%',
            border: simRunning ? '1px solid rgba(255,179,0,0.4)' : '1px solid transparent',
            background: simRunning ? 'rgba(255,179,0,0.08)' : 'transparent',
            color: simRunning ? 'var(--yellow-500)' : 'var(--text-secondary)',
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
          }}
        >
          <span className="nav-icon">
            {simRunning ? <FlaskConicalOff size={16} /> : <FlaskConical size={16} />}
          </span>
          {simRunning ? 'Stop Simulation' : 'Simulate Ward'}
        </button>
      </nav>

      {/* Footer: connection status */}
      <div className="sidebar-footer">
        <div className="nav-section-label">System Status</div>

        {simRunning && (
          <div style={{
            padding: '6px 10px', marginBottom: 6,
            background: 'rgba(255,179,0,0.1)',
            border: '1px solid rgba(255,179,0,0.3)',
            borderRadius: 'var(--radius-sm)',
            fontSize: 11, color: 'var(--yellow-500)',
            display: 'flex', alignItems: 'center', gap: 6,
            fontWeight: 600,
          }}>
            <FlaskConical size={11} />
            Simulation Active
          </div>
        )}

        <div className="conn-status" style={{ marginBottom: 6 }}>
          <div className={`conn-dot ${connected ? '' : 'disconnected'}`} />
          <div className="conn-label">
            <strong>Serial / USB</strong>
            {connected ? port : 'Not Connected'}
          </div>
          {connected ? <Wifi size={12} style={{ color: 'var(--green-500)' }} /> : <WifiOff size={12} style={{ color: 'var(--red-500)' }} />}
        </div>

        <div className="conn-status" style={{ marginBottom: 6 }}>
          <div className={`conn-dot ${mqttConnected ? '' : 'disconnected'}`} />
          <div className="conn-label">
            <strong>AWS IoT / MQTT</strong>
            {mqttConnected ? 'Connected' : 'Offline'}
          </div>
          {mqttConnected ? <Cloud size={12} style={{ color: 'var(--green-500)' }} /> : <CloudOff size={12} style={{ color: 'var(--text-muted)' }} />}
        </div>

        <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '6px 4px', display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Activity size={10} /> {packetCount} packets
          </span>
          <span>{format(now, 'HH:mm')}</span>
        </div>
      </div>
    </aside>
  );
}
