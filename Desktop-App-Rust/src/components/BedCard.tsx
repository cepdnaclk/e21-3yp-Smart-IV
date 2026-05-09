import { AlertTriangle, Battery, Clock } from 'lucide-react';
import { LiveBedState } from '../types';
import { format } from 'date-fns';

interface BedCardProps {
  bed: LiveBedState;
  onClick?: () => void;
}

function statusClass(status: LiveBedState['status']): string {
  if (status === 'STABLE') return 'status-stable';
  if (status === 'BLOCKAGE') return 'status-alert';
  if (status === 'EMPTY_BAG') return 'status-alert';
  if (status === 'CONN_LOST') return 'status-conn-lost';
  return 'status-conn-lost';
}

function StatusBadge({ status }: { status: LiveBedState['status'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    STABLE: { label: 'Stable', cls: 'stable' },
    BLOCKAGE: { label: 'Blockage!', cls: 'alert' },
    EMPTY_BAG: { label: 'Bag Empty', cls: 'alert' },
    CONN_LOST: { label: 'Conn. Lost', cls: 'conn-lost' },
    OFFLINE: { label: 'Offline', cls: 'conn-lost' },
  };
  const { label, cls } = map[status] ?? { label: status, cls: 'conn-lost' };
  return (
    <span className={`status-badge ${cls}`}>
      <span className="status-dot" />
      {label}
    </span>
  );
}

function BatteryBar({ pct }: { pct: number }) {
  const cls = pct < 20 ? 'low' : pct < 50 ? 'medium' : '';
  return (
    <div className="battery-row">
      <Battery size={12} />
      <div className="battery-bar">
        <div className={`battery-fill ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', minWidth: 40 }}>{pct.toFixed(2)}%</span>
    </div>
  );
}

export default function BedCard({ bed, onClick }: BedCardProps) {
  const volPct = bed.maxVolume > 0 ? (bed.volRemaining / bed.maxVolume) * 100 : 0;
  const isLowVol = volPct < 20;
  const flowDiff = bed.flowRate - bed.targetMlhr;
  const flowOk = Math.abs(flowDiff) < 5;

  return (
    <div
      className={`bed-card ${statusClass(bed.status)}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
    >
      {/* Header */}
      <div className="bed-card-header">
        <div className="bed-id-block">
          <div className="bed-number">Bed {bed.bedId}</div>
          <div className="patient-name">{bed.patientName}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <StatusBadge status={bed.status} />
        </div>
      </div>

      {/* Flow + Volume metrics */}
      <div className="metrics-row">
        <div className="metric-block">
          <div className="metric-label">Flow Rate</div>
          <div className={`metric-value ${!flowOk ? 'yellow' : ''}`} style={!flowOk ? { color: 'var(--yellow-400)' } : {}}>
            {bed.flowRate.toFixed(1)}<small>mL/hr</small>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
            Target: {bed.targetMlhr} mL/hr
          </div>
        </div>
        <div className="metric-block">
          <div className="metric-label">Vol. Remaining</div>
          <div className={`metric-value`} style={{ color: isLowVol ? 'var(--yellow-400)' : 'var(--text-primary)' }}>
            {Math.round(bed.volRemaining)}<small>mL</small>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
            of {bed.maxVolume} mL
          </div>
        </div>
      </div>

      {/* Volume progress */}
      <div className="progress-section">
        <div className="progress-label">
          <span>Volume Progress</span>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{volPct.toFixed(0)}%</span>
        </div>
        <div className="progress-bar">
          <div
            className={`progress-fill ${isLowVol ? 'low' : ''}`}
            style={{ width: `${volPct}%` }}
          />
        </div>
      </div>

      {/* Battery + last seen */}
      <div>
        <BatteryBar pct={bed.battery} />
        {bed.lastSeen && (
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={10} />
            Last update: {format(new Date(bed.lastSeen), 'HH:mm:ss')}
          </div>
        )}
      </div>

      {/* Alert overlay for critical states */}
      {(bed.status === 'BLOCKAGE' || bed.status === 'EMPTY_BAG') && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px',
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 'var(--radius-sm)',
          fontSize: 12, color: 'var(--red-400)', fontWeight: 600,
        }}>
          <AlertTriangle size={14} />
          {bed.status === 'BLOCKAGE' ? 'TUBE BLOCKAGE DETECTED - Motor Stopped' : 'BAG EMPTY - Tube Clamped'}
        </div>
      )}
    </div>
  );
}
