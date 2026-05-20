import { describe, test, expect, beforeEach } from 'vitest';
import { useBedsStore, useAlertsStore, useSerialStore, useSettingsStore } from '../store';
import { BedPacket, AlertRow } from '../types';

describe('State Management Tests', () => {

    beforeEach(() => {
        useBedsStore.setState({ beds: {} });
        useAlertsStore.setState({ alerts: [], activeAlerts: [] });
        useSerialStore.setState({ connected: false, port: null, packetCount: 0, lastPacketAt: null, mqttConnected: false });
    });

    describe('useBedsStore', () => {
        test('upsertBed adds a new bed with defaults', () => {
            const mockPacket: BedPacket = {
                bedId: '01',
                sessionId: 'sess-1',
                flowRate: 100,
                volRemaining: 500,
                maxVolume: 500,
                targetMlhr: 100,
                battery: 100,
                status: 'STABLE',
                dropFactor: 20
            };

            useBedsStore.getState().upsertBed(mockPacket);

            const state = useBedsStore.getState();
            expect(state.beds['01']).toBeDefined();
            expect(state.beds['01'].patientName).toBe('Patient 01');
            expect(state.beds['01'].isConnected).toBe(true);
        });

        test('upsertBed updates existing bed and keeps metadata', () => {
            useBedsStore.getState().upsertBed({
                bedId: '02',
                sessionId: 'sess-2',
                flowRate: 50,
                volRemaining: 200,
                maxVolume: 500,
                targetMlhr: 50,
                battery: 90,
                status: 'STABLE',
                dropFactor: 20,
                patientName: 'Jane Doe',
                ward: 'Ward B'
            });

            useBedsStore.getState().upsertBed({
                bedId: '02',
                sessionId: 'sess-2',
                flowRate: 75,
                volRemaining: 150,
                maxVolume: 500,
                targetMlhr: 50,
                battery: 88,
                status: 'STABLE',
                dropFactor: 20
            });

            const bed = useBedsStore.getState().beds['02'];
            expect(bed.flowRate).toBe(75);
            expect(bed.patientName).toBe('Jane Doe');
            expect(bed.ward).toBe('Ward B');
        });

        test('removeBed deletes a bed correctly', () => {
            useBedsStore.getState().upsertBed({
                bedId: '03', sessionId: 'x', flowRate: 0, volRemaining: 0, maxVolume: 0, targetMlhr: 0, battery: 0, status: 'STABLE', dropFactor: 20
            });
            expect(Object.keys(useBedsStore.getState().beds).length).toBe(1);

            useBedsStore.getState().removeBed('03');
            expect(Object.keys(useBedsStore.getState().beds).length).toBe(0);
        });
    });

    describe('useAlertsStore', () => {
        const mockAlert: AlertRow = {
            id: 1,
            bedId: '01',
            sessionId: 'sess-1',
            alertType: 'BLOCKAGE',
            ts: '2024-01-01T12:00:00Z',
            resolvedAt: null,
            resolvedBy: null
        };

        test('addAlert adds to both alerts and activeAlerts', () => {
            useAlertsStore.getState().addAlert(mockAlert);

            const state = useAlertsStore.getState();
            expect(state.alerts.length).toBe(1);
            expect(state.activeAlerts.length).toBe(1);
        });

        test('resolveAlert removes from activeAlerts and updates alerts array', () => {
            useAlertsStore.getState().addAlert(mockAlert);
            useAlertsStore.getState().resolveAlert(1, 'Nurse Alice');

            const state = useAlertsStore.getState();
            expect(state.activeAlerts.length).toBe(0);
            expect(state.alerts.length).toBe(1);
            expect(state.alerts[0].resolvedBy).toBe('Nurse Alice');
            expect(state.alerts[0].resolvedAt).toBeDefined();
        });
    });

    describe('useSerialStore', () => {
        test('incrementPacket increases count and sets timestamp', () => {
            const store = useSerialStore.getState();
            expect(store.packetCount).toBe(0);
            expect(store.lastPacketAt).toBeNull();

            store.incrementPacket();

            const newState = useSerialStore.getState();
            expect(newState.packetCount).toBe(1);
            expect(newState.lastPacketAt).toBeGreaterThan(0);
        });

        test('setConnected updates port state', () => {
            useSerialStore.getState().setConnected(true, 'COM3');

            const state = useSerialStore.getState();
            expect(state.connected).toBe(true);
            expect(state.port).toBe('COM3');
        });
    });

    describe('useSettingsStore', () => {
        test('updateSettings partially updates state without overriding all', () => {
            useSettingsStore.getState().updateSettings({ baudRate: 9600 });

            const settings = useSettingsStore.getState().settings;
            expect(settings.baudRate).toBe(9600);
            expect(settings.serialPort).toBe('COM3');
        });
    });

});
