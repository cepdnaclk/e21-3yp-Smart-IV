import React from 'react';
import { AlertTriangle, CheckCircle, WifiOff, Droplets } from 'lucide-react';
import { useAlertsStore, useSettingsStore } from '../store';
import { AlertRow } from '../types';
import { format } from 'date-fns';
import { commands } from '../lib/tauriEvents';

const ALERT_META: Record<string, { icon: React.ReactNode; label: string; cls: string }> = {
  BLOCKAGE:    { icon: <AlertTriangle size={16} />, label: 'Tube Blockage', cls: '' },
  EMPTY_BAG:   { icon: <Droplets size={16} />, label: 'Bag Empty', cls: '' },
  CONN_LOST:   { icon: <WifiOff size={16} />, label: 'Connection Lost', cls: 'warning' },
  BATTERY_LOW: { icon: <AlertTriangle size={16} />, label: 'Battery Low', cls: 'warning' },
};

interface AlertBannerProps {
  maxVisible?: number;
}

export default function AlertBanner({ maxVisible = 3 }: AlertBannerProps) {
  const activeAlerts = useAlertsStore((s) => s.activeAlerts);
  const resolveAlert = useAlertsStore((s) => s.resolveAlert);
  const nurseName = useSettingsStore((s) => s.settings.nurseName);

  if (activeAlerts.length === 0) return null;

  const visible = activeAlerts.slice(0, maxVisible);
  const extra = activeAlerts.length - maxVisible;

  const handleResolve = async (alert: AlertRow) => {
    resolveAlert(alert.id, nurseName);
    await commands.resolveAlert(alert.id, nurseName);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
      {visible.map((alert) => {
        const meta = ALERT_META[alert.alertType] ?? ALERT_META.BLOCKAGE;
        return (
          <div key={alert.id} className={`alert-banner ${meta.cls}`}>
            <span className="alert-icon" style={{ color: meta.cls === 'warning' ? 'var(--yellow-400)' : 'var(--red-400)' }}>
              {meta.icon}
            </span>
            <div className="alert-text">
              <strong>{meta.label}</strong> - Bed {alert.bedId}
              <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 8 }}>
                {alert.alertType === 'BLOCKAGE' && 'Motor stopped. Check IV tube for kinks or occlusions.'}
                {alert.alertType === 'EMPTY_BAG' && 'Bag empty. Tube has been clamped. Replace IV bag.'}
                {alert.alertType === 'CONN_LOST' && 'Device offline. Infusion continues locally on device.'}
                {alert.alertType === 'BATTERY_LOW' && 'Battery below threshold. Connect charger.'}
              </span>
            </div>
            <span className="alert-time">{format(new Date(alert.ts), 'HH:mm:ss')}</span>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => handleResolve(alert)}
              title="Mark as resolved"
            >
              <CheckCircle size={13} />
              Resolve
            </button>
          </div>
        );
      })}
      {extra > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', paddingLeft: 4 }}>
          +{extra} more active alerts - view all in Alerts page
        </div>
      )}
    </div>
  );
}
