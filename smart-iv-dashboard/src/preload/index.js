import { contextBridge, ipcRenderer } from 'electron';

const makeListener = (channel) => (callback) => {
  const handler = (_event, data) => callback(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler); //Returns cleanup function
};

contextBridge.exposeInMainWorld('api', {
  
  // ==========================================
  // Renderer -> Main (Requesting data/actions)
  // ==========================================
  sendCommand: (bedId, cmd, payload) => ipcRenderer.invoke('cmd:send', bedId, cmd, payload),
  getBedHistory: (bedId, from, to) => ipcRenderer.invoke('db:history', bedId, from, to),
  getActiveAlerts: () => ipcRenderer.invoke('alerts:active'),
  ackAlert: (alertId, nurseId) => ipcRenderer.invoke('alerts:ack', alertId, nurseId),
  getSerialPortStatus: () => ipcRenderer.invoke('serial:status'),
  getAwsStatus: () => ipcRenderer.invoke('aws:status'),

  // ==========================================
  // Main -> Renderer (Listening for pushes)
  // ==========================================
  onBedUpdate:        makeListener('bed:update'),
  onNewAlert:         makeListener('alert:new'),
  onBedStale:         makeListener('bed:stale'),
  onSerialDisconnect: makeListener('serial:disc'),
});