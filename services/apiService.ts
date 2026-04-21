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
    const response = await apiClient.get<Bed[]>(ENDPOINTS.WARD_BEDS);
    return response.data;
  },

  async getBedDetail(bedId: string): Promise<BedDetail> {
    const response = await apiClient.get<BedDetail>(ENDPOINTS.BED_DETAIL(bedId));
    return response.data;
  },

  async getBedHistory(bedId: string): Promise<FlowLog[]> {
    const response = await apiClient.get<FlowLog[]>(ENDPOINTS.BED_HISTORY(bedId));
    return response.data;
  },

  async getActiveAlerts(): Promise<Alert[]> {
    const response = await apiClient.get<Alert[]>(ENDPOINTS.ALERTS_ACTIVE);
    return response.data;
  },

  async acknowledgeAlert(alertId: number): Promise<void> {
    await apiClient.post(ENDPOINTS.ALERT_ACK(alertId));
  },

  async registerDeviceToken(token: string): Promise<void> {
    await apiClient.post(ENDPOINTS.REGISTER_DEVICE, { token });
  }
};