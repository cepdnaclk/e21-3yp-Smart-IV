import { signIn, signOut, fetchAuthSession, fetchUserAttributes } from 'aws-amplify/auth';
import { useAuthStore } from '../stores/authStore';
import { useBedStore } from '../stores/bedStore';
import { useAlertStore } from '../stores/alertStore';
import { Nurse, NurseRole } from '../types/auth.types';

export const authService = {
  async login(email: string, password: string): Promise<void> {
    useAuthStore.getState().setLoading(true);
    try {
      const { isSignedIn } = await signIn({ username: email, password });
      
      if (isSignedIn) {
        const session = await fetchAuthSession();
        const token = session.tokens?.accessToken?.toString() || null;
        const attributes = await fetchUserAttributes();
        
        if (token) {
          const nurse: Nurse = {
            id: parseInt(attributes['custom:id'] || '0', 10),
            cognitoId: attributes.sub || '',
            name: attributes.name || 'Nurse',
            email: attributes.email || email,
            ward: attributes['custom:ward'] || 'General',
            role: (attributes['custom:role'] as NurseRole) || 'NURSE',
          };
          
          useAuthStore.getState().setAuth(token, nurse);
        }
      }
    } catch (error) {
      console.error('Login failed', error);
      throw error;
    } finally {
      useAuthStore.getState().setLoading(false);
    }
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