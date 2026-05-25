import axios from 'axios';
import { API_BASE_URL, ENDPOINTS } from '../constants/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

const statusMap: Record<string, string> = {
  STABLE:    'STABLE',
  BLOCKAGE:  'CRITICAL',
  EMPTY_BAG: 'ALERT',
  CONN_LOST: 'OFFLINE',
};

const alertTypeMap: Record<string, string> = {
  BLOCKAGE: 'BLOCKAGE',
  EMPTY_BAG: 'EMPTY_BAG',
  BATTERY_LOW: 'LOW_BATTERY',
  CONN_LOST: 'DEVICE_OFFLINE',
};

function mapAlertRow(row: any, index: number) {
  const type = alertTypeMap[row.alertType] ?? 'BLOCKAGE';
  
  let message = `Alert on Bed ${row.bedId}`;
  if (type === 'BLOCKAGE') message = `IV line blockage detected on Bed ${row.bedId}`;
  if (type === 'EMPTY_BAG') message = `IV bag is empty on Bed ${row.bedId}`;
  if (type === 'LOW_BATTERY') message = `Low battery warning on Bed ${row.bedId}`;
  if (type === 'DEVICE_OFFLINE') message = `Device connection lost on Bed ${row.bedId}`;
  
  return {
    id: index + 1, // Generate a numeric ID for the FlatList keyExtractor
    bedId: Number(row.bedId ?? 0),
    bedLabel: `Bed ${row.bedId ?? '??'}`,
    patientName: `Patient (Bed ${row.bedId})`,
    ward: 'General Ward',
    type: type,
    message: message,
    resolved: row.resolved ?? false,
    createdAt: row.ts ?? new Date().toISOString(),
    resolvedAt: row.resolvedAt ?? null,
  };
}

export const apiService = {

  /** Fetch latest telemetry snapshot for every bed — mapped to mobile Bed type */
  async getAllBeds(): Promise<any[]> {
    const response = await apiClient.get(ENDPOINTS.BEDS);
    const rows: any[] = Array.isArray(response.data) ? response.data : [];
    return rows.map((row, i) => {
      // DynamoDB stores telemetry fields inside a nested 'payload' object
      const p = row.payload ?? row;
      return {
        id:             i + 1,
        bedId:          row.bedId ?? p.bedId ?? '??',
        ward:           p.ward ?? 'General Ward',
        patientName:    p.patientName ?? `Patient (Bed ${row.bedId})`,
        status:         statusMap[p.status] ?? 'STABLE',
        targetFlowRate: Number(p.flowRate  ?? p.flow_rate ?? 0),
        batteryLevel:   Number(p.battery   ?? 0),
        volRemaining:   Number(p.volRemaining ?? p.volumeRemaining ?? 0),
        lastUpdated:    row.ts ?? p.ts ?? new Date().toISOString(),
      };
    });
  },

  /** Fetch all unresolved alerts */
  async getActiveAlerts(): Promise<any[]> {
    const response = await apiClient.get(ENDPOINTS.ALERTS_ACTIVE);
    const rows: any[] = Array.isArray(response.data) ? response.data : [];
    return rows.map((row, i) => mapAlertRow(row, i));
  },

  /** Fetch full detail for a single bed: snapshot + flow history + active alert */
  async getBedDetail(bedId: string): Promise<any> {
    // Parallel fetch: all beds (for snapshot) + history + alerts for this bed
    const [allBeds, history, bedAlerts] = await Promise.all([
      apiService.getAllBeds(),
      apiService.getBedHistory(bedId),
      apiService.getBedAlerts(bedId),
    ]);

    // Find the specific bed snapshot
    const bed = allBeds.find((b: any) => b.bedId === bedId) ?? {
      id: 0, bedId, ward: 'General Ward',
      patientName: `Patient (Bed ${bedId})`,
      status: 'STABLE', targetFlowRate: 0, batteryLevel: 0,
      volRemaining: 0, lastUpdated: new Date().toISOString(),
    };

    // Map raw telemetry rows → FlowLog format expected by FlowChart
    const flowHistory = history.map((row: any, i: number) => {
      const p = row.payload ?? row;
      return {
        id: i + 1,
        bedId: Number(bedId),
        dropsPerMin: Number(p.flowRate ?? 0),
        volumeInfused:   Number(p.maxVolume ?? 500) - Number(p.volRemaining ?? 0),
        volumeRemaining: Number(p.volRemaining ?? 0),
        recordedAt: row.ts ?? p.ts ?? new Date().toISOString(),
      };
    });

    // Find the most recent unresolved alert for this bed
    const activeAlert = bedAlerts.find((a: any) => !a.resolved) ?? null;

    return { ...bed, flowHistory, activeAlert };
  },

  /** Acknowledge/resolve an alert in the cloud DynamoDB alerts table */
  async acknowledgeAlert(bedId: string, ts: string): Promise<void> {
    try {
      await apiClient.post('/alerts/acknowledge', {
        bedId,
        ts,
        resolvedBy: 'Nurse'
      });
      console.log(`[Alert] Successfully acknowledged alert for bed ${bedId} at ${ts}`);
    } catch (error) {
      console.error('[Alert] Failed to acknowledge alert:', error);
      throw error;
    }
  },

  async getBedHistory(bedId: string): Promise<any[]> {
    const response = await apiClient.get(ENDPOINTS.BED_HISTORY(bedId));
    return Array.isArray(response.data) ? response.data : [];
  },

  /** Fetch alerts for a specific bed and map them properly */
  async getBedAlerts(bedId: string): Promise<any[]> {
    const response = await apiClient.get(ENDPOINTS.ALERTS_BED(bedId));
    const rows: any[] = Array.isArray(response.data) ? response.data : [];
    return rows.map((row, i) => mapAlertRow(row, i));
  },

  /** Register device push token (no-op until SNS subscription is configured) */
  async registerDeviceToken(_token: string): Promise<void> {
    console.log('[Notif] Device token registration skipped — configure SNS endpoint first');
  },
};