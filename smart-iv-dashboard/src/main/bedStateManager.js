import { EventEmitter } from 'events';
import mockSerialService from './mockSerialService.js'; // We will change this to the real serialService later

/**
 * BedStateManager Class
 * * This is the central "source of truth" for the desktop dashboard.
 * It maintains an in-memory Map of all connected beds, updating them the 
 * moment a new packet arrives from the ESP32 receiver.
 * It also actively monitors for hardware disconnects (stale beds).
 */
class BedStateManager extends EventEmitter {
  constructor() {
    super();
    // A Map is highly efficient for frequent updates and lookups by bedId
    this.bedStateMap = new Map();
    this.staleCheckInterval = null;
    
    // How long to wait before considering a bedside unit disconnected (5 seconds)
    this.STALE_TIMEOUT_MS = 5000; 
  }

  /**
   * Starts listening to the serial service and begins the stale-check loop.
   */
  init() {
    console.log('🧠 Bed State Manager initialized.');

    // 1. Listen to incoming packets from the serial connection
    mockSerialService.on('bed:packet', (packet) => {
      this.handleIncomingPacket(packet);
    });

    // 2. Start a loop that runs every 1 second to check if any beds have stopped talking
    this.staleCheckInterval = setInterval(() => {
      this.checkForStaleBeds();
    }, 1000);
  }

  /**
   * Processes a new packet from a bedside unit.
   * @param {Object} packet - The JSON data object from the ESP32
   */
  handleIncomingPacket(packet) {
    const { bedId } = packet;

    // Attach a timestamp to the packet so we know exactly when we last heard from this bed
    const updatedBedData = {
      ...packet,
      lastSeen: Date.now(),
      isStale: false
    };

    // Update our in-memory map with the fresh data
    this.bedStateMap.set(bedId, updatedBedData);

    // Broadcast the updated state so the IPC Handler can push it to the React UI
    this.emit('state:updated', this.getAllBeds());
  }

  /**
   * Checks all beds to see if they have missed their check-ins.
   * If a bed hasn't sent data in >5 seconds, we mark it as stale/disconnected.
   */
  checkForStaleBeds() {
    const now = Date.now();
    let stateChanged = false;

    // Loop through every bed currently in our memory
    for (const [bedId, bedData] of this.bedStateMap.entries()) {
      // If the bed is NOT currently stale, but its last packet was over 5 seconds ago...
      if (!bedData.isStale && (now - bedData.lastSeen > this.STALE_TIMEOUT_MS)) {
        
        console.log(`📡 ⚠️ WARNING: Bed ${bedId} has gone STALE (No data for >5s)`);
        
        bedData.isStale = true;
        bedData.status = 'DISCONNECTED'; // Force the status to show a disconnect error
        
        this.bedStateMap.set(bedId, bedData);
        stateChanged = true;

        // Emit a specific event just for this failure (useful for AlertService later)
        this.emit('bed:stale', bedData);
      }
    }

    // If any bed changed to a stale state, push the update to the UI
    if (stateChanged) {
      this.emit('state:updated', this.getAllBeds());
    }
  }

  /**
   * Helper function to convert the Map into a standard JavaScript Object.
   * IPC (Main to Renderer communication) cannot send Maps directly, so we convert it first.
   * @returns {Object} Dictionary of all bed states
   */
  getAllBeds() {
    return Object.fromEntries(this.bedStateMap);
  }
}

// Export as a singleton so all parts of the backend share the exact same memory state
export default new BedStateManager();