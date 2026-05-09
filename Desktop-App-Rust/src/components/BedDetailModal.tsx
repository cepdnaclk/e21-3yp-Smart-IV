import { X, Droplets, Activity, Battery, Clock } from 'lucide-react';

import { LiveBedState } from '../types';
import { format } from 'date-fns';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';

interface BedDetailModalProps {
  bed: LiveBedState;
  onClose: () => void;
}

// Generate sparkline history from current value (mock for dev)
function mockHistory(base: number, count = 20): { t: string; v: number }[] {
  return Array.from({ length: count }, (_, i) => ({
    t: format(new Date(Date.now() - (count - i) * 60000), 'HH:mm'),
    v: parseFloat((base + (Math.random() - 0.5) * 15).toFixed(1)),
  }));
}

export default function BedDetailModal({ bed, onClose }: BedDetailModalProps) {
  const flowHistory = mockHistory(bed.flowRate);
  const volPct = bed.maxVolume > 0 ? (bed.volRemaining / bed.maxVolume) * 100 : 0;
  const eta = bed.flowRate > 0 ? (bed.volRemaining / bed.flowRate) * 60 : null; // minutes

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 580 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
              Bed {bed.bedId}
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: '4px 0' }}>{bed.patientName}</h2>
            <span className={`status-badge ${bed.status === 'STABLE' ? 'stable' : bed.status === 'CONN_LOST' ? 'conn-lost' : 'alert'}`}>
              <span className="status-dot" /> {bed.status}
            </span>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={14} /></button>
        </div>

        {/* Key metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Flow Rate', value: `${bed.flowRate.toFixed(1)}`, unit: 'mL/hr', icon: <Activity size={14} /> },
            { label: 'Target', value: `${bed.targetMlhr}`, unit: 'mL/hr', icon: <Droplets size={14} /> },
            { label: 'Remaining', value: `${Math.round(bed.volRemaining)}`, unit: 'mL', icon: <Droplets size={14} /> },
            { label: 'Battery', value: `${bed.battery.toFixed(2)}`, unit: '%', icon: <Battery size={14} /> },
          ].map((m) => (
            <div key={m.label} className="metric-block" style={{ textAlign: 'center' }}>
              <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{m.icon}</div>
              <div className="metric-label">{m.label}</div>
              <div className="metric-value" style={{ fontSize: 22 }}>{m.value}<small>{m.unit}</small></div>
            </div>
          ))}
        </div>

        {/* ETA */}
        {eta !== null && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', background: 'var(--bg-elevated)',
            borderRadius: 'var(--radius-sm)', marginBottom: 16,
            fontSize: 13, color: 'var(--text-secondary)',
          }}>
            <Clock size={14} />
            Estimated completion:{' '}
            <strong style={{ color: 'var(--text-primary)', marginLeft: 4 }}>
              {eta < 60
                ? `${Math.round(eta)} min`
                : `${Math.floor(eta / 60)}h ${Math.round(eta % 60)}m`}
            </strong>
            <span style={{ marginLeft: 4 }}>
              ({format(new Date(Date.now() + eta * 60000), 'HH:mm')})
            </span>
          </div>
        )}

        {/* Volume bar */}
        <div className="progress-section" style={{ marginBottom: 20 }}>
          <div className="progress-label">
            <span>Volume Remaining ({volPct.toFixed(0)}%)</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>
              {Math.round(bed.volRemaining)} / {bed.maxVolume} mL
            </span>
          </div>
          <div className="progress-bar" style={{ height: 10 }}>
            <div
              className={`progress-fill ${volPct < 20 ? 'low' : ''}`}
              style={{ width: `${volPct}%` }}
            />
          </div>
        </div>

        {/* Flow chart */}
        <div className="panel" style={{ marginBottom: 0 }}>
          <div className="panel-header">
            <span className="panel-title">Flow Rate History (last 20 min)</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>mL/hr</span>
          </div>
          <div className="panel-body" style={{ padding: '16px 8px' }}>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={flowHistory} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#64748b' }} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: 'var(--text-muted)' }}
                />
                <Line
                  type="monotone" dataKey="v" stroke="#3b82f6"
                  strokeWidth={2} dot={false}
                  name="Flow Rate"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
