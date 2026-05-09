// Central type definitions mirroring the ESP32 JSON packet

export type BedStatus = 'STABLE' | 'BLOCKAGE' | 'EMPTY_BAG' | 'CONN_LOST' | 'OFFLINE';

export interface BedPacket {
  bedId: string;
  status: BedStatus;
  flowRate: number;      // mL/hr
  volRemaining: number;  // mL
  maxVolume: number;     // mL
  battery: number;       // 0-100%
  dropFactor: number;    // drops/mL
  targetMlhr: number;    // mL/hr prescribed
  sessionId: string | null;
  ts?: string;           // ISO timestamp added by desktop
}

export interface Bed {
  bedId: string;
  patientName: string;
  ward: string;
  dropFactor: number;
  macAddress: string;
  createdAt: string;
}

export interface Session {
  sessionId: string;
  bedId: string;
  maxVolumeMl: number;
  targetMlHr: number;
  startedAt: string;
  endedAt: string | null;
  endReason: 'COMPLETED' | 'CANCELLED' | 'ERROR' | null;
}

export interface TelemetryRow {
  id: number;
  bedId: string;
  sessionId: string | null;
  ts: string;
  flowRateMl: number;
  volRemaining: number;
  batteryPct: number;
  status: BedStatus;
}

export interface AlertRow {
  id: number;
  bedId: string;
  sessionId: string | null;
  ts: string;
  alertType: 'BLOCKAGE' | 'EMPTY_BAG' | 'CONN_LOST' | 'BATTERY_LOW';
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export interface AppSettings {
  serialPort: string;
  baudRate: number;
  ward: string;
  mqttBroker: string;
  mqttPort: number;
  mqttTls: boolean;
  awsEndpoint: string;
  awsThingName: string;
  nurseName: string;
  alertThresholdBattery: number;
  alertThresholdVolume: number;
  telemetryRetentionDays: number;
}

export interface LiveBedState extends BedPacket {
  patientName: string;
  ward: string;
  lastSeen: number;  // Date.now()
  isConnected: boolean;
}

export type AlertType = AlertRow['alertType'];
