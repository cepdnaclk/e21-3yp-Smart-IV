import { describe, test, expect, beforeEach, vi } from 'vitest';
import { useAlertsStore } from '../store';
import { AlertRow } from '../types';

describe('useAlertsStore.resolveAlert', () => {

  beforeEach(() => {
    // Reset Zustand store to default/empty state before each test
    useAlertsStore.setState({ alerts: [], activeAlerts: [] });
    vi.restoreAllMocks();
  });

  test('marks alert as resolved in history and removes from activeAlerts', () => {
    const mockTimeStr = '2026-07-10T05:00:00.000Z';
    vi.spyOn(Date.prototype, 'toISOString').mockReturnValue(mockTimeStr);

    const alert: AlertRow = {
      id: 200,
      bedId: '07',
      sessionId: 'sess-7',
      alertType: 'BATTERY_LOW',
      ts: '2026-07-10T04:00:00Z',
      resolvedAt: null,
      resolvedBy: null
    };

    useAlertsStore.getState().addAlert(alert);
    expect(useAlertsStore.getState().activeAlerts.length).toBe(1);

    useAlertsStore.getState().resolveAlert(200, 'Nurse Jane');

    const state = useAlertsStore.getState();
    expect(state.activeAlerts.length).toBe(0);
    expect(state.alerts.length).toBe(1);
    expect(state.alerts[0].resolvedAt).toBe(mockTimeStr);
    expect(state.alerts[0].resolvedBy).toBe('Nurse Jane');
  });

  test('leaves alert contents unchanged if alert ID is not found', () => {
    const alert: AlertRow = {
      id: 200,
      bedId: '07',
      sessionId: 'sess-7',
      alertType: 'BATTERY_LOW',
      ts: '2026-07-10T04:00:00Z',
      resolvedAt: null,
      resolvedBy: null
    };

    useAlertsStore.getState().addAlert(alert);
    useAlertsStore.getState().resolveAlert(999, 'Nurse Jane');

    const state = useAlertsStore.getState();
    expect(state.activeAlerts.length).toBe(1);
    expect(state.alerts.length).toBe(1);
    expect(state.alerts[0].resolvedAt).toBeNull();
  });

  test('handles empty resolver name string', () => {
    const mockTimeStr = '2026-07-10T05:00:00.000Z';
    vi.spyOn(Date.prototype, 'toISOString').mockReturnValue(mockTimeStr);

    const alert: AlertRow = {
      id: 300,
      bedId: '09',
      sessionId: 'sess-9',
      alertType: 'BLOCKAGE',
      ts: '2026-07-10T04:00:00Z',
      resolvedAt: null,
      resolvedBy: null
    };

    useAlertsStore.getState().addAlert(alert);
    useAlertsStore.getState().resolveAlert(300, '');

    const state = useAlertsStore.getState();
    expect(state.alerts[0].resolvedBy).toBe('');
    expect(state.alerts[0].resolvedAt).toBe(mockTimeStr);
  });

  test('resolves only the selected alert when multiple alerts are active', () => {
    const firstAlert: AlertRow = {
      id: 401,
      bedId: '01',
      sessionId: 'sess-1',
      alertType: 'BLOCKAGE',
      ts: '2026-07-10T04:00:00Z',
      resolvedAt: null,
      resolvedBy: null
    };

    const secondAlert: AlertRow = {
      id: 402,
      bedId: '02',
      sessionId: 'sess-2',
      alertType: 'EMPTY_BAG',
      ts: '2026-07-10T04:01:00Z',
      resolvedAt: null,
      resolvedBy: null
    };

    useAlertsStore.getState().addAlert(firstAlert);
    useAlertsStore.getState().addAlert(secondAlert);

    useAlertsStore.getState().resolveAlert(401, 'Nurse A');

    const state = useAlertsStore.getState();

    const resolvedAlert = state.alerts.find(
      (alert) => alert.id === 401
    );

    const remainingActiveAlert = state.activeAlerts.find(
      (alert) => alert.id === 402
    );

    expect(resolvedAlert?.resolvedAt).not.toBeNull();
    expect(resolvedAlert?.resolvedBy).toBe('Nurse A');

    expect(state.activeAlerts).toHaveLength(1);
    expect(remainingActiveAlert).toBeDefined();
    expect(remainingActiveAlert?.resolvedAt).toBeNull();
  });


});
