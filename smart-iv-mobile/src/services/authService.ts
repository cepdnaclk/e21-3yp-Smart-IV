import { signIn, confirmSignIn, signOut, fetchAuthSession, fetchUserAttributes } from 'aws-amplify/auth';
import { useAuthStore } from '../stores/authStore';
import { useBedStore } from '../stores/bedStore';
import { useAlertStore } from '../stores/alertStore';
import { Nurse, NurseRole } from '../types/auth.types';

export const authService = {
  async login(email: string, password: string): Promise<void> {
    useAuthStore.getState().setLoading(true);
    try {
      const { isSignedIn, nextStep } = await signIn({
        username: email,
        password,
        options: {
          authFlowType: 'USER_PASSWORD_AUTH'
        }
      });
      if (isSignedIn) {
        await this.checkSession();
      } else if (nextStep && nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
        // Automatically confirm and transition the temporary password into a permanent one!
        const confirmResult = await confirmSignIn({
          challengeResponse: password
        });
        if (confirmResult.isSignedIn) {
          await this.checkSession();
        } else {
          throw new Error(`Sign in failed - next step required: ${confirmResult.nextStep.signInStep}`);
        }
      } else {
        throw new Error(`Sign in failed - next step required: ${nextStep?.signInStep}`);
      }
    } catch (error: any) {
      console.error('Sign in error:', error.name, error.message);
      throw new Error(error.message || 'Login failed. Please check your credentials.');
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
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Session check timed out')), 5000)
    );
    try {
      const session = await Promise.race([fetchAuthSession(), timeout]);
      const token = (session as any).tokens?.accessToken?.toString();

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
      // Session expired, no network, or timed out — go to login
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