import { contextBridge, ipcRenderer } from 'electron';

// Expose a safe 'api' object to the React window
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
  onBedUpdate: (callback) => ipcRenderer.on('bed:update', (_event, data) => callback(data)),
  onNewAlert: (callback) => ipcRenderer.on('alert:new', (_event, data) => callback(data)),
  onBedStale: (callback) => ipcRenderer.on('bed:stale', (_event, data) => callback(data)),
  onSerialDisconnect: (callback) => ipcRenderer.on('serial:disc', (_event, data) => callback(data)),
});