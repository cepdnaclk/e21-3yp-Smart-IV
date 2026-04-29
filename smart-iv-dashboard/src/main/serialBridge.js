// ============================================================
//  SMART IV — Serial Bridge
//  File: src/main/serialBridge.js
//
//  Reads JSON packets from the USB Receiver ESP32 over Serial,
//  updates the in-memory bed state, and writes it to liveData.js
//  so the Electron renderer can import / watch it.
//
//  Usage: called from your main index.js on app start.
//    const { startSerialBridge } = require('./serialBridge');
//    startSerialBridge();
// ============================================================

import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── CONFIG ────────────────────────────────────────────────
// Change PORT to match your system:
//   Windows : 'COM3'  (check Device Manager → Ports)
//   Mac/Linux: '/dev/ttyUSB0'  or  '/dev/ttyACM0'
const SERIAL_PORT     = 'COM14';
const BAUD_RATE       = 115200;

// Where to write the live data file.
// This path points to your existing mockSerialService.js location
// but we write a SEPARATE file so you don't overwrite your mock.
const OUTPUT_FILE = path.join(__dirname, 'liveData.json'); // JSON so ESM can read it with fs.readFileSync

// How many beds total (used to initialise the state map)
const TOTAL_BEDS = 16;

// ── INTERNAL STATE ────────────────────────────────────────
// Keyed by bedId string e.g. "03"
const bedState = {};

// Initialise all beds as OFFLINE so the UI shows something
// before the first packet arrives
for (let i = 1; i <= TOTAL_BEDS; i++) {
  const id = String(i).padStart(2, '0');
  bedState[id] = {
    bedId:        id,
    status:       'OFFLINE',
    flowRate:     0,
    volRemaining: 0,
    maxVolume:    500,
    battery:      0,
    dropFactor:   20,
    targetMlhr:   0,
    sessionId:    null,
    lastSeen:     null,
  };
}

// ── WRITE OUTPUT FILE ─────────────────────────────────────
function writeDataFile() {
  const beds = Object.values(bedState);

  // Write as plain JSON — readable by any ESM/CJS code via fs.readFileSync
  const payload = {
    updatedAt: new Date().toISOString(),
    liveData:  beds,
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

// ── PROCESS INCOMING LINE ─────────────────────────────────
function processLine(line) {
  line = line.trim();

  // The receiver prefixes real data lines with "DATA:"
  // so we can ignore debug/boot messages from the ESP32
  if (!line.startsWith('DATA:')) {
    // Print non-data lines to console for debugging
    if (line.length > 0) {
      console.log(`[ESP32 LOG] ${line}`);
    }
    return;
  }

  const jsonStr = line.slice(5); // strip "DATA:" prefix

  let packet;
  try {
    packet = JSON.parse(jsonStr);
  } catch (e) {
    console.error(`[BRIDGE] JSON parse error: ${e.message}`);
    console.error(`[BRIDGE] Raw line: ${jsonStr}`);
    return;
  }

  // Validate required fields
  if (!packet.bedId) {
    console.warn('[BRIDGE] Received packet with no bedId — ignored.');
    return;
  }

  const id = String(packet.bedId).padStart(2, '0');

  // Merge into state, preserving any fields not in this packet
  bedState[id] = {
    ...bedState[id],
    ...packet,
    bedId:    id,
    lastSeen: new Date().toISOString(),
  };

  console.log(`[BRIDGE] Updated bed ${id} | status: ${packet.status} | ` +
              `flow: ${packet.flowRate} mL/hr | ` +
              `vol: ${packet.volRemaining}/${packet.maxVolume} mL`);

  // Write updated state to file immediately
  writeDataFile();
}

// ── MARK BEDS OFFLINE AFTER TIMEOUT ──────────────────────
// If a bed hasn't sent a packet in 30 seconds, mark it OFFLINE
const OFFLINE_TIMEOUT_MS = 30000;

function checkOfflineBeds() {
  const now = Date.now();
  let changed = false;

  Object.values(bedState).forEach(bed => {
    if (bed.lastSeen && bed.status !== 'OFFLINE') {
      const age = now - new Date(bed.lastSeen).getTime();
      if (age > OFFLINE_TIMEOUT_MS) {
        bedState[bed.bedId].status = 'OFFLINE';
        console.log(`[BRIDGE] Bed ${bed.bedId} marked OFFLINE (no data for ${Math.round(age/1000)}s)`);
        changed = true;
      }
    }
  });

  if (changed) writeDataFile();
}

// ── MAIN: OPEN SERIAL PORT ────────────────────────────────
function startSerialBridge() {
  // Write initial file so the app doesn't crash on first load
  writeDataFile();
  console.log(`[BRIDGE] Initial data file written to: ${OUTPUT_FILE}`);

  // Start offline-check timer
  setInterval(checkOfflineBeds, 5000);

  // Open serial port
  const port = new SerialPort({
    path:     SERIAL_PORT,
    baudRate: BAUD_RATE,
    autoOpen: false,
  });

  const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

  port.open((err) => {
    if (err) {
      console.error(`[BRIDGE] Failed to open ${SERIAL_PORT}: ${err.message}`);
      console.error('[BRIDGE] Check:');
      console.error('  1. Is the receiver ESP32 plugged in?');
      console.error('  2. Is SERIAL_PORT correct? (check Device Manager)');
      console.error('  3. Is Arduino IDE Serial Monitor closed? (it blocks the port)');
      return;
    }
    console.log(`[BRIDGE] Serial port ${SERIAL_PORT} opened at ${BAUD_RATE} baud.`);
    console.log('[BRIDGE] Listening for Smart IV packets...');
  });

  parser.on('data', processLine);

  port.on('error', (err) => {
    console.error(`[BRIDGE] Serial error: ${err.message}`);
  });

  port.on('close', () => {
    console.warn('[BRIDGE] Serial port closed. Attempting reconnect in 5s...');
    setTimeout(() => startSerialBridge(), 5000);
  });
}

export { startSerialBridge, bedState };
