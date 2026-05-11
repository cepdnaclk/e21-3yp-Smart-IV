import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BedStatus } from '../types/bed.types';
import { COLORS } from '../constants/colors';

interface StatusBadgeProps {
  status: BedStatus;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const getBadgeStyle = () => {
    switch (status) {
      case 'STABLE': return { backgroundColor: COLORS.stable }; // [cite: 615]
      case 'ALERT': return { backgroundColor: COLORS.alert }; // [cite: 616]
      case 'CRITICAL': return { backgroundColor: COLORS.critical }; // [cite: 617]
      case 'OFFLINE': return { backgroundColor: COLORS.offline }; // [cite: 618]
      default: return { backgroundColor: COLORS.offline };
    }
  };

  return (
    <View style={[styles.badge, getBadgeStyle()]}>
      <Text style={styles.text}>{status}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  text: {
    color: COLORS.bgPrimary,
    fontSize: 10,
    fontWeight: 'bold',
  },
});
