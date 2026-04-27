import { ipcMain } from 'electron';
import bedStateManager from './bedStateManager.js';

/**
 * IPC Handler
 * Manages all communication between the Node.js backend (Main) 
 * and the React.js frontend (Renderer).
 */
class IpcHandler {
  /**
   * @param {BrowserWindow} mainWindow - The main Electron window instance
   */
  init(mainWindow) {
    console.log('🌉 IPC Handler: Bridge to React established.');

    // ====================================================================
    // 1. PUSH EVENTS (Main -> Renderer)
    // ====================================================================

    // Pushes the entire ward state (16+ beds) to React every time it changes
    bedStateManager.on('state:updated', (allBeds) => {
      mainWindow.webContents.send('bed:update', allBeds);
    });

    // Pushes a specific alert notification (e.g., for OS-level notifications)
    bedStateManager.on('alert:new', (alertData) => {
      mainWindow.webContents.send('alert:new', alertData);
    });

    // Pushes connection loss events
    bedStateManager.on('bed:stale', (bedData) => {
      mainWindow.webContents.send('bed:stale', bedData);
    });

    // ====================================================================
    // 2. REQUEST/RESPONSE (Renderer -> Main)
    // ====================================================================

    // Handle history requests for Charting
    ipcMain.handle('db:history', async (event, bedId, fromTime, toTime) => {
      try {
        return global.dbService.getTelemetry(bedId, fromTime, toTime); 
      } catch (err) {
        console.error(`❌ IPC: History fetch failed for Bed ${bedId}:`, err);
        return [];
      }
    });

    // Handle fetching active alarms for the Alert Panel
    ipcMain.handle('alerts:active', async () => {
      try {
        return global.dbService.getActiveAlerts(); 
      } catch (err) {
        console.error('❌ IPC: Active alerts fetch failed:', err);
        return [];
      }
    });

    // Handle Nurse acknowledgement
    ipcMain.handle('alerts:ack', async (event, alertId, nurseId) => {
      try {
        global.dbService.acknowledgeAlert(alertId, nurseId); 
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    // Handle commands sent to the ESP32 (Flow rate changes, etc.)
    ipcMain.handle('cmd:send', async (event, bedId, cmd, payload) => {
      console.log(`🩺 Command for Bed ${bedId}: ${cmd}`, payload);
      // In the next phase, we'll hook this up to the serialPort write logic
      return { success: true, message: 'Command sent to bedside unit' };
    });

    // Status checks for system health
    ipcMain.handle('serial:status', async () => {
      return { status: 'CONNECTED', port: 'COM3 (Mock)' };
    });

    ipcMain.handle('aws:status', async () => {
      return { status: 'DISCONNECTED' }; 
    });
  }
}

export default new IpcHandler();