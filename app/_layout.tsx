import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '../src/stores/authStore';
import { authService } from '../src/services/authService';
import { mqttService } from '../src/services/mqttService';
import { notifService } from '../src/services/notifService';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { COLORS } from '../src/constants/colors';

export default function RootLayout() {
  const { isAuthenticated, nurse } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();
  const [isInitializing, setIsInitializing] = useState(true);

  // 1. App Initialization
  useEffect(() => {
    const initApp = async () => {
      try {
        await authService.checkSession();
        notifService.setupHandlers();
      } catch (error) {
        console.error('Failed to initialize app state:', error);
      } finally {
        setIsInitializing(false);
      }
    };
    
    initApp();
  }, []);

  // 2. Authentication Routing Guard
  useEffect(() => {
    if (isInitializing) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!isAuthenticated && !inAuthGroup) {
      // User is not logged in but trying to access a protected route
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
      // User is logged in but trying to view the login screen
      router.replace('/(app)/ward');
    }
  }, [isAuthenticated, segments, isInitializing]);

  // 3. MQTT and Push Notification Lifecycle
  useEffect(() => {
    if (isAuthenticated && nurse?.ward) {
      // Connect to live data stream for the nurse's specific ward
      mqttService.connect(nurse.ward);
      // Register this specific device for push notifications
      notifService.registerWithBackend();
    } else {
      // Terminate connection immediately on logout or lost auth
      mqttService.disconnect();
    }

    // Cleanup connection on component unmount
    return () => {
      mqttService.disconnect();
    };
  }, [isAuthenticated, nurse]);

  // Prevent UI flickering while checking the stored session token
  if (isInitializing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.brand} />
      </View>
    );
  }

  // Render the core navigation stack
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(app)" options={{ headerShown: false }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.bgPrimary,
  },
});