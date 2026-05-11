export const IOT_ENDPOINT = 'YOUR_IOT_ENDPOINT.iot.ap-south-1.amazonaws.com';
export const IOT_REGION = 'ap-south-1'; 

export const MQTT_TOPICS = {
  FLOWRATE_ALL:  'smartiv/+/+/flowrate',  
  FLOWRATE_WARD: (ward: string) => `smartiv/${ward}/+/flowrate`,
  ALERT_ALL:     'smartiv/+/+/alert',
  ALERT_WARD:    (ward: string) => `smartiv/${ward}/+/alert`,
  STATUS_ALL:    'smartiv/+/+/status',
};