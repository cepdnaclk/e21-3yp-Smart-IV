import { create } from 'zustand';
import { LiveBedState, BedPacket, AlertRow, AppSettings } from '../types';

// ── Bed store ────────────────────────────────────────────────────────────────
interface BedsState {
  beds: Record<string, LiveBedState>;
  upsertBed: (packet: BedPacket & { patientName?: string; ward?: string }) => void;
  setBedMeta: (bedId: string, meta: { patientName: string; ward: string }) => void;
  removeBed: (bedId: string) => void;
  getAllBeds: () => LiveBedState[];
  clearBeds: () => void;
}

export const useBedsStore = create<BedsState>((set, get) => ({
  beds: {},

  upsertBed: (packet) => {
    set((state) => {
      const existing = state.beds[packet.bedId];
      const updated: LiveBedState = {
        ...existing,
        ...packet,
        patientName: packet.patientName ?? existing?.patientName ?? `Patient ${packet.bedId}`,
        ward: packet.ward ?? existing?.ward ?? 'Ward A',
        lastSeen: Date.now(),
        isConnected: packet.status !== 'CONN_LOST' && packet.status !== 'OFFLINE',
      };
      return { beds: { ...state.beds, [packet.bedId]: updated } };
    });
  },

  setBedMeta: (bedId, meta) => {
    set((state) => {
      const existing = state.beds[bedId];
      if (!existing) return state;
      return {
        beds: {
          ...state.beds,
          [bedId]: { ...existing, ...meta },
        },
      };
    });
  },

  removeBed: (bedId) => {
    set((state) => {
      const next = { ...state.beds };
      delete next[bedId];
      return { beds: next };
    });
  },

  getAllBeds: () => Object.values(get().beds),

  clearBeds: () => set({ beds: {} }),
}));

// ── Alert store ───────────────────────────────────────────────────────────────
interface AlertsState {
  alerts: AlertRow[];
  activeAlerts: AlertRow[];
  addAlert: (alert: AlertRow) => void;
  resolveAlert: (id: number, resolvedBy: string) => void;
  setAlerts: (alerts: AlertRow[]) => void;
  setActiveAlerts: (alerts: AlertRow[]) => void;
}

export const useAlertsStore = create<AlertsState>((set) => ({
  alerts: [],
  activeAlerts: [],

  addAlert: (alert) => {
    set((state) => ({
      alerts: [alert, ...state.alerts].slice(0, 500),
      activeAlerts: alert.resolvedAt ? state.activeAlerts : [alert, ...state.activeAlerts],
    }));
  },

  resolveAlert: (id, resolvedBy) => {
    const resolvedAt = new Date().toISOString();
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === id ? { ...a, resolvedAt, resolvedBy } : a
      ),
      activeAlerts: state.activeAlerts.filter((a) => a.id !== id),
    }));
  },

  setAlerts: (alerts) => set({ alerts }),
  setActiveAlerts: (alerts) => set({ activeAlerts: alerts }),
}));

// ── Settings store ─────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS: AppSettings = {
  serialPort: 'COM3',
  baudRate: 115200,
  ward: 'Ward A',
  mqttBroker: '',
  mqttPort: 8883,
  mqttTls: true,
  awsEndpoint: '',
  awsThingName: 'smartiv-station-01',
  nurseName: 'Nurse Station',
  alertThresholdBattery: 20,
  alertThresholdVolume: 50,
  telemetryRetentionDays: 7,
};

interface SettingsState {
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: DEFAULT_SETTINGS,
  updateSettings: (patch) =>
    set((s) => ({ settings: { ...s.settings, ...patch } })),
}));

// ── Serial connection store ────────────────────────────────────────────────────
interface SerialState {
  connected: boolean;
  port: string | null;
  packetCount: number;
  lastPacketAt: number | null;
  mqttConnected: boolean;
  setConnected: (connected: boolean, port?: string) => void;
  setMqttConnected: (connected: boolean) => void;
  incrementPacket: () => void;
}

export const useSerialStore = create<SerialState>((set) => ({
  connected: false,
  port: null,
  packetCount: 0,
  lastPacketAt: null,
  mqttConnected: false,
  setConnected: (connected, port) => set({ connected, port: port ?? null }),
  setMqttConnected: (mqttConnected) => set({ mqttConnected }),
  incrementPacket: () =>
    set((s) => ({ packetCount: s.packetCount + 1, lastPacketAt: Date.now() })),
}));
