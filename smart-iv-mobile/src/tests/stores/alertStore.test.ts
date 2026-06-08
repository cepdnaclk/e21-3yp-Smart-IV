import { useAlertStore } from '../../stores/alertStore';
import { Alert } from '../../types/alert.types';

describe('useAlertStore', () => {
  beforeEach(() => {
    useAlertStore.getState().reset();
  });

  test('should initialize with default state', () => {
    const state = useAlertStore.getState();
    expect(state.alerts).toEqual([]);
    expect(state.history).toEqual([]);
    expect(state.unreadCount).toBe(0);
    expect(state.isLoading).toBe(false);
  });

  test('should set active alerts', () => {
    const mockAlerts: Alert[] = [
      {
        id: 1,
        bedId: 1,
        bedLabel: 'Bed 01',
        patientName: 'John Doe',
        ward: 'Ward A',
        type: 'BLOCKAGE',
        message: 'IV line blockage detected',
        resolved: false,
        createdAt: '2026-06-08T12:00:00Z',
        resolvedAt: null,
      },
    ];

    useAlertStore.getState().setAlerts(mockAlerts);
    expect(useAlertStore.getState().alerts).toEqual(mockAlerts);
  });

  test('should add a new alert and increment unread count', () => {
    const alert: Alert = {
      id: 2,
      bedId: 2,
      bedLabel: 'Bed 02',
      patientName: 'Jane Smith',
      ward: 'Ward A',
      type: 'EMPTY_BAG',
      message: 'IV bag empty',
      resolved: false,
      createdAt: '2026-06-08T12:05:00Z',
      resolvedAt: null,
    };

    useAlertStore.getState().addAlert(alert);

    const state = useAlertStore.getState();
    expect(state.alerts).toEqual([alert]);
    expect(state.unreadCount).toBe(1);
  });

  test('should acknowledge alert and move it to history', () => {
    const alert1: Alert = {
      id: 1,
      bedId: 1,
      bedLabel: 'Bed 01',
      patientName: 'John Doe',
      ward: 'Ward A',
      type: 'BLOCKAGE',
      message: 'IV line blockage detected',
      resolved: false,
      createdAt: '2026-06-08T12:00:00Z',
      resolvedAt: null,
    };
    useAlertStore.setState({ alerts: [alert1], history: [] });

    useAlertStore.getState().acknowledgeAlert(1);

    const state = useAlertStore.getState();
    expect(state.alerts).toEqual([]);
    expect(state.history).toEqual([{ ...alert1, resolved: true }]);
  });

  test('should clear unread count', () => {
    useAlertStore.setState({ unreadCount: 5 });
    useAlertStore.getState().clearUnread();
    expect(useAlertStore.getState().unreadCount).toBe(0);
  });

  test('should set history', () => {
    const historyAlerts: Alert[] = [
      {
        id: 3,
        bedId: 3,
        bedLabel: 'Bed 03',
        patientName: 'Alice Green',
        ward: 'Ward A',
        type: 'DEVICE_OFFLINE',
        message: 'Device went offline',
        resolved: true,
        createdAt: '2026-06-08T11:00:00Z',
        resolvedAt: '2026-06-08T11:15:00Z',
      },
    ];

    useAlertStore.getState().setHistory(historyAlerts);
    expect(useAlertStore.getState().history).toEqual(historyAlerts);
  });

  test('should set loading state', () => {
    useAlertStore.getState().setLoading(true);
    expect(useAlertStore.getState().isLoading).toBe(true);
  });
});
