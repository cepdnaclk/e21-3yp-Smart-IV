import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { authService } from '../../src/services/authService';
import { useAuthStore } from '../../src/stores/authStore';
import { COLORS } from '../../src/constants/colors';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { isLoading } = useAuthStore();

  const handleLogin = async () => {
    setErrorMsg(null);
    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }
    try {
      await authService.login(email, password);
      // Note: No router.push needed here. The Root _layout.tsx will detect auth state change and redirect.
    } catch (err: any) {
      setErrorMsg(err.message || 'Login failed. Please check your credentials.');
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <View style={styles.formContainer}>
        <Text style={styles.title}>Smart IV</Text>
        <Text style={styles.subtitle}>Nurse Portal Login</Text>

        {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}

        <TextInput
          style={styles.input}
          placeholder="Email address"
          placeholderTextColor={COLORS.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          editable={!isLoading}
        />

        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={COLORS.textMuted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!isLoading}
        />

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={isLoading}>
          {isLoading ? (
            <ActivityIndicator color={COLORS.bgPrimary} />
          ) : (
            <Text style={styles.buttonText}>Sign In</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bgPrimary, justifyContent: 'center' },
  formContainer: { paddingHorizontal: 24 },
  title: { fontSize: 32, fontWeight: 'bold', color: COLORS.brand, textAlign: 'center' },
  subtitle: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 32, marginTop: 8 },
  errorText: { color: COLORS.critical, textAlign: 'center', marginBottom: 16 },
  input: { backgroundColor: COLORS.bgSecondary, borderRadius: 8, padding: 16, marginBottom: 16, fontSize: 16, color: COLORS.textPrimary },
  button: { backgroundColor: COLORS.brand, borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { color: COLORS.bgPrimary, fontSize: 16, fontWeight: 'bold' },
});