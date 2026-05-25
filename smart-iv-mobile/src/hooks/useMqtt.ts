import { useEffect } from 'react';
import { mqttService } from '../services/mqttService';
import { useAuthStore } from '../stores/authStore';

export const useMqtt = () => {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const ward = useAuthStore(s => s.nurse?.ward);  // primitive string — stable reference

  useEffect(() => {
    if (isAuthenticated && ward) {
      mqttService.connect(ward);
    } else {
      mqttService.disconnect();
    }

    return () => {
      mqttService.disconnect();
    };
  }, [isAuthenticated, ward]);  // only re-run if auth state or ward name actually changes
};