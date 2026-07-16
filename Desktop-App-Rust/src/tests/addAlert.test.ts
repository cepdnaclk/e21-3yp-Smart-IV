import { describe, test, expect, beforeEach, vi } from 'vitest';
import { useAlertsStore } from '../store';
import { AlertRow } from '../types';

describe('useAlertsStore.addAlert', () => {

  beforeEach(() => {
    // Reset Zustand store to default/empty state before each test
    useAlertsStore.setState({ alerts: [], activeAlerts: [] });
    vi.restoreAllMocks();
  });

  test('increases alert history from 499 to exactly 500 entries', () => {
    const existingAlerts: AlertRow[] = Array.from(
      { length: 499 },
      (_, index) => ({
        id: index + 1,
        bedId: '01',
        sessionId: 'sess-1',
        alertType: 'BLOCKAGE',
        ts: `2026-07-10T04:00:${String(index % 60).padStart(2, '0')}Z`,
        resolvedAt: '2026-07-10T04:05:00Z',
        resolvedBy: 'Nurse'
      })
    );

    useAlertsStore.setState({
      alerts: existingAlerts,
      activeAlerts: []
    });

    useAlertsStore.getState().addAlert({
      id: 500,
      bedId: '02',
      sessionId: 'sess-2',
      alertType: 'EMPTY_BAG',
      ts: '2026-07-10T05:00:00Z',
      resolvedAt: null,
      resolvedBy: null
    });

    const state = useAlertsStore.getState();

    expect(state.alerts).toHaveLength(500);
    expect(state.alerts[0].id).toBe(500);
    expect(state.activeAlerts).toHaveLength(1);
  });


  test('adds unresolved alert to alerts history and active alerts', () => {
    const alert: AlertRow = {
      id: 101,
      bedId: '03',
      sessionId: 'sess-3',
      alertType: 'BLOCKAGE',
      ts: '2026-07-10T04:00:00Z',
      resolvedAt: null,
      resolvedBy: null
    };

    useAlertsStore.getState().addAlert(alert);

    const state = useAlertsStore.getState();
    expect(state.alerts.length).toBe(1);
    expect(state.alerts[0]).toEqual(alert);
    expect(state.activeAlerts.length).toBe(1);
    expect(state.activeAlerts[0]).toEqual(alert);
  });

  test('adds pre-resolved alert to alerts history but not to active alerts', () => {
    const alert: AlertRow = {
      id: 102,
      bedId: '04',
      sessionId: 'sess-4',
      alertType: 'EMPTY_BAG',
      ts: '2026-07-10T04:00:00Z',
      resolvedAt: '2026-07-10T04:05:00Z',
      resolvedBy: 'Nurse Station'
    };

    useAlertsStore.getState().addAlert(alert);

    const state = useAlertsStore.getState();
    expect(state.alerts.length).toBe(1);
    expect(state.alerts[0]).toEqual(alert);
    expect(state.activeAlerts.length).toBe(0);
  });

  test('caps the history at exactly 500 alerts and discards the oldest', () => {
    const { addAlert } = useAlertsStore.getState();

    for (let i = 1; i <= 500; i++) {
      addAlert({
        id: i,
        bedId: '01',
        sessionId: 'sess-1',
        alertType: 'BLOCKAGE',
        ts: `2026-07-10T04:00:${i.toString().padStart(2, '0')}Z`,
        resolvedAt: '2026-07-10T04:05:00Z',
        resolvedBy: 'Nurse'
      });
    }

    let state = useAlertsStore.getState();
    expect(state.alerts.length).toBe(500);
    expect(state.alerts[499].id).toBe(1);
    expect(state.alerts[0].id).toBe(500);

    addAlert({
      id: 501,
      bedId: '01',
      sessionId: 'sess-1',
      alertType: 'EMPTY_BAG',
      ts: '2026-07-10T05:00:00Z',
      resolvedAt: null,
      resolvedBy: null
    });

    state = useAlertsStore.getState();
    expect(state.alerts.length).toBe(500);
    expect(state.alerts[0].id).toBe(501);
    expect(state.alerts[499].id).toBe(2);
  });

});
