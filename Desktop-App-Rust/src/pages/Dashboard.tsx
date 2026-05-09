import { useState, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { useBedsStore, useSerialStore } from '../store';
import WardGrid from '../components/WardGrid';
import BedDetailModal from '../components/BedDetailModal';
import { LiveBedState } from '../types';

export default function Dashboard() {
  const bedsMap = useBedsStore((s) => s.beds);
  const beds = useMemo(() => Object.values(bedsMap), [bedsMap]);
  const { connected } = useSerialStore();
  const [selectedBed, setSelectedBed] = useState<LiveBedState | null>(null);

  const stats = useMemo(() => ({
    total: beds.length,
    stable: beds.filter((b) => b.status === 'STABLE').length,
    alerts: beds.filter((b) => b.status === 'BLOCKAGE' || b.status === 'EMPTY_BAG').length,
    connLost: beds.filter((b) => b.status === 'CONN_LOST').length,
    avgFlow: beds.length > 0 ? beds.reduce((s, b) => s + b.flowRate, 0) / beds.length : 0,
    lowBattery: beds.filter((b) => b.battery < 20).length,
  }), [beds]);

  return (
    <>
      {/* Topbar */}
      <div className="topbar">
        <div className="topbar-title">
          Ward Dashboard
          <span>Real-time IV monitoring</span>
        </div>
        <div className="topbar-actions">
          <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
            <RefreshCw size={11} style={{ animation: connected ? 'spin 3s linear infinite' : 'none' }} />
            {connected ? 'Live' : 'Paused'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {new Date().toLocaleTimeString()}
          </div>
        </div>
      </div>

      <div className="page">

        {/* Stats row */}
        <div className="stats-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="stat-card">
            <div className="stat-label">Total Beds</div>
            <div className="stat-value blue">{stats.total}</div>
            <div className="stat-sub">Active infusions</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Stable</div>
            <div className="stat-value green">{stats.stable}</div>
            <div className="stat-sub">Running normally</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Active Alerts</div>
            <div className={`stat-value ${stats.alerts > 0 ? 'red' : 'green'}`}>{stats.alerts}</div>
            <div className="stat-sub">Require attention</div>
          </div>
        </div>


        {/* Secondary stats */}
        {(stats.connLost > 0 || stats.lowBattery > 0) && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
            {stats.connLost > 0 && (
              <div style={{
                padding: '8px 14px', background: 'rgba(100,116,139,0.1)',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 6, alignItems: 'center',
              }}>
                {stats.connLost} bed{stats.connLost > 1 ? 's' : ''} disconnected - continuing infusion locally
              </div>
            )}
            {stats.lowBattery > 0 && (
              <div style={{
                padding: '8px 14px', background: 'rgba(234,179,8,0.08)',
                border: '1px solid rgba(234,179,8,0.2)', borderRadius: 'var(--radius-sm)',
                fontSize: 12, color: 'var(--yellow-400)', display: 'flex', gap: 6, alignItems: 'center',
              }}>
                {stats.lowBattery} bed{stats.lowBattery > 1 ? 's' : ''} with low battery
              </div>
            )}
          </div>
        )}

        {/* Ward grid */}
        <WardGrid onSelectBed={setSelectedBed} />
      </div>

      {/* Bed detail modal */}
      {selectedBed && (
        <BedDetailModal bed={selectedBed} onClose={() => setSelectedBed(null)} />
      )}
    </>
  );
}
