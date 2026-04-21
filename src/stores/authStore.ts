import { create } from 'zustand';
import { Nurse } from '../types/auth.types';

interface AuthStore {
  // STATE
  token: string | null;
  nurse: Nurse | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  // ACTIONS
  setAuth: (token: string, nurse: Nurse) => void;
  clearAuth: () => void;
  refreshToken: (token: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  token: null,
  nurse: null,
  isAuthenticated: false,
  isLoading: false,

  setAuth: (token, nurse) => set({ 
    token, 
    nurse, 
    isAuthenticated: true, 
    isLoading: false 
  }),
  clearAuth: () => set({ 
    token: null, 
    nurse: null, 
    isAuthenticated: false 
  }),
  refreshToken: (token) => set({ token }),
  setLoading: (isLoading) => set({ isLoading }),
}));