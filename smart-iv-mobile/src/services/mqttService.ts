import mqtt, { MqttClient } from 'mqtt';
import { fetchAuthSession } from 'aws-amplify/auth';
import { IOT_ENDPOINT, MQTT_TOPICS } from '../constants/mqtt';
import { useBedStore } from '../stores/bedStore';
import { useAlertStore } from '../stores/alertStore';
import { Alert } from '../types/alert.types';

let client: MqttClient | null = null;
let reconnectTimeout: NodeJS.Timeout | null = null;
let backoffTime = 1000;
const MAX_BACKOFF = 30000;

export const mqttService = {
  async connect(ward: string): Promise<void> {
    if (client && client.connected) return;

    try {
      const session = await fetchAuthSession();
      const credentials = session.credentials;
      
      if (!credentials) throw new Error('No AWS credentials available for MQTT');

      // Note: In a production React Native app, SigV4 signing requires a specialized utility 
      // like aws-iot-device-sdk-v2. For standard mqtt.js over WebSockets, the URL must be pre-signed.
      // This is a standardized wss connection string structure.
      const url = `wss://${IOT_ENDPOINT}/mqtt`;

      client = mqtt.connect(url, {
        protocolVersion: 4,
        reconnectPeriod: 0, // Manual reconnect logic
        transformWsUrl: (url, options, client) => {
            // SigV4 URL transformation logic would typically hook in here
            return url;
        }
      });

      client.on('connect', () => {
        backoffTime = 1000;
        
        client?.subscribe(MQTT_TOPICS.FLOWRATE_WARD(ward));
        client?.subscribe(MQTT_TOPICS.ALERT_WARD(ward));
        client?.subscribe(MQTT_TOPICS.STATUS_WARD(ward)); // Assuming STATUS_WARD is intended alongside STATUS_ALL
      });

      client.on('message', (topic, message) => {
        const payload = JSON.parse(message.toString());
        const bedStore = useBedStore.getState();
        const alertStore = useAlertStore.getState();

        if (topic.includes('flowrate') || topic.includes('status')) {
          bedStore.updateBed(payload.bedId, {
            targetFlowRate: payload.dpm || payload.targetFlowRate,
            volumeInfused: payload.volumeInfused,
            volumeRemaining: payload.volumeRemaining,
            status: payload.status,
            batteryLevel: payload.batteryLevel,
            lastUpdated: payload.timestamp || new Date().toISOString()
          });
        }

        if (topic.includes('alert')) {
          const alertPayload: Alert = {
            id: payload.id || Date.now(),
            bedId: payload.bedId,
            bedLabel: payload.bedLabel,
            patientName: payload.patientName,
            ward: payload.ward,
            type: payload.type,
            message: payload.message,
            resolved: false,
            createdAt: payload.createdAt || new Date().toISOString(),
            resolvedAt: null
          };
          alertStore.addAlert(alertPayload);
        }
      });

      client.on('close', () => {
        this.handleReconnect(ward);
      });

      client.on('error', (err) => {
        console.error('MQTT Error', err);
        client?.end();
      });

    } catch (error) {
      console.error('Failed to initialize MQTT connection', error);
      this.handleReconnect(ward);
    }
  },

  handleReconnect(ward: string) {
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    
    reconnectTimeout = setTimeout(() => {
      backoffTime = Math.min(backoffTime * 2, MAX_BACKOFF);
      this.connect(ward);
    }, backoffTime);
  },

  disconnect(): void {
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    if (client) {
      client.end();
      client = null;
    }
  }
};