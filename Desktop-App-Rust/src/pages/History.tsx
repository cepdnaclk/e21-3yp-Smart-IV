import { useState, useEffect, useMemo } from 'react';
import { useBedsStore } from '../store';
import { TelemetryRow } from '../types';
import { commands } from '../lib/tauriEvents';
import { format } from 'date-fns';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';

// Generate mock telemetry for browser dev
function genMock(bedId: string, hours: number): TelemetryRow[] {
  const rows: TelemetryRow[] = [];
  const now = Date.now();
  const points = hours * 4; // every 15 min
  for (let i = points; i >= 0; i--) {
    rows.push({
      id: i,
      bedId,
      sessionId: 'sess-1',
      ts: new Date(now - i * 15 * 60 * 1000).toISOString(),
      flowRateMl: 75 + (Math.random() - 0.5) * 20,
      volRemaining: 500 - ((points - i) / points) * 350,
      batteryPct: 90 - Math.floor(i / 10),
      status: 'STABLE',
    });
  }
  return rows;
}

export default function HistoryPage() {
  const bedsMap = useBedsStore((s) => s.beds);
  const beds = useMemo(() => Object.values(bedsMap), [bedsMap]);
  const [selectedBedId, setSelectedBedId] = useState<string>(beds[0]?.bedId ?? '01');
  const [hours, setHours] = useState(6);
  const [rows, setRows] = useState<TelemetryRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async (bedId: string, h: number) => {
    setLoading(true);
    const result = await commands.getTelemetry(bedId, h);
    if (result && result.length > 0) {
      setRows(result);
    } else {
      setRows(genMock(bedId, h));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (selectedBedId) load(selectedBedId, hours);
  }, [selectedBedId, hours]);

  const chartData = rows.map((r) => ({
    t: format(new Date(r.ts), 'HH:mm'),
    flow: parseFloat(r.flowRateMl.toFixed(1)),
    vol: parseFloat(r.volRemaining.toFixed(0)),
    battery: r.batteryPct,
  }));

  const bed = beds.find((b) => b.bedId === selectedBedId);

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">History &amp; Reports</div>
        <div className="topbar-actions">
          <select className="form-select" style={{ fontSize: 12 }}
            value={selectedBedId} onChange={(e) => setSelectedBedId(e.target.value)}>
            {beds.map((b) => (
              <option key={b.bedId} value={b.bedId}>
                Bed {b.bedId} - {b.patientName}
              </option>
            ))}
          </select>
          <div className="tabs">
            {[2, 6, 12, 24].map((h) => (
              <button key={h} className={`tab-btn ${hours === h ? 'active' : ''}`}
                onClick={() => setHours(h)}>
                {h}h
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="page">
        {bed && (
          <div style={{ marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{bed.patientName}</div>
            <span className="chip">Bed {bed.bedId}</span>
            <span className="chip">Drop Factor: {bed.dropFactor} gtt/mL</span>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', padding: 40 }}>
            <div className="spinner" /> Loading telemetry…
          </div>
        ) : (
          <>
            {/* Flow rate chart */}
            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-header">
                <span className="panel-title">Flow Rate (mL/hr)</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Last {hours} hours · {rows.length} data points</span>
              </div>
              <div className="panel-body">
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#64748b' }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                    <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                    <Line type="monotone" dataKey="flow" stroke="#3b82f6" strokeWidth={2} dot={false} name="Flow Rate" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Volume remaining chart */}
            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-header">
                <span className="panel-title">Volume Remaining (mL)</span>
              </div>
              <div className="panel-body">
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="t" tick={{ fontSize: 10, fill: '#64748b' }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
                    <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                    <Line type="monotone" dataKey="vol" stroke="#22c55e" strokeWidth={2} dot={false} name="Vol. Remaining" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Raw data table */}
            <div className="panel">
              <div className="panel-header">
                <span className="panel-title">Raw Telemetry</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{rows.length} rows</span>
              </div>
              <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Flow (mL/hr)</th>
                      <th>Vol. Remaining</th>
                      <th>Battery</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice().reverse().map((r) => (
                      <tr key={r.id}>
                        <td className="mono">{format(new Date(r.ts), 'HH:mm:ss')}</td>
                        <td className="mono">{r.flowRateMl.toFixed(1)}</td>
                        <td className="mono">{r.volRemaining.toFixed(0)} mL</td>
                        <td className="mono">{r.batteryPct}%</td>
                        <td>
                          <span className={`status-badge ${r.status === 'STABLE' ? 'stable' : 'alert'}`} style={{ fontSize: 10 }}>
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
