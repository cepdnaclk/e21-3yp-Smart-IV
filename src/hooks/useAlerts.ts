import { useState, useCallback } from 'react';
import { apiService } from '../services/apiService';
import { useAlertStore } from '../stores/alertStore';

export const useAlerts = () => {
  const [refreshing, setRefreshing] = useState(false);
  const { setAlerts, clearUnread } = useAlertStore();

  const fetchAlerts = useCallback(async () => {
    try {
      const data = await apiService.getActiveAlerts();
      setAlerts(data);
    } catch (error) {
      console.error('Failed to fetch alerts', error);
    }
  }, [setAlerts]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAlerts();
    clearUnread();
    setRefreshing(false);
  };

  return { fetchAlerts, onRefresh, refreshing };
};