import { useEffect } from 'react';
import { mqttService } from '../services/mqttService';
import { useAuthStore } from '../stores/authStore';

export const useMqtt = () => {
  const { isAuthenticated, nurse } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated && nurse?.ward) {
      mqttService.connect(nurse.ward);
    } else {
      mqttService.disconnect();
    }

    return () => {
      mqttService.disconnect();
    };
  }, [isAuthenticated, nurse]);
};