import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Alert } from '../types/alert.types';
import { COLORS } from '../constants/colors';

interface AlertBannerProps {
  alerts: Alert[];
  onPress: () => void;
}

export const AlertBanner: React.FC<AlertBannerProps> = ({ alerts, onPress }) => {
  if (!alerts || alerts.length === 0) return null; // [cite: 625]

  return (
    <TouchableOpacity style={styles.banner} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name="notifications-outline" size={20} color={COLORS.bgPrimary} style={styles.icon} />
      <Text style={styles.text}>
        {alerts.length} active alert(s) require attention // [cite: 623]
      </Text>
      <Ionicons name="chevron-forward" size={20} color={COLORS.bgPrimary} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  banner: {
    backgroundColor: COLORS.critical, // [cite: 622]
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  icon: {
    marginRight: 8,
  },
  text: {
    color: COLORS.bgPrimary,
    fontWeight: 'bold',
    flex: 1,
    fontSize: 14,
  },
});