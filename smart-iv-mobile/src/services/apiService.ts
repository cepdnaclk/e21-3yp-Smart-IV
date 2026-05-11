import axios from 'axios';
import { API_BASE_URL, ENDPOINTS } from '../constants/api';
import { useAuthStore } from '../stores/authStore';
import { authService } from './authService';
import { Bed, BedDetail, FlowLog } from '../types/bed.types';
import { Alert } from '../types/alert.types';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await authService.logout();
    }
    return Promise.reject(error);
  }
);

export const apiService = {
  async getAllBeds(): Promise<Bed[]> {
    return [
      { id: 1, bedId: 'ICU-01', ward: 'ICU', patientName: 'John Doe', status: 'STABLE', targetFlowRate: 100, batteryLevel: 85, lastUpdated: new Date().toISOString() },
      { id: 2, bedId: 'ICU-02', ward: 'ICU', patientName: 'Jane Smith', status: 'ALERT', targetFlowRate: 150, batteryLevel: 12, lastUpdated: new Date().toISOString() },
      { id: 3, bedId: 'ICU-03', ward: 'ICU', patientName: 'Robert Johnson', status: 'CRITICAL', targetFlowRate: 0, batteryLevel: 45, lastUpdated: new Date().toISOString() },
    ];
  },

  async getActiveAlerts(): Promise<Alert[]> {
    return [
      { id: 1, bedId: 2, bedLabel: 'ICU-02', patientName: 'Jane Smith', ward: 'ICU', type: 'LOW_BATTERY', message: 'Battery below 15%. Plug in device.', resolved: false, createdAt: new Date().toISOString(), resolvedAt: null },
      { id: 2, bedId: 3, bedLabel: 'ICU-03', patientName: 'Robert Johnson', ward: 'ICU', type: 'BLOCKAGE', message: 'Downstream occlusion detected. Flow stopped.', resolved: false, createdAt: new Date().toISOString(), resolvedAt: null }
    ];
  },

  async getBedDetail(bedId: string): Promise<BedDetail> {
    const dummyLogs = Array.from({length: 20}, (_, i) => ({
      id: i, bedId: 1, dropsPerMin: Math.floor(Math.random() * 20) + 90, volumeInfused: i * 10, volumeRemaining: 1000 - (i * 10), recordedAt: new Date(Date.now() - (20 - i) * 60000).toISOString()
    }));

    return {
      id: 1, bedId: bedId, ward: 'ICU', patientName: 'John Doe', status: 'STABLE', targetFlowRate: 100, batteryLevel: 85, lastUpdated: new Date().toISOString(),
      flowHistory: dummyLogs,
      activeAlert: null
    };
  },

  async getBedHistory(bedId: string): Promise<FlowLog[]> {
    const response = await apiClient.get<FlowLog[]>(ENDPOINTS.BED_HISTORY(bedId));
    return response.data;
  },

  

  async acknowledgeAlert(alertId: number): Promise<void> {
    await apiClient.post(ENDPOINTS.ALERT_ACK(alertId));
  },

  async registerDeviceToken(token: string): Promise<void> {
    await apiClient.post(ENDPOINTS.REGISTER_DEVICE, { token });
  }
};