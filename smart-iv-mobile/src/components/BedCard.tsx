import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Bed } from '../types/bed.types';
import { StatusBadge } from './StatusBadge';
import { COLORS } from '../constants/colors';

interface BedCardProps {
  bed: Bed;
  onPress: () => void; // [cite: 607]
}

export const BedCard: React.FC<BedCardProps> = ({ bed, onPress }) => {
  const isAlertOrCritical = bed.status === 'ALERT' || bed.status === 'CRITICAL';
  
  const getBorderColor = () => {
    switch (bed.status) {
      case 'STABLE': return COLORS.stable;
      case 'ALERT': return COLORS.alert;
      case 'CRITICAL': return COLORS.critical;
      case 'OFFLINE': return COLORS.offline;
      default: return COLORS.offline;
    }
  };

  return (
    <TouchableOpacity 
      style={[
        styles.card, 
        { 
          backgroundColor: isAlertOrCritical ? '#FFF0F0' : COLORS.bgCard, // [cite: 610]
          borderLeftColor: getBorderColor() // [cite: 611]
        }
      ]} 
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.bedId}>{bed.bedId}</Text>
          <Text style={styles.patientName}>{bed.patientName}</Text>
        </View>
        <StatusBadge status={bed.status} />
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statColumn}>
          <Text style={styles.statLabel}>Flow Rate</Text>
          <Text style={styles.statValue}>{bed.targetFlowRate} <Text style={styles.unit}>mL/hr</Text></Text>
        </View>
        <View style={styles.statColumn}>
          <Text style={styles.statLabel}>Remaining</Text>
          <Text style={styles.statValue}>{bed.volumeRemaining} <Text style={styles.unit}>mL</Text></Text>
        </View>
        <View style={styles.statColumn}>
          <Text style={styles.statLabel}>Battery</Text>
          <Text style={styles.statValue}>{bed.batteryLevel}%</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  bedId: {
    fontSize: 14,
    color: COLORS.textMuted,
    fontWeight: '600',
    marginBottom: 2,
  },
  patientName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.textPrimary,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statColumn: {
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  unit: {
    fontSize: 12,
    fontWeight: 'normal',
    color: COLORS.textMuted,
  },
});