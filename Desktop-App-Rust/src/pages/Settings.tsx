import { useState } from 'react';
import { Save, RefreshCw, Usb, Cloud, User, Bell, Database } from 'lucide-react';
import { useSettingsStore, useSerialStore } from '../store';
import { AppSettings } from '../types';
import { commands } from '../lib/tauriEvents';

export default function Settings() {
  const { settings, updateSettings } = useSettingsStore();
  const { connected, port, mqttConnected } = useSerialStore();
  const [form, setForm] = useState<AppSettings>(settings);
  const [ports, setPorts] = useState<string[]>(['COM3', 'COM4', 'COM5']);
  const [saved, setSaved] = useState(false);
  const [loadingPorts, setLoadingPorts] = useState(false);

  const patch = (k: keyof AppSettings, v: AppSettings[keyof AppSettings]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const loadPorts = async () => {
    setLoadingPorts(true);
    const result = await commands.listSerialPorts();
    if (result) setPorts(result);
    setLoadingPorts(false);
  };

  const handleSave = () => {
    updateSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleConnect = async () => {
    if (connected) {
      await commands.disconnectSerial();
    } else {
      await commands.connectSerial(form.serialPort, form.baudRate);
    }
  };

  const handleMqttConnect = async () => {
    if (mqttConnected) {
      await commands.disconnectMqtt();
    } else {
      await commands.connectMqtt(form.mqttBroker, form.mqttPort, form.awsThingName);
    }
  };


  return (
    <>
      <div className="topbar">
        <div className="topbar-title">Settings</div>
        <div className="topbar-actions">
          <button className="btn btn-primary" onClick={handleSave}>
            {saved ? <><RefreshCw size={13} /> Saved!</> : <><Save size={13} /> Save Changes</>}
          </button>
        </div>
      </div>

      <div className="page">
        <div style={{ maxWidth: 780, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Serial / USB */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Usb size={15} style={{ color: 'var(--blue-400)' }} /> Serial Port (ESP32 Receiver)
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`status-badge ${connected ? 'stable' : 'conn-lost'}`}>
                  <span className="status-dot" /> {connected ? `Connected (${port})` : 'Disconnected'}
                </span>
              </div>
            </div>
            <div className="panel-body">
              <div className="settings-grid">
                <div className="form-group">
                  <label className="form-label">COM Port</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select className="form-select" style={{ flex: 1 }}
                      value={form.serialPort}
                      onChange={(e) => patch('serialPort', e.target.value)}>
                      {ports.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <button className="btn btn-ghost btn-sm" onClick={loadPorts} title="Refresh ports">
                      {loadingPorts ? <div className="spinner" style={{ width: 12, height: 12 }} /> : <RefreshCw size={12} />}
                    </button>
                  </div>
                  <span className="form-hint">Select the COM port for the ESP32 USB receiver</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Baud Rate</label>
                  <select className="form-select"
                    value={form.baudRate}
                    onChange={(e) => patch('baudRate', parseInt(e.target.value))}>
                    <option value={9600}>9600</option>
                    <option value={115200}>115200</option>
                    <option value={230400}>230400</option>
                  </select>
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <button
                  className={`btn ${connected ? 'btn-danger' : 'btn-primary'}`}
                  onClick={handleConnect}>
                  {connected ? 'Disconnect Serial' : 'Connect Serial'}
                </button>
              </div>
            </div>
          </div>

          {/* Ward Info */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <User size={15} style={{ color: 'var(--blue-400)' }} /> Ward & Nurse Info
              </span>
            </div>
            <div className="panel-body">
              <div className="settings-grid">
                <div className="form-group">
                  <label className="form-label">Ward Name</label>
                  <input className="form-input" value={form.ward}
                    onChange={(e) => patch('ward', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Nurse / Station Name</label>
                  <input className="form-input" value={form.nurseName}
                    onChange={(e) => patch('nurseName', e.target.value)}
                    placeholder="e.g. Sister Perera" />
                  <span className="form-hint">Used when resolving alerts</span>
                </div>
              </div>
            </div>
          </div>

          {/* MQTT / AWS */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Cloud size={15} style={{ color: 'var(--blue-400)' }} /> AWS IoT / MQTT
              </span>
              <span className={`status-badge ${mqttConnected ? 'stable' : 'conn-lost'}`}>
                <span className="status-dot" /> {mqttConnected ? 'Connected' : 'Offline'}
              </span>
            </div>
            <div className="panel-body">
              <div className="settings-grid">
                <div className="form-group">
                  <label className="form-label">AWS IoT Endpoint</label>
                  <input className="form-input" value={form.awsEndpoint}
                    onChange={(e) => patch('awsEndpoint', e.target.value)}
                    placeholder="xxxx.iot.ap-south-1.amazonaws.com" />
                </div>
                <div className="form-group">
                  <label className="form-label">Thing Name</label>
                  <input className="form-input" value={form.awsThingName}
                    onChange={(e) => patch('awsThingName', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">MQTT Broker (fallback)</label>
                  <input className="form-input" value={form.mqttBroker}
                    onChange={(e) => patch('mqttBroker', e.target.value)}
                    placeholder="broker.hivemq.com" />
                </div>
                <div className="form-group">
                  <label className="form-label">MQTT Port</label>
                  <input className="form-input" type="number" value={form.mqttPort}
                    onChange={(e) => patch('mqttPort', parseInt(e.target.value))} />
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <button
                  className={`btn ${mqttConnected ? 'btn-danger' : 'btn-primary'}`}
                  onClick={handleMqttConnect}>
                  {mqttConnected ? 'Disconnect MQTT' : 'Connect to AWS IoT'}
                </button>
              </div>
            </div>
          </div>

          {/* Alert thresholds */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Bell size={15} style={{ color: 'var(--blue-400)' }} /> Alert Thresholds
              </span>
            </div>
            <div className="panel-body">
              <div className="settings-grid">
                <div className="form-group">
                  <label className="form-label">Battery Warning (%)</label>
                  <input className="form-input" type="number" min={5} max={50}
                    value={form.alertThresholdBattery}
                    onChange={(e) => patch('alertThresholdBattery', parseInt(e.target.value))} />
                  <span className="form-hint">Alert when battery drops below this level</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Low Volume Warning (mL)</label>
                  <input className="form-input" type="number" min={10} max={200}
                    value={form.alertThresholdVolume}
                    onChange={(e) => patch('alertThresholdVolume', parseInt(e.target.value))} />
                  <span className="form-hint">Alert when volume remaining drops below this</span>
                </div>
              </div>
            </div>
          </div>

          {/* Data */}
          <div className="panel">
            <div className="panel-header">
              <span className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Database size={15} style={{ color: 'var(--blue-400)' }} /> Data Retention
              </span>
            </div>
            <div className="panel-body">
              <div className="settings-grid">
                <div className="form-group">
                  <label className="form-label">Telemetry Retention (days)</label>
                  <input className="form-input" type="number" min={1} max={30}
                    value={form.telemetryRetentionDays}
                    onChange={(e) => patch('telemetryRetentionDays', parseInt(e.target.value))} />
                  <span className="form-hint">Old telemetry rows will be purged on startup</span>
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <button className="btn btn-ghost btn-sm"
                  onClick={() => {
                    if (window.confirm('Are you sure you want to permanently delete all old telemetry data?')) {
                      commands.purgeTelemetry(form.telemetryRetentionDays);
                    }
                  }}>
                  <Database size={12} /> Purge Now
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
