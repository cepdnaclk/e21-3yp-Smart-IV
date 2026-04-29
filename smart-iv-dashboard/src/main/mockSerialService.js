// ============================================================
//  SMART IV — Serial Service (Hybrid Mode)
//  File: src/main/mockSerialService.js
//
//  Strategy (simple and reliable for demo/testing):
//    Bed 01  -> always uses LIVE data from ESP32 when available,
//              falls back to mock if hardware disconnects.
//    Beds 02-16 -> always run on mock/simulation data, always.
//
//  The two data sources are completely independent.
// ============================================================

import { EventEmitter } from 'events';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const LIVE_DATA_FILE = path.join(__dirname, 'liveData.json');

// Bed 01 live data is considered fresh if received within this window
const LIVE_FRESHNESS_MS = 10000;   // 10 seconds

class MockSerialService extends EventEmitter {
  constructor() {
    super();

    this.mockBeds = [
      { bedId: '01', status: 'STABLE',   flowRate: 60,  volRemaining: 400, maxVolume: 500,  battery: 95,  dropFactor: 20, targetMlhr: 60.0,  sessionId: null },
      { bedId: '02', status: 'ALERT',    flowRate: 40,  volRemaining: 150, maxVolume: 500,  battery: 70,  dropFactor: 20, targetMlhr: 60.0,  sessionId: null },
      { bedId: '03', status: 'STABLE',   flowRate: 120, volRemaining: 800, maxVolume: 1000, battery: 100, dropFactor: 20, targetMlhr: 120.0, sessionId: null },
      { bedId: '04', status: 'STABLE',   flowRate: 80,  volRemaining: 200, maxVolume: 500,  battery: 45,  dropFactor: 20, targetMlhr: 80.0,  sessionId: null },
      { bedId: '05', status: 'CRITICAL', flowRate: 0,   volRemaining: 50,  maxVolume: 500,  battery: 20,  dropFactor: 20, targetMlhr: 80.0,  sessionId: null },
      { bedId: '06', status: 'STABLE',   flowRate: 50,  volRemaining: 320, maxVolume: 500,  battery: 88,  dropFactor: 20, targetMlhr: 50.0,  sessionId: null },
      { bedId: '07', status: 'STABLE',   flowRate: 80,  volRemaining: 490, maxVolume: 500,  battery: 92,  dropFactor: 20, targetMlhr: 80.0,  sessionId: null },
      { bedId: '08', status: 'ALERT',    flowRate: 150, volRemaining: 100, maxVolume: 500,  battery: 15,  dropFactor: 20, targetMlhr: 80.0,  sessionId: null },
      { bedId: '09', status: 'STABLE',   flowRate: 60,  volRemaining: 410, maxVolume: 500,  battery: 99,  dropFactor: 20, targetMlhr: 60.0,  sessionId: null },
      { bedId: '10', status: 'STABLE',   flowRate: 75,  volRemaining: 250, maxVolume: 500,  battery: 60,  dropFactor: 20, targetMlhr: 75.0,  sessionId: null },
      { bedId: '11', status: 'STABLE',   flowRate: 65,  volRemaining: 180, maxVolume: 500,  battery: 55,  dropFactor: 20, targetMlhr: 65.0,  sessionId: null },
      { bedId: '12', status: 'STABLE',   flowRate: 100, volRemaining: 450, maxVolume: 500,  battery: 100, dropFactor: 20, targetMlhr: 100.0, sessionId: null },
      { bedId: '13', status: 'STABLE',   flowRate: 55,  volRemaining: 180, maxVolume: 500,  battery: 40,  dropFactor: 20, targetMlhr: 55.0,  sessionId: null },
      { bedId: '14', status: 'STABLE',   flowRate: 90,  volRemaining: 300, maxVolume: 500,  battery: 85,  dropFactor: 20, targetMlhr: 90.0,  sessionId: null },
      { bedId: '15', status: 'ALERT',    flowRate: 110, volRemaining: 80,  maxVolume: 500,  battery: 30,  dropFactor: 20, targetMlhr: 80.0,  sessionId: null },
      { bedId: '16', status: 'STABLE',   flowRate: 45,  volRemaining: 300, maxVolume: 500,  battery: 77,  dropFactor: 20, targetMlhr: 45.0,  sessionId: null },
    ];

    this.bed01LiveActive = false;
  }

  _getLiveBed01() {
    try {
      if (!fs.existsSync(LIVE_DATA_FILE)) return null;

      const raw    = fs.readFileSync(LIVE_DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);

      if (!Array.isArray(parsed.liveData)) return null;

      const bed01 = parsed.liveData.find(b => b.bedId === '01');
      if (!bed01 || !bed01.lastSeen) return null;

      const age = Date.now() - new Date(bed01.lastSeen).getTime();
      if (age > LIVE_FRESHNESS_MS) return null;

      // Don't pass OFFLINE status into the app — bedStateManager handles staleness
      if (bed01.status === 'OFFLINE') return null;

      return bed01;
    } catch (e) {
      return null;
    }
  }

  _simulateBed(bed) {
    if (bed.status === 'CRITICAL') return bed;

    const noise = (Math.random() - 0.5);
    bed.flowRate = parseFloat((Math.max(0, bed.flowRate + noise)).toFixed(1));

    const reduction = bed.flowRate / 3600;
    bed.volRemaining = parseFloat(Math.max(0, bed.volRemaining - reduction).toFixed(2));

    if (bed.volRemaining <= 0) {
      bed.status   = 'CRITICAL';
      bed.flowRate = 0;
    } else if (bed.volRemaining < 50 && bed.status === 'STABLE') {
      bed.status = 'ALERT';
    }

    return bed;
  }

  start() {
    console.log('📡 Smart IV Serial Service starting...');
    console.log('📡 Bed 01: Live ESP32 (falls back to mock if disconnected)');
    console.log('📡 Beds 02-16: Always simulated mock data');

    setInterval(() => {

      // 1. Bed 01: live first, mock fallback
      const liveBed01 = this._getLiveBed01();

      if (liveBed01) {
        if (!this.bed01LiveActive) {
          console.log('✅ Bed 01: Live ESP32 data active.');
          this.bed01LiveActive = true;
        }
        this.emit('data', liveBed01);
      } else {
        if (this.bed01LiveActive) {
          console.log('⚠️  Bed 01: Live data lost — using simulation.');
          this.bed01LiveActive = false;
        }
        const mockBed01 = this.mockBeds.find(b => b.bedId === '01');
        this.emit('data', this._simulateBed(mockBed01));
      }

      // 2. Beds 02-16: always mock, always running
      this.mockBeds
        .filter(bed => bed.bedId !== '01')
        .forEach(bed => this.emit('data', this._simulateBed(bed)));

    }, 2000);
  }
}

export default new MockSerialService();