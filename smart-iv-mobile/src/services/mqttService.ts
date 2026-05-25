/**
 * mqttService — Real-time MQTT via AWS Amplify PubSub (v6)
 *
 * Uses the nurse's Cognito Identity Pool temporary credentials (SigV4 signing)
 * to connect to AWS IoT Core over a WebSocket. Incoming telemetry packets are
 * injected directly into the Zustand bedStore so the UI updates instantly.
 *
 * Topic pattern: smartiv/<stationId>/<bedId>/telemetry
 */
import { PubSub } from '@aws-amplify/pubsub';
import { IOT_ENDPOINT, IOT_REGION, MQTT_TOPICS } from '../constants/mqtt';
import { useBedStore } from '../stores/bedStore';
import { useAlertStore } from '../stores/alertStore';
import { useAuthStore } from '../stores/authStore';

// Configure IoT PubSub plugin (SigV4 WebSocket)
const pubsub = new PubSub({
  region: IOT_REGION,
  endpoint: `wss://${IOT_ENDPOINT}/mqtt`,
});

// Map ESP32 packet status → Bed display status
const bedStatusMap: Record<string, string> = {
  STABLE:    'STABLE',
  BLOCKAGE:  'CRITICAL',
  EMPTY_BAG: 'ALERT',
  CONN_LOST: 'OFFLINE',
};

// Map ESP32 packet status → AlertType enum
const alertTypeMap: Record<string, string> = {
  BLOCKAGE:  'BLOCKAGE',
  EMPTY_BAG: 'EMPTY_BAG',
  CONN_LOST: 'DEVICE_OFFLINE',
};

let subscription: any = null;
let isConnecting = false;

export const mqttService = {
  async connect(_ward: string): Promise<void> {
    if (subscription || isConnecting) {
      console.log('[MQTT] Already connected or connecting, skipping.');
      return;
    }
    isConnecting = true;

    try {
      console.log('[MQTT] Subscribing to AWS IoT Core via Amplify PubSub...');

      subscription = pubsub.subscribe({ topics: MQTT_TOPICS.TELEMETRY_ALL }).subscribe({
        next: (data: any) => {
          // Amplify PubSub wraps the payload in a `value` key
          const packet = data?.value ?? data;
          if (!packet?.bedId) return;

          // Map raw telemetry fields to our Bed store shape
          const update = {
            bedId:          String(packet.bedId),
            status:         (bedStatusMap[packet.status] ?? 'STABLE') as any,
            targetFlowRate: Number(packet.flowRate ?? 0),
            batteryLevel:   Number(packet.battery ?? 0),
            volRemaining:   Number(packet.volRemaining ?? 0),
            lastUpdated:    packet.ts ?? new Date().toISOString(),
          };

          // Update the bed in the Zustand store → UI re-renders immediately
          useBedStore.getState().updateBed(update.bedId, update);

          // Trigger alert if status is an alert condition
          if (alertTypeMap[packet.status]) {
            useAlertStore.getState().addAlert({
              id: Date.now(),
              bedId: Number(packet.bedId),
              bedLabel: `Bed ${packet.bedId}`,
              patientName: `Patient (Bed ${packet.bedId})`,
              ward: useAuthStore.getState().nurse?.ward ?? 'ICU',
              type: alertTypeMap[packet.status] as any,
              message:
                packet.status === 'BLOCKAGE'  ? `IV line blockage on Bed ${packet.bedId}` :
                packet.status === 'EMPTY_BAG' ? `IV bag empty on Bed ${packet.bedId}` :
                `Device connection lost on Bed ${packet.bedId}`,
              resolved: false,
              createdAt: packet.ts ?? new Date().toISOString(),
              resolvedAt: null,
            });
          }
        },
        error: (err: any) => {
          console.error('[MQTT] Subscription error:', err?.message ?? err);
        },
        complete: () => {
          console.log('[MQTT] Subscription completed.');
        },
      });

      console.log('[MQTT] Subscribed to smartiv/+/+/telemetry ✅');
      isConnecting = false;
    } catch (err: any) {
      console.error('[MQTT] Failed to subscribe:', err?.message ?? err);
      isConnecting = false;
    }
  },

  handleReconnect(ward: string): void {
    console.log('[MQTT] Reconnecting...');
    mqttService.disconnect();
    mqttService.connect(ward);
  },

  disconnect(): void {
    if (subscription) {
      subscription.unsubscribe();
      subscription = null;
      console.log('[MQTT] Unsubscribed.');
    }
    isConnecting = false;
  },
};