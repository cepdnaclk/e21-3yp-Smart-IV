import React, { useEffect } from 'react';
import { View, FlatList, RefreshControl, StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useBedStore } from '../../src/stores/bedStore';
import { useAlertStore } from '../../src/stores/alertStore';
import { useAuthStore } from '../../src/stores/authStore';
import { useBeds } from '../../src/hooks/useBeds';
import { BedCard } from '../../src/components/BedCard';
import { AlertBanner } from '../../src/components/AlertBanner';
import { COLORS } from '../../src/constants/colors';

export default function WardScreen() {
  const router = useRouter();
  const { beds } = useBedStore();
  const { alerts } = useAlertStore();
  const { nurse } = useAuthStore();
  
  // Bring in the custom hook
  const { fetchBeds, onRefresh, refreshing } = useBeds();

  // Fetch once on mount
  useEffect(() => {
    fetchBeds();
  }, [fetchBeds]);

  return (
    <View style={styles.container}>
      <AlertBanner alerts={alerts} onPress={() => router.push('/alerts')} />
      
      <View style={styles.header}>
        <Text style={styles.headerText}>Ward {nurse?.ward} — {nurse?.name}</Text>
      </View>

      <FlatList
        data={beds}
        keyExtractor={(item) => item.bedId}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.brand} />}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={<Text style={styles.emptyText}>No beds assigned to your ward</Text>}
        renderItem={({ item }) => (
          <BedCard bed={item} onPress={() => router.push(`/bed/${item.bedId}`)} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgSecondary },
  listContainer: { padding: 16, paddingBottom: 32 },
  header: { paddingHorizontal: 16, paddingTop: 16 },
  headerText: { fontSize: 16, color: COLORS.textSecondary, fontWeight: '600' },
  emptyText: { textAlign: 'center', marginTop: 40, color: COLORS.textMuted, fontSize: 16 },
});