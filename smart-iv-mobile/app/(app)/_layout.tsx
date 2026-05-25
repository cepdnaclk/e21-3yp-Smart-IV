import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';
import { useAlertStore } from '../../src/stores/alertStore';
import { COLORS } from '../../src/constants/colors';
import { authService } from '../../src/services/authService';

export default function AppLayout() {
  const { unreadCount } = useAlertStore();

  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: COLORS.brand,
      tabBarInactiveTintColor: COLORS.textMuted,
      headerStyle: { backgroundColor: COLORS.bgPrimary },
      headerTitleStyle: { color: COLORS.textPrimary, fontWeight: 'bold' },
    }}>
      <Tabs.Screen
        name="ward"
        options={{
          title: 'Ward Dashboard',
          tabBarIcon: ({ color, size }) => <Ionicons name="medical" size={size} color={color} />,
          headerRight: () => (
            <TouchableOpacity 
              onPress={() => authService.logout()}
              style={{ marginRight: 16, padding: 4 }}
              activeOpacity={0.7}
            >
              <Ionicons name="log-out-outline" size={24} color={COLORS.critical} />
            </TouchableOpacity>
          )
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Active Alerts',
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications" size={size} color={color} />,
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
        }}
      />
      <Tabs.Screen
        name="bed/[bedId]"
        options={{
          href: null, // Hides this route from the bottom tab bar
          title: 'Bed Details',
          headerBackTitle: 'Ward'
        }}
      />
    </Tabs>
  );
}