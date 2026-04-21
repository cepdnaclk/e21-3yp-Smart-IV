import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAlertStore } from '../../src/stores/alertStore';
import { COLORS } from '../../src/constants/colors';

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