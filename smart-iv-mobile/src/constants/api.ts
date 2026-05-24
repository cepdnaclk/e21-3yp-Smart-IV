export const API_BASE_URL = 'https://0mt22a6os9.execute-api.ap-south-1.amazonaws.com/prod';

export const ENDPOINTS = {
  // Beds — latest reading per bed from DynamoDB telemetry table
  // Appending cachebuster to bypass aggressively cached 502 errors on mobile
  BEDS:           `/beds?_t=${Date.now()}`,

  // Alerts — active unresolved alerts from DynamoDB alerts table
  ALERTS_ACTIVE:  `/alerts?_t=${Date.now()}`,

  // Telemetry history — pass ?bedId=XX as query param
  TELEMETRY:      '/telemetry',

  // Bed detail (uses BEDS + client-side filter)
  BED_DETAIL:     (bedId: string) => `/beds?bedId=${bedId}`,
  BED_HISTORY:    (bedId: string) => `/telemetry?bedId=${bedId}`,

  // Alerts per bed
  ALERTS_BED:     (bedId: string) => `/alerts?bedId=${bedId}`,
};