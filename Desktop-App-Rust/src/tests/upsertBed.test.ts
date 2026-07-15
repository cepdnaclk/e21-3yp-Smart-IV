import { describe, test, expect, beforeEach, vi } from 'vitest';
import { useBedsStore } from '../store';
import { BedPacket } from '../types';

describe('useBedsStore.upsertBed', () => {

  test('updates one bed without modifying an unrelated bed', () => {
    useBedsStore.getState().upsertBed({
      bedId: '12',
      sessionId: 'sess-12',
      flowRate: 60,
      volRemaining: 300,
      maxVolume: 500,
      targetMlhr: 60,
      battery: 90,
      status: 'STABLE',
      dropFactor: 20,
      patientName: 'Patient A',
      ward: 'Ward A'
    });

    useBedsStore.getState().upsertBed({
      bedId: '13',
      sessionId: 'sess-13',
      flowRate: 45,
      volRemaining: 250,
      maxVolume: 500,
      targetMlhr: 45,
      battery: 80,
      status: 'STABLE',
      dropFactor: 20,
      patientName: 'Patient B',
      ward: 'Ward B'
    });

    useBedsStore.getState().upsertBed({
      bedId: '12',
      sessionId: 'sess-12',
      flowRate: 75,
      volRemaining: 280,
      maxVolume: 500,
      targetMlhr: 60,
      battery: 88,
      status: 'STABLE',
      dropFactor: 20
    });

    const state = useBedsStore.getState();

    expect(state.beds['12'].flowRate).toBe(75);

    expect(state.beds['13'].flowRate).toBe(45);
    expect(state.beds['13'].patientName).toBe('Patient B');
    expect(state.beds['13'].ward).toBe('Ward B');

    expect(Object.keys(state.beds)).toHaveLength(2);
  });

  beforeEach(() => {
    // Reset Zustand store to default/empty state before each test
    useBedsStore.setState({ beds: {} });
    vi.restoreAllMocks();
  });

  test('adds new bed with default metadata and sets isConnected=true for STABLE status', () => {
    const packet: BedPacket = {
      bedId: '10',
      sessionId: 'sess-10',
      flowRate: 80,
      volRemaining: 450,
      maxVolume: 500,
      targetMlhr: 80,
      battery: 85,
      status: 'STABLE',
      dropFactor: 20
    };

    useBedsStore.getState().upsertBed(packet);

    const state = useBedsStore.getState();
    const bed = state.beds['10'];
    expect(bed).toBeDefined();
    expect(bed.patientName).toBe('Patient 10');
    expect(bed.ward).toBe('Ward A');
    expect(bed.isConnected).toBe(true);
  });

  test('sets isConnected=false when status is CONN_LOST', () => {
    const packet: BedPacket = {
      bedId: '10',
      sessionId: 'sess-10',
      flowRate: 0,
      volRemaining: 450,
      maxVolume: 500,
      targetMlhr: 80,
      battery: 85,
      status: 'CONN_LOST',
      dropFactor: 20
    };

    useBedsStore.getState().upsertBed(packet);

    const bed = useBedsStore.getState().beds['10'];
    expect(bed.isConnected).toBe(false);
  });

  test('sets isConnected=false when status is OFFLINE', () => {
    const packet: BedPacket = {
      bedId: '10',
      sessionId: null,
      flowRate: 0,
      volRemaining: 0,
      maxVolume: 500,
      targetMlhr: 0,
      battery: 0,
      status: 'OFFLINE',
      dropFactor: 20
    };

    useBedsStore.getState().upsertBed(packet);

    const bed = useBedsStore.getState().beds['10'];
    expect(bed.isConnected).toBe(false);
  });

  test('updates existing bed telemetry but preserves existing patientName and ward', () => {
    // 1. Initial upsert with specific metadata
    useBedsStore.getState().upsertBed({
      bedId: '12',
      sessionId: 'sess-12',
      flowRate: 60,
      volRemaining: 300,
      maxVolume: 500,
      targetMlhr: 60,
      battery: 90,
      status: 'STABLE',
      dropFactor: 20,
      patientName: 'Sunil Perera',
      ward: 'Ward B'
    });

    // 2. Telemetry update packet (missing patientName and ward fields)
    const telemetryUpdate: BedPacket = {
      bedId: '12',
      sessionId: 'sess-12',
      flowRate: 58,
      volRemaining: 280,
      maxVolume: 500,
      targetMlhr: 60,
      battery: 88,
      status: 'STABLE',
      dropFactor: 20
    };

    useBedsStore.getState().upsertBed(telemetryUpdate);

    const bed = useBedsStore.getState().beds['12'];
    expect(bed.flowRate).toBe(58);
    expect(bed.volRemaining).toBe(280);
    expect(bed.battery).toBe(88);
    expect(bed.patientName).toBe('Sunil Perera');
    expect(bed.ward).toBe('Ward B');
  });

  test('overrides patientName and ward if explicitly provided', () => {
    // Initialize bed
    useBedsStore.getState().upsertBed({
      bedId: '12',
      sessionId: 'sess-12',
      flowRate: 60,
      volRemaining: 300,
      maxVolume: 500,
      targetMlhr: 60,
      battery: 90,
      status: 'STABLE',
      dropFactor: 20,
      patientName: 'Sunil Perera',
      ward: 'Ward B'
    });

    // Override metadata in a subsequent packet
    useBedsStore.getState().upsertBed({
      bedId: '12',
      sessionId: 'sess-12',
      flowRate: 60,
      volRemaining: 295,
      maxVolume: 500,
      targetMlhr: 60,
      battery: 89,
      status: 'STABLE',
      dropFactor: 20,
      patientName: 'Sunil Bandara',
      ward: 'ICU'
    });

    const bed = useBedsStore.getState().beds['12'];
    expect(bed.patientName).toBe('Sunil Bandara');
    expect(bed.ward).toBe('ICU');
  });

  test('updates lastSeen to the mocked current time', () => {
    const mockTime = 1717171717171;
    vi.spyOn(Date, 'now').mockReturnValue(mockTime);

    const packet: BedPacket = {
      bedId: '15',
      sessionId: 'sess-15',
      flowRate: 75,
      volRemaining: 400,
      maxVolume: 500,
      targetMlhr: 75,
      battery: 95,
      status: 'STABLE',
      dropFactor: 20
    };

    useBedsStore.getState().upsertBed(packet);

    const bed = useBedsStore.getState().beds['15'];
    expect(bed.lastSeen).toBe(mockTime);
  });

  test('handles boundary values for battery (0 and 100)', () => {
    // Test battery = 0
    useBedsStore.getState().upsertBed({
      bedId: '00',
      sessionId: 'sess-0',
      flowRate: 0,
      volRemaining: 100,
      maxVolume: 500,
      targetMlhr: 50,
      battery: 0,
      status: 'STABLE',
      dropFactor: 20
    });
    expect(useBedsStore.getState().beds['00'].battery).toBe(0);

    // Test battery = 100
    useBedsStore.getState().upsertBed({
      bedId: '00',
      sessionId: 'sess-0',
      flowRate: 0,
      volRemaining: 100,
      maxVolume: 500,
      targetMlhr: 50,
      battery: 100,
      status: 'STABLE',
      dropFactor: 20
    });
    expect(useBedsStore.getState().beds['00'].battery).toBe(100);
  });

  test('stores raw invalid telemetry values because validation is not implemented in the store', () => {
    useBedsStore.getState().upsertBed({
      bedId: '99',
      sessionId: 'sess-99',
      flowRate: -10,
      volRemaining: -5,
      maxVolume: 500,
      targetMlhr: 50,
      battery: -15,
      status: 'STABLE',
      dropFactor: 20
    });

    const bed = useBedsStore.getState().beds['99'];
    expect(bed.battery).toBe(-15);
    expect(bed.flowRate).toBe(-10);
    expect(bed.volRemaining).toBe(-5);
  });

});
