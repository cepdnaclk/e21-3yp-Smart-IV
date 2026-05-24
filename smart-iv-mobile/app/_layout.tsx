import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '../src/stores/authStore';
import { authService } from '../src/services/authService';
import { notifService } from '../src/services/notifService';
import { useMqtt } from '../src/hooks/useMqtt';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { COLORS } from '../src/constants/colors';
import { Amplify } from 'aws-amplify';

// Configure AWS Amplify
Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: 'ap-south-1_XXXXXXXXX', // Replace with your User Pool ID from Step 6.1
      userPoolClientId: 'xxxxxxxxxxxxxxxxxxxxxxxxxx', // Replace with your App Client ID from Step 6.1
      identityPoolId: 'ap-south-1:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', // Replace with your Identity Pool ID from Step 6.2
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
      router.replace('/(auth)/login');
    } else if (isAuthenticated && inAuthGroup) {
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
    backgroundColor: COLORS.bgPrimary,
  },
});