export const API_BASE_URL = 'http://YOUR_SPRING_BOOT_IP:8080/api/v1';

export const ENDPOINTS = {
  // Auth
  LOGIN:          '/auth/login',
  REFRESH:        '/auth/refresh',
  LOGOUT:         '/auth/logout',
  REGISTER_DEVICE:'/auth/register-device',

  // Ward
  WARD_BEDS:      '/ward/beds',
  WARD_SUMMARY:   '/ward/beds/summary',

  // Bed
  BED_DETAIL:     (bedId: string) => `/bed/${bedId}`,
  BED_HISTORY:    (bedId: string) => `/bed/${bedId}/history`,
  BED_VOLUME:     (bedId: string) => `/bed/${bedId}/volume`,

  // Alerts
  ALERTS_ACTIVE:  '/alerts/active',
  ALERTS_BED:     (bedId: string) => `/alerts/${bedId}`,
  ALERT_ACK:      (alertId: number) => `/alerts/${alertId}/ack`,
  TELEMETRY:      '/telemetry',
};