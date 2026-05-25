import { View, ActivityIndicator } from 'react-native';
import { COLORS } from '../src/constants/colors';

// This screen is shown briefly while _layout.tsx initializes the session
// and routes the user to either /(auth)/login or /(app)/ward.
export default function Index() {
  return (
    <View style={{ flex: 1, backgroundColor: COLORS.brand, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color="#ffffff" />
    </View>
  );
}