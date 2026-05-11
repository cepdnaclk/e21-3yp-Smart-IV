import { useState, useCallback } from 'react';
import { apiService } from '../services/apiService';
import { useBedStore } from '../stores/bedStore';

export const useBeds = () => {
  const [refreshing, setRefreshing] = useState(false);
  const { setBeds } = useBedStore();

  const fetchBeds = useCallback(async () => {
    try {
      const data = await apiService.getAllBeds();
      setBeds(data);
    } catch (error) {
      console.error('Failed to fetch beds', error);
    }
  }, [setBeds]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchBeds();
    setRefreshing(false);
  };

  return { fetchBeds, onRefresh, refreshing };
};