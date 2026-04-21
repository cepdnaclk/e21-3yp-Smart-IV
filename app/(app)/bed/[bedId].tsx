import React, { useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useBedStore } from '../../../src/stores/bedStore';
import { useAlertStore } from '../../../src/stores/alertStore';
import { apiService } from '../../../src/services/apiService';
import { FlowChart } from '../../../src/components/FlowChart';
import { StatusBadge } from '../../../src/components/StatusBadge';
import { COLORS } from '../../../src/constants/colors';

export default function BedDetailScreen() {
  const { bedId } = useLocalSearchParams<{ bedId: string }>();
  const { bedDetail, setBedDetail, isLoading, setLoading } = useBedStore();
  const { acknowledgeAlert } = useAlertStore();

  useEffect(() => {
    const fetchDetail = async () => {
      setLoading(true);
      try {
        const data = await apiService.getBedDetail(bedId);
        setBedDetail(data);
      } catch (error) {
        console.error('Failed to fetch bed detail', error);
      } finally {
        setLoading(false);
      }
    };
    
    if (bedId) fetchDetail();
  }, [bedId]);

  const handleAcknowledge = async () => {
    if (bedDetail?.activeAlert) {
      try {
        const alertId = bedDetail.activeAlert.id;
        acknowledgeAlert(alertId);
        await apiService.acknowledgeAlert(alertId);
        // Remove alert from local detail state
        setBedDetail({ ...bedDetail, activeAlert: null });
      } catch (error) {
        console.error('Failed to acknowledge', error);
      }
    }
  };

  if (isLoading || !bedDetail) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.brand} /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {bedDetail.activeAlert && (
        <View style={styles.alertBox}>
          <Text style={styles.alertTitle}>ACTIVE ALERT: {bedDetail.activeAlert.type}</Text>
          <Text style={styles.alertMessage}>{bedDetail.activeAlert.message}</Text>
          <TouchableOpacity style={styles.ackButton} onPress={handleAcknowledge}>
            <Text style={styles.ackButtonText}>Acknowledge</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.patientName}>{bedDetail.patientName}</Text>
          <StatusBadge status={bedDetail.status} />
        </View>
        <Text style={styles.bedInfo}>ID: {bedDetail.bedId} | Ward: {bedDetail.ward}</Text>
        
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Target Rate</Text>
            <Text style={styles.statValue}>{bedDetail.targetFlowRate} <Text style={styles.unit}>mL/hr</Text></Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Vol. Remaining</Text>
            <Text style={styles.statValue}>{bedDetail.volumeRemaining} <Text style={styles.unit}>mL</Text></Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Battery</Text>
            <Text style={styles.statValue}>{bedDetail.batteryLevel}%</Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Flow History (Drops/Min)</Text>
      <View style={styles.chartContainer}>
        <FlowChart data={bedDetail.flowHistory} targetRate={bedDetail.targetFlowRate} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgSecondary },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  alertBox: { backgroundColor: '#FEF2F2', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#FECACA', marginBottom: 16 },
  alertTitle: { color: COLORS.critical, fontWeight: 'bold', fontSize: 14, marginBottom: 4 },
  alertMessage: { color: COLORS.textPrimary, marginBottom: 12 },
  ackButton: { backgroundColor: COLORS.critical, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6, alignSelf: 'flex-start' },
  ackButtonText: { color: COLORS.bgPrimary, fontWeight: 'bold' },
  card: { backgroundColor: COLORS.bgCard, padding: 16, borderRadius: 8, marginBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  patientName: { fontSize: 20, fontWeight: 'bold', color: COLORS.textPrimary },
  bedInfo: { fontSize: 14, color: COLORS.textMuted, marginBottom: 16 },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  statBox: { flex: 1, alignItems: 'center', padding: 8, backgroundColor: COLORS.bgSecondary, borderRadius: 6, marginHorizontal: 4 },
  statLabel: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: 'bold', color: COLORS.textPrimary },
  unit: { fontSize: 12, fontWeight: 'normal', color: COLORS.textMuted },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: COLORS.textPrimary, marginBottom: 12, paddingLeft: 4 },
  chartContainer: { backgroundColor: COLORS.bgCard, padding: 16, borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
});