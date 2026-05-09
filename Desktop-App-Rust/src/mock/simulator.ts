import { useBedsStore, useAlertsStore, useSerialStore } from '../store';
import { BedPacket } from '../types';

interface MockBed {
  packet: BedPacket & { patientName: string; ward: string };
  scenario: 'NORMAL' | 'BLOCKAGE' | 'EMPTY_BAG' | 'LOW_BATTERY' | 'CONN_LOST';
}

const Ward = 'General Ward';
const Names = [
  'Kamal Perera', 'Nimali Silva', 'Rajan Fernando', 'Priya Jayawardena',
  'Sunil Bandara', 'Amara Wijesekara', 'Samanthi Dias', 'Kasun Herath',
  'Lakmal Fonseka', 'Dinesh Kumara', 'Hasini Rathnayake', 'Anura Dissanayake',
  'Ruwanthi Peiris', 'Charith Senanayake', 'Dilrukshi Karunaratne', 'Namal Rajapaksha'
];

let beds: MockBed[] = [];
let intervalId: any = null;

export function startSimulation() {
  if (intervalId) return;

  const { upsertBed } = useBedsStore.getState();
  const { setConnected, setMqttConnected } = useSerialStore.getState();

  console.log('[Mock Simulator] Starting 16-bed simulation...');

  // Initialize 16 beds
  beds = Array.from({ length: 16 }).map((_, i) => {
    let scenario: MockBed['scenario'] = 'NORMAL';
    if (i === 3) scenario = 'BLOCKAGE';
    if (i === 7) scenario = 'EMPTY_BAG';
    if (i === 11) scenario = 'LOW_BATTERY';
    if (i === 15) scenario = 'CONN_LOST';

    let volRemaining = 500 - Math.random() * 100;
    if (scenario === 'EMPTY_BAG') volRemaining = 5;

    return {
      scenario,
      packet: {
        bedId: String(i + 1).padStart(2, '0'),
        patientName: Names[i],
        ward: Ward,
        status: (scenario === 'NORMAL' || scenario === 'LOW_BATTERY') ? 'STABLE' : scenario as 'BLOCKAGE' | 'EMPTY_BAG' | 'CONN_LOST',
        flowRate: scenario === 'BLOCKAGE' || scenario === 'EMPTY_BAG' ? 0 : 80 + (Math.random() * 10 - 5),
        volRemaining,
        maxVolume: 500,
        battery: scenario === 'LOW_BATTERY' ? 12 : 80 + Math.random() * 20,
        dropFactor: 20,
        targetMlhr: 80,
        sessionId: `sess-mock-${i + 1}`,
        ts: new Date().toISOString()
      }
    };
  });

  // Seed initial beds
  beds.forEach(b => upsertBed(b.packet));
  setConnected(true, 'MOCK-COM (Simulator)');
  setMqttConnected(true);

  // Send telemetry every 2 seconds
  intervalId = setInterval(() => {
    const now = new Date().toISOString();
    useSerialStore.getState().incrementPacket();

    beds.forEach(b => {
      // Don't update disconnected beds
      if (b.scenario === 'CONN_LOST') return;

      const p = b.packet;
      p.ts = now;

      if (b.scenario === 'NORMAL' || b.scenario === 'LOW_BATTERY') {
        // Decrease volume based on flow rate (2 seconds elapsed)
        // 80 mL/hr = 80 / 3600 mL/sec = 0.022 mL/sec * 2 = 0.044 mL per tick
        const consumed = (p.flowRate / 3600) * 2;
        p.volRemaining = Math.max(0, p.volRemaining - consumed);
        
        // Slight fluctuation in flow rate
        p.flowRate = Math.max(0, 80 + (Math.random() * 4 - 2));

        if (p.volRemaining === 0) {
          p.status = 'EMPTY_BAG';
        }
      }

      upsertBed(p);
    });

    // Fire simulated alerts if needed
    const alertsStore = useAlertsStore.getState();
    if (alertsStore.activeAlerts.length < 3) {
      const b3 = beds[3].packet;
      alertsStore.addAlert({
        id: Date.now(), bedId: b3.bedId, sessionId: b3.sessionId,
        ts: now, alertType: 'BLOCKAGE', resolvedAt: null, resolvedBy: null
      });
      const b7 = beds[7].packet;
      alertsStore.addAlert({
        id: Date.now() + 1, bedId: b7.bedId, sessionId: b7.sessionId,
        ts: now, alertType: 'EMPTY_BAG', resolvedAt: null, resolvedBy: null
      });
    }

  }, 2000);
}

export function stopSimulation() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    beds = [];
    const { setConnected, setMqttConnected } = useSerialStore.getState();
    setConnected(false);
    setMqttConnected(false);
    console.log('[Mock Simulator] Stopped.');
  }
}

// Bind to window for easy developer access
if (typeof window !== 'undefined') {
  (window as any).startMockSimulation = startSimulation;
  (window as any).stopMockSimulation = stopSimulation;
}
