/**
 * tauriEvents.ts
 * Wires Tauri backend events → Zustand stores.
 * Also exposes typed wrappers around Tauri IPC commands.
 */

import { useBedsStore, useAlertsStore, useSerialStore } from '../store';
import { BedPacket, AlertRow, Bed, TelemetryRow, Session } from '../types';
import { startSimulation } from '../mock/simulator';

// ── Type guard: check if we are running inside Tauri ────────────────────────
export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// ── Dynamic Tauri API import (avoids errors in browser dev mode) ─────────────
let _listen: ((event: string, handler: (e: { payload: unknown }) => void) => Promise<() => void>) | null = null;
let _invoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;

async function getTauriApi() {
  if (!isTauri()) return;
  if (!_listen || !_invoke) {
    const { listen } = await import('@tauri-apps/api/event');
    const { invoke } = await import('@tauri-apps/api/core');
    _listen = listen as typeof _listen;
    _invoke = invoke as typeof _invoke;
  }
}

// ── Typed invoke helper ───────────────────────────────────────────────────────
export async function invokeCmd<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  await getTauriApi();
  if (!_invoke) return null;
  try {
    return (await _invoke(cmd, args)) as T;
  } catch (e) {
    console.error(`[IPC] ${cmd} failed:`, e);
    return null;
  }
}

// ── Bootstrap: subscribe to all backend events ───────────────────────────────
const unsubFns: Array<() => void> = [];

export async function bootstrapTauriEvents() {
  await getTauriApi();
  if (!_listen) {
    // Running in browser dev mode — inject mock data
    startSimulation();
    return;
  }

  // bed-update: live telemetry from serial reader
  const u1 = await _listen!('bed-update', (e) => {
    const packet = e.payload as BedPacket;
    useBedsStore.getState().upsertBed({ ...packet, ts: new Date().toISOString() });
    useSerialStore.getState().incrementPacket();
  });
  unsubFns.push(u1 as unknown as () => void);

  // alert-fired: new alert from Rust alert engine
  const u2 = await _listen!('alert-fired', (e) => {
    const alert = e.payload as AlertRow;
    useAlertsStore.getState().addAlert(alert);
  });
  unsubFns.push(u2 as unknown as () => void);

  // serial-connected
  const u3 = await _listen!('serial-connected', (e) => {
    const { port } = e.payload as { port: string };
    useSerialStore.getState().setConnected(true, port);
  });
  unsubFns.push(u3 as unknown as () => void);

  // serial-disconnected
  const u4 = await _listen!('serial-disconnected', () => {
    useSerialStore.getState().setConnected(false);
  });
  unsubFns.push(u4 as unknown as () => void);

  // mqtt-connected
  const u5 = await _listen!('mqtt-connected', () => {
    useSerialStore.getState().setMqttConnected(true);
  });
  unsubFns.push(u5 as unknown as () => void);

  // mqtt-disconnected
  const u6 = await _listen!('mqtt-disconnected', () => {
    useSerialStore.getState().setMqttConnected(false);
  });
  unsubFns.push(u6 as unknown as () => void);

  console.log('[Tauri] Events bootstrapped');
}

export function teardownTauriEvents() {
  unsubFns.forEach((fn) => fn());
  unsubFns.length = 0;
}

// ── IPC Commands ──────────────────────────────────────────────────────────────
export const commands = {
  listSerialPorts: () => invokeCmd<string[]>('list_serial_ports'),
  connectSerial: (port: string, baud: number) =>
    invokeCmd<void>('connect_serial', { port, baud }),
  disconnectSerial: () => invokeCmd<void>('disconnect_serial'),
  getBeds: () => invokeCmd<Bed[]>('get_beds'),
  upsertBed: (bed: Partial<Bed> & { bedId: string }) =>
    invokeCmd<void>('upsert_bed', { bed }),
  deleteBed: (bedId: string) => invokeCmd<void>('delete_bed', { bedId }),
  getActiveSessions: () => invokeCmd<Session[]>('get_active_sessions'),
  startSession: (bedId: string, maxVolumeMl: number, targetMlHr: number) =>
    invokeCmd<string>('start_session', { bedId, maxVolumeMl, targetMlHr }),
  endSession: (sessionId: string, reason: string) =>
    invokeCmd<void>('end_session', { sessionId, reason }),
  getTelemetry: (bedId: string, hours: number) =>
    invokeCmd<TelemetryRow[]>('get_telemetry', { bedId, hours }),
  getAlerts: (limit: number) => invokeCmd<AlertRow[]>('get_alerts', { limit }),
  getActiveAlerts: () => invokeCmd<AlertRow[]>('get_active_alerts'),
  resolveAlert: (id: number, resolvedBy: string) =>
    invokeCmd<void>('resolve_alert', { id, resolvedBy }),
  connectMqtt: (broker: string, port: number, thingName: string) =>
    invokeCmd<void>('connect_mqtt', { broker, port, thingName }),
  disconnectMqtt: () => invokeCmd<void>('disconnect_mqtt'),
  purgeTelemetry: (days: number) => invokeCmd<void>('purge_telemetry', { days }),
};

