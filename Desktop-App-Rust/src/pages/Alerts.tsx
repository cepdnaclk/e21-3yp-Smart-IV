import { useState } from 'react';
import { CheckCircle, AlertTriangle, WifiOff, Droplets, Battery, Filter } from 'lucide-react';
import { useAlertsStore, useSettingsStore } from '../store';
import { AlertRow } from '../types';
import { format, formatDistanceToNow } from 'date-fns';
import { commands } from '../lib/tauriEvents';

const TYPE_META: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  BLOCKAGE:    { icon: <AlertTriangle size={14} />, label: 'Tube Blockage',    color: 'var(--red-400)' },
  EMPTY_BAG:   { icon: <Droplets size={14} />,      label: 'Bag Empty',        color: 'var(--red-400)' },
  CONN_LOST:   { icon: <WifiOff size={14} />,       label: 'Connection Lost',  color: 'var(--text-muted)' },
  BATTERY_LOW: { icon: <Battery size={14} />,       label: 'Battery Low',      color: 'var(--yellow-400)' },
};

export default function AlertsPage() {
  const { alerts, activeAlerts, resolveAlert } = useAlertsStore();
  const nurseName = useSettingsStore((s) => s.settings.nurseName);
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  const displayed = alerts.filter((a) => {
    if (filter === 'active') return !a.resolvedAt;
    if (filter === 'resolved') return !!a.resolvedAt;
    return true;
  }).filter((a) => typeFilter === 'ALL' || a.alertType === typeFilter);

  const handleResolve = async (alert: AlertRow) => {
    if (!window.confirm(`Are you sure you want to mark the alert for Bed ${alert.bedId} as resolved?`)) return;
    resolveAlert(alert.id, nurseName);
    await commands.resolveAlert(alert.id, nurseName);
  };

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">
          Alerts
          <span>{activeAlerts.length} active</span>
        </div>
        <div className="topbar-actions">
          {activeAlerts.length > 0 && (
            <div style={{
              padding: '5px 12px', background: 'var(--red-glow)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 99, fontSize: 12, color: 'var(--red-400)',
              display: 'flex', alignItems: 'center', gap: 5,
              animation: 'pulse-badge 1.5s ease-in-out infinite',
            }}>
              <AlertTriangle size={12} /> {activeAlerts.length} unresolved
            </div>
          )}
        </div>
      </div>

      <div className="page">
        {/* Filters */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="tabs">
            {(['all', 'active', 'resolved'] as const).map((f) => (
              <button key={f} className={`tab-btn ${filter === f ? 'active' : ''}`}
                onClick={() => setFilter(f)}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Filter size={13} style={{ color: 'var(--text-muted)' }} />
            <select className="form-select" style={{ padding: '6px 10px', fontSize: 12 }}
              value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="ALL">All Types</option>
              <option value="BLOCKAGE">Blockage</option>
              <option value="EMPTY_BAG">Empty Bag</option>
              <option value="CONN_LOST">Conn. Lost</option>
              <option value="BATTERY_LOW">Battery Low</option>
            </select>
          </div>
        </div>

        {/* Alerts table */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Alert Log</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{displayed.length} records</span>
          </div>
          {displayed.length === 0 ? (
            <div className="empty-state" style={{ padding: '40px 20px' }}>
              <CheckCircle size={40} style={{ opacity: 0.3, color: 'var(--green-400)' }} />
              <p>No alerts match your filter. All clear!</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Bed</th>
                  <th>Time</th>
                  <th>Duration</th>
                  <th>Status</th>
                  <th>Resolved By</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((alert) => {
                  const meta = TYPE_META[alert.alertType] ?? TYPE_META.BLOCKAGE;
                  const isActive = !alert.resolvedAt;
                  return (
                    <tr key={alert.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: meta.color, fontWeight: 600 }}>
                          {meta.icon} {meta.label}
                        </div>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>Bed {alert.bedId}</td>
                      <td className="mono">{format(new Date(alert.ts), 'dd/MM HH:mm:ss')}</td>
                      <td className="mono" style={{ color: 'var(--text-muted)' }}>
                        {alert.resolvedAt
                          ? `${Math.round((new Date(alert.resolvedAt).getTime() - new Date(alert.ts).getTime()) / 60000)} min`
                          : formatDistanceToNow(new Date(alert.ts), { addSuffix: true })}
                      </td>
                      <td>
                        {isActive ? (
                          <span className="status-badge alert">
                            <span className="status-dot" /> Active
                          </span>
                        ) : (
                          <span className="status-badge stable">
                            <span className="status-dot" /> Resolved
                          </span>
                        )}
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                        {alert.resolvedBy ?? '-'}
                      </td>
                      <td>
                        {isActive && (
                          <button className="btn btn-sm btn-ghost" onClick={() => handleResolve(alert)}>
                            <CheckCircle size={12} /> Resolve
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
