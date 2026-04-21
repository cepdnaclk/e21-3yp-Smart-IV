import { signIn, signOut, fetchAuthSession, fetchUserAttributes } from 'aws-amplify/auth';
import { useAuthStore } from '../stores/authStore';
import { useBedStore } from '../stores/bedStore';
import { useAlertStore } from '../stores/alertStore';
import { Nurse, NurseRole } from '../types/auth.types';

export const authService = {
  async login(email: string, password: string): Promise<void> {
    useAuthStore.getState().setLoading(true);
    // TEMPORARY DUMMY LOGIN
    setTimeout(() => {
      const dummyNurse: Nurse = {
        id: 1, cognitoId: 'dummy123', name: 'Nurse Sarah', email: email, ward: 'ICU', role: 'NURSE'
      };
      useAuthStore.getState().setAuth('dummy-token', dummyNurse);
      useAuthStore.getState().setLoading(false);
    }, 1000); // 1-second fake loading delay
  
  },

  async logout(): Promise<void> {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out error', error);
    } finally {
      useAuthStore.getState().clearAuth();
      useBedStore.getState().reset();
      useAlertStore.getState().reset();
    }
  },

  async checkSession(): Promise<void> {
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.accessToken?.toString();
      
      if (token) {
        const attributes = await fetchUserAttributes();
        const nurse: Nurse = {
            id: parseInt(attributes['custom:id'] || '0', 10),
            cognitoId: attributes.sub || '',
            name: attributes.name || 'Nurse',
            email: attributes.email || '',
            ward: attributes['custom:ward'] || 'General',
            role: (attributes['custom:role'] as NurseRole) || 'NURSE',
        };
        useAuthStore.getState().setAuth(token, nurse);
      } else {
        useAuthStore.getState().clearAuth();
      }
    } catch (error) {
      useAuthStore.getState().clearAuth();
    }
  },

  async refreshToken(): Promise<string | null> {
    try {
      const session = await fetchAuthSession({ forceRefresh: true });
      const token = session.tokens?.accessToken?.toString() || null;
      if (token) {
        useAuthStore.getState().refreshToken(token);
      }
      return token;
    } catch (error) {
      this.logout();
      return null;
    }
  }
};