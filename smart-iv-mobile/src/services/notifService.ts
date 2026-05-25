/**
 * notifService — Push Notification handling
 *
 * NOTE: expo-notifications remote push notifications are NOT supported in Expo Go SDK 53+.
 * All calls are wrapped in try/catch so the app works in Expo Go for development.
 * Full push notifications will work in a production/development build.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { apiService } from './apiService';
import { useAlertStore } from '../stores/alertStore';
import { router } from 'expo-router';

// Safely set the notification handler — fails silently in Expo Go SDK 53+
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
} catch (_) {
  // Expo Go SDK 53 — push notifications not supported, skip silently
}

export const notifService = {
  async requestPermissions(): Promise<boolean> {
    try {
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
    } catch (_) {
      return false; // Expo Go: push not supported
    }
  },

  async getDeviceToken(): Promise<string | null> {
    try {
      const tokenData = await Notifications.getExpoPushTokenAsync();
      return tokenData.data;
    } catch (error) {
      console.warn('[Notif] Push token not available (Expo Go or permissions denied)');
      return null;
    }
  },

  async registerWithBackend(): Promise<void> {
    try {
      const hasPermission = await this.requestPermissions();
      if (hasPermission) {
        const token = await this.getDeviceToken();
        if (token) {
          await apiService.registerDeviceToken(token);
        }
      }
    } catch (_) {
      // Fails silently in Expo Go — will work in dev/production build
    }
  },

  setupHandlers(): void {
    try {
      // Handle notification received while app is in the foreground
      Notifications.addNotificationReceivedListener(notification => {
        const data = notification.request.content.data;
        if (data && data.type) {
          useAlertStore.getState().addAlert(data as any);
        }
      });

      // Handle user tapping on the notification
      Notifications.addNotificationResponseReceivedListener(() => {
        router.push('/alerts');
      });
    } catch (_) {
      // Expo Go SDK 53 — listeners not supported, skip silently
    }
  },
};