import 'react-native-get-random-values';
import { Buffer } from 'buffer';
global.Buffer = Buffer;
import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '../src/stores/authStore';
import { authService } from '../src/services/authService';
import { notifService } from '../src/services/notifService';
import { useMqtt } from '../src/hooks/useMqtt';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { COLORS } from '../src/constants/colors';
import { Amplify } from 'aws-amplify';


// Configure AWS Amplify (Cognito Auth)
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: 'ap-south-1_TcOZmU2xk',
      userPoolClientId: '6ftu4cf26ssjqchubl37j352bc',
      identityPoolId: 'ap-south-1:e98e7c72-a24f-49dd-b4b1-b17cd64be250',
      region: 'ap-south-1',
      loginWith: {
        email: true,
      }
    }
  }
});

export default function RootLayout() {
  const { isAuthenticated, nurse } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();
  const [isInitializing, setIsInitializing] = useState(true);

  // 1. App Initialization
  useEffect(() => {
    const initApp = async () => {
      console.log('[App] Starting session check...');
      try {
        await authService.checkSession();
        notifService.setupHandlers();
        console.log('[App] Session check done. isAuthenticated:', useAuthStore.getState().isAuthenticated);
      } catch (error) {
        console.error('Failed to initialize app state:', error);
      } finally {
        setIsInitializing(false);
        console.log('[App] Initialization complete.');
      }
    };
    initApp();
  }, []);

  // 2. Authentication Routing Guard
  useEffect(() => {
    if (isInitializing) return;
    const inAuthGroup = segments[0] === '(auth)';
    const inAppGroup = segments[0] === '(app)';
    console.log('[App] Routing guard:', { isAuthenticated, inAuthGroup, segments });

    if (!isAuthenticated && !inAuthGroup) {
      console.log('[App] → Redirecting to login');
      router.replace('/(auth)/login');
    } else if (isAuthenticated && !inAppGroup) {
      console.log('[App] → Redirecting to ward');
      router.replace('/(app)/ward');
    }
  }, [isAuthenticated, segments, isInitializing]);

  // 3. Register Push Notifications
  useEffect(() => {
    if (isAuthenticated && nurse?.ward) {
      notifService.registerWithBackend();
    }
  }, [isAuthenticated, nurse]);

  // 4. Initialize MQTT Lifecycle Hook
  useMqtt();

  if (isInitializing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.brand} />
      </View>
    );
  }

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
    backgroundColor: COLORS.brand,   // dark blue — spinner always visible
  },
});