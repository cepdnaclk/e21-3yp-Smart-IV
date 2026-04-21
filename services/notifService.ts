import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiService } from './apiService';
import { useAlertStore } from '../stores/alertStore';
import { router } from 'expo-router';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const notifService = {
  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    return finalStatus === 'granted';
  },

  async getDeviceToken(): Promise<string | null> {
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync();
      return tokenData.data;
    } catch (error) {
      console.error('Failed to get push token', error);
      return null;
    }
  },

  async registerWithBackend(): Promise<void> {
    const hasPermission = await this.requestPermissions();
    if (hasPermission) {
      const token = await this.getDeviceToken();
      if (token) {
        await apiService.registerDeviceToken(token);
      }
    }
  },

  setupHandlers(): void {
    // Handle notification received while app is in the foreground
    Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request.content.data;
      if (data && data.type) {
        useAlertStore.getState().addAlert(data as any);
      }
    });

    // Handle user tapping on the notification (foreground or background)
    Notifications.addNotificationResponseReceivedListener(response => {
      // Navigate to the alerts screen when a notification is tapped
      router.push('/alerts');
    });
  }
};