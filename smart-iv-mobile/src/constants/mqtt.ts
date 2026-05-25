export const IOT_ENDPOINT = 'a2qzkepylp0vfe-ats.iot.ap-south-1.amazonaws.com';
export const IOT_REGION = 'ap-south-1';

export const MQTT_TOPICS = {
  TELEMETRY_ALL:  'smartiv/+/+/telemetry',
  TELEMETRY_WARD: (stationId: string) => `smartiv/${stationId}/+/telemetry`,
};