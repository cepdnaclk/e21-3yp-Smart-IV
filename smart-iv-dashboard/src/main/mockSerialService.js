import { EventEmitter } from 'events';

class MockSerialService extends EventEmitter {
  constructor() {
    super();
    this.mockBeds = [
      { bedId: '01', status: 'STABLE', flowRate: 60, volRemaining: 400, battery: 95 },
      { bedId: '02', status: 'ALERT', flowRate: 40, volRemaining: 150, battery: 70 },
      { bedId: '03', status: 'STABLE', flowRate: 120, volRemaining: 800, battery: 100 },
      { bedId: '04', status: 'STABLE', flowRate: 80, volRemaining: 200, battery: 45 },
      { bedId: '05', status: 'CRITICAL', flowRate: 0, volRemaining: 450, battery: 20 },
      { bedId: '06', status: 'STABLE', flowRate: 50, volRemaining: 320, battery: 88 },
      { bedId: '07', status: 'STABLE', flowRate: 80, volRemaining: 490, battery: 92 },
      { bedId: '08', status: 'ALERT', flowRate: 150, volRemaining: 100, battery: 15 },
      { bedId: '09', status: 'STABLE', flowRate: 60, volRemaining: 410, battery: 99 },
      { bedId: '10', status: 'STABLE', flowRate: 75, volRemaining: 250, battery: 60 },
      { bedId: '11', status: 'CRITICAL', flowRate: 5, volRemaining: 10, battery: 5 },
      { bedId: '12', status: 'STABLE', flowRate: 100, volRemaining: 450, battery: 100 },
      { bedId: '13', status: 'STABLE', flowRate: 55, volRemaining: 180, battery: 40 },
      { bedId: '14', status: 'STABLE', flowRate: 90, volRemaining: 300, battery: 85 },
      { bedId: '15', status: 'ALERT', flowRate: 200, volRemaining: 50, battery: 30 },
      { bedId: '16', status: 'STABLE', flowRate: 45, volRemaining: 300, battery: 77 }
    ];
  }

  start() {
    console.log('🚀 Real-time simulation started for 16 beds.');
    setInterval(() => {
      this.mockBeds.forEach(bed => {
        // 1. Simulate minor flow fluctuation (+/- 0.5 mL/hr) for "life"
        if (bed.status !== 'CRITICAL') {
          const noise = (Math.random() - 0.5);
          bed.flowRate = parseFloat((bed.flowRate + noise).toFixed(1));
        }

        // 2. Reduce Volume Remaining based on flow rate
        // (flowRate is per hour, so we divide by 3600 for per-second reduction)
        const reduction = bed.flowRate / 3600;
        bed.volRemaining = parseFloat((bed.volRemaining - reduction).toFixed(2));

        // 3. Ensure volume doesn't go negative
        if (bed.volRemaining < 0) bed.volRemaining = 0;

        // 4. Emit the individual packet
        this.emit('bed:packet', { ...bed });
      });
    }, 1000);
  }
}

export default new MockSerialService();