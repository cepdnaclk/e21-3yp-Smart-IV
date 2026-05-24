/**
 * mqttService — stubbed for Expo Go compatibility.
 * The `mqtt` npm package uses Node.js native modules (net/tls) that crash in React Native.
 * Real-time updates come via the REST API polling instead.
 * To enable real MQTT in a bare Expo/ejected build, use aws-amplify PubSub.
 */
export const mqttService = {
  async connect(_ward: string): Promise<void> {
    console.log('[MQTT] Stub: connect called — using REST API polling instead');
  },
  handleReconnect(_ward: string): void {},
  disconnect(): void {},
};