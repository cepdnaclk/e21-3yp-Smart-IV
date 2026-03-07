import { EventEmitter } from 'events';

/**
 * MockSerialService Class
 * * This class simulates the physical ESP32 USB Receiver Node connected via UART.
 * It extends EventEmitter so that other parts of the Electron Main process can 
 * listen for the 'bed:packet' events, exactly as they would with the real serialport library.
 */
class MockSerialService extends EventEmitter {
  constructor() {
    super();
    // This will hold the reference to our setInterval timer
    this.interval = null;
    
    // Initial mock state array, representing the data we expect from the ESP32 network
    // We are starting with 4 beds to match the Ward Dashboard requirements.
    this.mockBeds = [
      { bedId: '01', patientName: 'John Doe', status: 'STABLE', flowRate: 60, targetFlow: 60, volRemaining: 400, battery: 95 },
      { bedId: '02', patientName: 'Jane Smith', status: 'ALERT', flowRate: 40, targetFlow: 60, volRemaining: 150, battery: 70 },
      { bedId: '05', patientName: 'Robert Brown', status: 'CRITICAL', flowRate: 0, targetFlow: 50, volRemaining: 450, battery: 20 },
      { bedId: '07', patientName: 'David Lee', status: 'STABLE', flowRate: 80, targetFlow: 80, volRemaining: 800, battery: 92 }
    ];
  }

  /**
   * Starts the mock data generation loop.
   * * This function sets up a timer that triggers every 1 second (1000ms).
   * In each cycle, it iterates through the mock beds, applies slight random 
   * fluctuations to simulate real-world sensor noise, decreases the volume remaining,
   * and finally emits a 'bed:packet' event with the updated data.
   */
  start() {
    console.log('🔌 Mock Serial Service started. Emitting fake hardware data...');
    
    this.interval = setInterval(() => {
      this.mockBeds.forEach(bed => {
        // 1. Simulate minor real-world sensor fluctuations for STABLE beds
        if (bed.status === 'STABLE') {
          // Fluctuates the flow rate by +/- 1 mL/hr to simulate IR sensor readings
          bed.flowRate = +(bed.targetFlow + (Math.random() * 2 - 1)).toFixed(1);
          
          // Decrease volume remaining slightly (flowRate is per hour, so we calculate per second drop)
          const volumeDropPerSecond = bed.flowRate / 3600;
          bed.volRemaining = +(bed.volRemaining - volumeDropPerSecond).toFixed(2); 
        }

        // 2. Simulate an unexpected hardware anomaly for testing (Blockage)
        // There is a 1% chance every second that Bed 01 will encounter a simulated blockage.
        if (bed.bedId === '01' && bed.status === 'STABLE' && Math.random() > 0.99) {
            console.log('⚠️ [TEST] Simulating Blockage on Bed 01');
            bed.status = 'CRITICAL';
            bed.flowRate = 0; // Flow stops during a blockage
        }

        // 3. Emit the parsed packet just like the real readline parser will do
        // We use the spread operator {...bed} to send a copy of the object, preventing unintended mutations
        this.emit('bed:packet', { ...bed });
      });
    }, 1000); 
  }

  /**
   * Stops the mock data generation loop.
   * * This function clears the setInterval timer, effectively halting the
   * emission of 'bed:packet' events. Useful for graceful shutdowns or
   * testing disconnect scenarios.
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      console.log('🔌 Mock Serial Service stopped.');
    }
  }
}

// Export a single instance of the service (Singleton pattern) 
// so the entire app shares the same mock data source.
export default new MockSerialService();