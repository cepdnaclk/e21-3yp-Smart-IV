import { ipcMain } from 'electron';
import bedStateManager from './bedStateManager.js';

/**
 * IPC Handler
 * This file manages all communication between the Node.js backend (Main) 
 * and the React.js frontend (Renderer).
 */
class IpcHandler {
  /**
   * Initializes the IPC channels. We pass the mainWindow object here 
   * so we can push events down to the React UI.
   * @param {BrowserWindow} mainWindow - The main Electron window instance
   */
  init(mainWindow) {
    console.log('🌉 IPC Handler initialized. Bridge to React established.');

    // ====================================================================
    // 1. PUSH EVENTS (Main -> Renderer)
    // We listen to our backend managers and push the data down to React
    // ====================================================================

    // When the state manager updates (every 1 sec), send the entire bed map to React
    bedStateManager.on('state:updated', (allBeds) => {
      // 'bed:update' is the exact channel name defined in your IPC Contract
      mainWindow.webContents.send('bed:update', allBeds);
    });

    // When a bed goes stale (>5s without data), push a specific alert
    bedStateManager.on('bed:stale', (bedData) => {
      mainWindow.webContents.send('bed:stale', bedData);
    });

    // ====================================================================
    // 2. INVOKE EVENTS (Renderer -> Main)
    // React asks the backend for data or sends commands (like changing flow rate)
    // ====================================================================

    // Handle nurse commands from the CommandModal.jsx
    ipcMain.handle('cmd:send', async (event, bedId, cmd, payload) => {
      console.log(`🩺 Command received for Bed ${bedId}: ${cmd}`, payload);
      // Later, this will call serialService to send data back to the ESP32
      return { success: true, message: 'Command queued' };
    });

    // Handle requests for historical chart data (FlowChart.jsx)
    ipcMain.handle('db:history', async (event, bedId, fromTime, toTime) => {
      // Placeholder: We will connect this to dbService.js later
      return []; 
    });

    // Handle requests for the active alerts panel (AlertPanel.jsx)
    ipcMain.handle('alerts:active', async () => {
      // Placeholder: We will connect this to alertService.js later
      return [];
    });

    // Handle a nurse clicking "Acknowledge" on an alert
    ipcMain.handle('alerts:ack', async (event, alertId, nurseId) => {
      console.log(`✅ Alert ${alertId} acknowledged by ${nurseId}`);
      return { success: true };
    });

    // Get the status of the USB receiver connection
    ipcMain.handle('serial:status', async () => {
      return { status: 'CONNECTED', port: 'COM3 (Mock)' };
    });

    // Get the status of the AWS IoT Core cloud connection
    ipcMain.handle('aws:status', async () => {
      return { status: 'DISCONNECTED' }; // Not built yet!
    });
  }
}

export default new IpcHandler();