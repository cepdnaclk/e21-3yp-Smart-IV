import { create } from 'zustand';
import { Alert } from '../types/alert.types';

interface AlertStore {
  // STATE
  alerts: Alert[];
  history: Alert[];
  unreadCount: number;
  isLoading: boolean;

  // ACTIONS
  setAlerts: (alerts: Alert[]) => void;
  addAlert: (alert: Alert) => void;
  acknowledgeAlert: (alertId: number) => void;
  setHistory: (history: Alert[]) => void;
  clearUnread: () => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useAlertStore = create<AlertStore>((set) => ({
  alerts: [],
  history: [],
  unreadCount: 0,
  isLoading: false,

  setAlerts: (alerts) => set({ alerts }),
  addAlert: (alert) => set((state) => ({
    alerts: [alert, ...state.alerts],
    unreadCount: state.unreadCount + 1,
  })),
  acknowledgeAlert: (alertId) => set((state) => {
    const alert = state.alerts.find(a => a.id === alertId);
    return {
      alerts: state.alerts.filter(a => a.id !== alertId),
      history: alert 
        ? [{ ...alert, resolved: true }, ...state.history] 
        : state.history,
    };
  }),
  setHistory: (history) => set({ history }),
  clearUnread: () => set({ unreadCount: 0 }),
  setLoading: (isLoading) => set({ isLoading }),
  reset: () => set({ 
    alerts: [], 
    history: [], 
    unreadCount: 0, 
    isLoading: false 
  }),
}));