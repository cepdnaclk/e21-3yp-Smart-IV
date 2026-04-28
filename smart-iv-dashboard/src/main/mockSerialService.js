import { EventEmitter } from 'events';

class MockSerialService extends EventEmitter {
  constructor() {
    super();
    this.mockBeds = [
      { bedId: '01', status: 'STABLE',   flowRate: 60,  volRemaining: 400, maxVolume: 500,  battery: 95,  dropFactor: 20, targetMlhr: 60.0,  sessionId: null },
      { bedId: '02', status: 'ALERT',    flowRate: 40,  volRemaining: 150, maxVolume: 500,  battery: 70,  dropFactor: 20, targetMlhr: 60.0,  sessionId: null },
      { bedId: '03', status: 'STABLE',   flowRate: 120, volRemaining: 800, maxVolume: 1000, battery: 100, dropFactor: 20, targetMlhr: 120.0, sessionId: null },
      { bedId: '04', status: 'STABLE',   flowRate: 80,  volRemaining: 200, maxVolume: 500,  battery: 45,  dropFactor: 20, targetMlhr: 80.0,  sessionId: null },
      { bedId: '05', status: 'CRITICAL', flowRate: 0,   volRemaining: 450, maxVolume: 500,  battery: 20,  dropFactor: 20, targetMlhr: 80.0,  sessionId: null },
      { bedId: '06', status: 'STABLE',   flowRate: 50,  volRemaining: 320, maxVolume: 500,  battery: 88,  dropFactor: 20, targetMlhr: 50.0,  sessionId: null },
      { bedId: '07', status: 'STABLE',   flowRate: 80,  volRemaining: 490, maxVolume: 500,  battery: 92,  dropFactor: 20, targetMlhr: 80.0,  sessionId: null },
      { bedId: '08', status: 'ALERT',    flowRate: 150, volRemaining: 100, maxVolume: 500,  battery: 15,  dropFactor: 20, targetMlhr: 80.0,  sessionId: null },
      { bedId: '09', status: 'STABLE',   flowRate: 60,  volRemaining: 410, maxVolume: 500,  battery: 99,  dropFactor: 20, targetMlhr: 60.0,  sessionId: null },
      { bedId: '10', status: 'STABLE',   flowRate: 75,  volRemaining: 250, maxVolume: 500,  battery: 60,  dropFactor: 20, targetMlhr: 75.0,  sessionId: null },
      { bedId: '11', status: 'CRITICAL', flowRate: 0,   volRemaining: 10,  maxVolume: 500,  battery: 5,   dropFactor: 20, targetMlhr: 60.0,  sessionId: null },
      { bedId: '12', status: 'STABLE',   flowRate: 100, volRemaining: 450, maxVolume: 500,  battery: 100, dropFactor: 20, targetMlhr: 100.0, sessionId: null },
      { bedId: '13', status: 'STABLE',   flowRate: 55,  volRemaining: 180, maxVolume: 500,  battery: 40,  dropFactor: 20, targetMlhr: 55.0,  sessionId: null },
      { bedId: '14', status: 'STABLE',   flowRate: 90,  volRemaining: 300, maxVolume: 500,  battery: 85,  dropFactor: 20, targetMlhr: 90.0,  sessionId: null },
      { bedId: '15', status: 'ALERT',    flowRate: 200, volRemaining: 50,  maxVolume: 500,  battery: 30,  dropFactor: 20, targetMlhr: 80.0,  sessionId: null },
      { bedId: '16', status: 'STABLE',   flowRate: 45,  volRemaining: 300, maxVolume: 500,  battery: 77,  dropFactor: 20, targetMlhr: 45.0,  sessionId: null },
    ];
  }

  start() {
    console.log('🚀 Real-time simulation started for 16 beds.');
    setInterval(() => {
      this.mockBeds.forEach(bed => {
        // 1. Simulate minor flow fluctuation for non-critical beds
        if (bed.status !== 'CRITICAL') {
          const noise = (Math.random() - 0.5);
          bed.flowRate = parseFloat((Math.max(0, bed.flowRate + noise)).toFixed(1));
        }

        // 2. Reduce volume remaining based on flow rate
        const reduction = bed.flowRate / 3600;
        bed.volRemaining = parseFloat((bed.volRemaining - reduction).toFixed(2));

        // 3. Auto escalate to CRITICAL if bag is empty
        if (bed.volRemaining <= 0) {
          bed.volRemaining = 0;
          bed.status = 'CRITICAL';
        }

        // 4. Emit the packet — no patientRef, sessionId starts as null
        this.emit('bed:packet', { ...bed });
      });
    }, 1000);
  }
}

export default new MockSerialService();