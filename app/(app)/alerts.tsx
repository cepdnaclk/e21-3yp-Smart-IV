import React, { useEffect } from 'react';
import { View, FlatList, Text, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAlertStore } from '../../src/stores/alertStore';
import { apiService } from '../../src/services/apiService';
import { useAlerts } from '../../src/hooks/useAlerts';
import { formatTime } from '../../src/utils/formatters';
import { COLORS } from '../../src/constants/colors';
import { Alert } from '../../src/types/alert.types';

export default function AlertsScreen() {
  const { alerts, acknowledgeAlert, clearUnread } = useAlertStore();
  
  // Bring in the custom hook
  const { fetchAlerts, onRefresh, refreshing } = useAlerts();

  useEffect(() => {
    fetchAlerts();
    clearUnread();
  }, [fetchAlerts, clearUnread]);

  const handleAcknowledge = async (id: number) => {
    try {
      acknowledgeAlert(id);
      await apiService.acknowledgeAlert(id);
    } catch (error) {
      console.error('Failed to acknowledge alert', error);
    }
  };

  const renderAlert = ({ item }: { item: Alert }) => (
    <View style={styles.alertCard}>
      <View style={styles.alertHeader}>
        <Text style={styles.bedLabel}>{item.bedLabel} - {item.patientName}</Text>
        {/* Using your new formatTime utility here */}
        <Text style={styles.timeText}>{formatTime(item.createdAt)}</Text>
      </View>
      <Text style={styles.messageText}>{item.message}</Text>
      <TouchableOpacity style={styles.ackButton} onPress={() => handleAcknowledge(item.id)}>
        <Text style={styles.ackButtonText}>Acknowledge</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id.toString()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-circle" size={64} color={COLORS.stable} />
            <Text style={styles.emptyText}>All clear — no active alerts</Text>
          </View>
        }
        renderItem={renderAlert}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgSecondary },
  listContainer: { padding: 16 },
  alertCard: { backgroundColor: COLORS.bgCard, padding: 16, borderRadius: 8, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: COLORS.critical, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  alertHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  bedLabel: { fontWeight: 'bold', fontSize: 16, color: COLORS.textPrimary },
  timeText: { color: COLORS.textMuted, fontSize: 12 },
  messageText: { color: COLORS.textSecondary, marginBottom: 16, fontSize: 14 },
  ackButton: { backgroundColor: COLORS.brandLight, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6, alignSelf: 'flex-start' },
  ackButtonText: { color: COLORS.brand, fontWeight: '600' },
  emptyContainer: { alignItems: 'center', marginTop: 100 },
  emptyText: { marginTop: 16, color: COLORS.textSecondary, fontSize: 16 },
});