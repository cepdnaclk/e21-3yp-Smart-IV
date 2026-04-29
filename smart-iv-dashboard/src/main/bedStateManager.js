import { EventEmitter } from 'events';
import mockSerialService from './mockSerialService.js';

class BedStateManager extends EventEmitter {
  constructor() {
    super();
    this.bedStateMap = new Map();
    this.telemetryCounters = new Map(); 
    this.lastAlertMap = new Map();
    
    this.STALE_TIMEOUT_MS = 15000;  // 15s — tolerates natural pauses between IV drops
    this.TELEMETRY_INTERVAL_S = 5; 
    this.staleCheckInterval = null;
  }

  async init() {
    console.log('🧠 Bed State Manager: Initializing and hydrating sessions...');

    // Hydrate memory from the Database
    const activeSessions = global.dbService.getActiveSessions();
    activeSessions.forEach(session => {
      this.bedStateMap.set(session.bedId, {
        ...session,
        status: 'DISCONNECTED',
        lastSeen: 0,
        isStale: true,
        flowRate: 0,
        volRemaining: session.maxVolume
      });
    });

    console.log(`✅ Hydrated ${activeSessions.length} active sessions from DB.`);

    // FIX: mockSerialService emits 'data', not 'bed:packet'
    mockSerialService.on('data', (packet) => {
      this.handleIncomingPacket(packet);
    });

    // Stale bed check loop
    this.staleCheckInterval = setInterval(() => {
      this.checkForStaleBeds();
    }, 1000);
  }

  async handleIncomingPacket(packet) {
    const { bedId } = packet;
    const existingBed = this.bedStateMap.get(bedId);

    let sessionId = existingBed?.sessionId ?? null;

    if (!sessionId) {
      sessionId = global.dbService.startSession(bedId, {
        targetMlhr: packet.targetMlhr,
        bagVolumeMl: packet.maxVolume,
        dropFactor: packet.dropFactor
      });
      if (!sessionId) return; 
    }

    const updatedBedData = {
      ...packet,
      sessionId,
      lastSeen: Date.now(),
      isStale: false
    };

    this.bedStateMap.set(bedId, updatedBedData);

    // Telemetry Batching (Save every 5s)
    const counter = (this.telemetryCounters.get(bedId) ?? 0) + 1;
    this.telemetryCounters.set(bedId, counter);

    if (counter >= this.TELEMETRY_INTERVAL_S) {
      this.telemetryCounters.set(bedId, 0);
      global.dbService.saveTelemetry(sessionId, bedId, {
        measMlhr:  packet.flowRate,
        remainMl:  packet.volRemaining,
        batPct:    packet.battery,
        state:     packet.status
      });
    }

    this.checkAndLogAlert(updatedBedData, sessionId);
    this.emit('state:updated', this.getAllBeds());
  }

  checkAndLogAlert(bed, sessionId) {
    const { bedId, status, battery, flowRate, targetMlhr } = bed;
    const lastAlert = this.lastAlertMap.get(bedId);

    let alertType = null;
    let severity = null;
    let message = null;

    if (flowRate === 0 && status === 'CRITICAL') {
      alertType = 'OCCLUSION';
      severity = 'CRITICAL';
      message = `Bed ${bedId}: No flow detected.`;
    } else if (targetMlhr > 0 && flowRate > targetMlhr * 1.2) {
      alertType = 'FREE_FLOW';
      severity = 'CRITICAL';
      message = `Bed ${bedId}: Flow rate high (${flowRate} mL/hr).`;
    } else if (bed.volRemaining <= 0) {
      alertType = 'EMPTY_BAG';
      severity = 'CRITICAL';
      message = `Bed ${bedId}: Bag empty.`;
    } else if (battery <= 20) {
      alertType = 'LOW_BAT';
      severity = 'WARNING';
      message = `Bed ${bedId}: Battery low (${battery}%).`;
    }

    if (alertType && alertType !== lastAlert) {
      global.dbService.logAlert(sessionId, bedId, { type: alertType, severity, message });
      this.lastAlertMap.set(bedId, alertType);
      this.emit('alert:new', { bedId, alertType, severity, message });
    }

    if (status === 'STABLE') {
      this.lastAlertMap.set(bedId, null);
    }
  }

  checkForStaleBeds() {
    const now = Date.now();
    let stateChanged = false;

    for (const [bedId, bedData] of this.bedStateMap.entries()) {
      if (!bedData.isStale && (now - bedData.lastSeen > this.STALE_TIMEOUT_MS)) {
        bedData.isStale = true;
        bedData.status = 'DISCONNECTED';
        
        if (bedData.sessionId) {
          global.dbService.logAlert(bedData.sessionId, bedId, {
            type: 'STALE',
            severity: 'CRITICAL',
            message: `Bed ${bedId}: Connection lost.`
          });
        }
        stateChanged = true;
        this.emit('bed:stale', bedData);
      }
    }

    if (stateChanged) this.emit('state:updated', this.getAllBeds());
  }

  getAllBeds() {
    return Object.fromEntries(this.bedStateMap);
  }
}

export default new BedStateManager();