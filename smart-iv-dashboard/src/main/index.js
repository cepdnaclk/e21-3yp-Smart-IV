import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

import mockSerialService from './mockSerialService.js';
import bedStateManager from './bedStateManager.js';
import ipcHandler from './ipcHandler.js';
import dbService from './dbService.js';
import { startSerialBridge } from './serialBridge.js';  // ← NEW

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    ipcHandler.init(mainWindow);
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // 1. App setup
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('ping', () => console.log('pong'))

  // 2. Initialize database first
  dbService.init();
  global.dbService = dbService;

  // 3. Start the serial bridge (reads USB receiver ESP32 → writes liveData.json)
  //    This is non-blocking — if the ESP32 isn't plugged in it logs a warning
  //    and the app continues normally using mock/simulation data.
  startSerialBridge();  // ← NEW

  // 4. Then start backend services
  mockSerialService.start();
  bedStateManager.init();

  // 5. Then create the window
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Close DB cleanly when app quits
app.on('window-all-closed', () => {
  dbService.close();
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
