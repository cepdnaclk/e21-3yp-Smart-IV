import { describe, test, expect, beforeEach, vi } from 'vitest';
import { useBedsStore } from '../store';

describe('useBedsStore.setBedMeta', () => {

  beforeEach(() => {
    // Reset Zustand store to default/empty state before each test
    useBedsStore.setState({ beds: {} });
    vi.restoreAllMocks();
  });

  test('updates metadata of an existing bed', () => {
    useBedsStore.getState().upsertBed({
      bedId: '05',
      sessionId: 'sess-5',
      flowRate: 50,
      volRemaining: 200,
      maxVolume: 500,
      targetMlhr: 50,
      battery: 95,
      status: 'STABLE',
      dropFactor: 20
    });

    useBedsStore.getState().setBedMeta('05', {
      patientName: 'Jane Smith',
      ward: 'ICU'
    });

    const bed = useBedsStore.getState().beds['05'];
    expect(bed.patientName).toBe('Jane Smith');
    expect(bed.ward).toBe('ICU');
  });

  test('leaves store completely unchanged if bed does not exist', () => {
    useBedsStore.getState().setBedMeta('99', {
      patientName: 'John Doe',
      ward: 'Ward C'
    });

    const state = useBedsStore.getState();
    expect(state.beds['99']).toBeUndefined();
    expect(Object.keys(state.beds).length).toBe(0);
  });

  test('accepts empty patient and ward metadata without validation', () => {
    useBedsStore.getState().upsertBed({
      bedId: '08',
      sessionId: 'sess-8',
      flowRate: 50,
      volRemaining: 200,
      maxVolume: 500,
      targetMlhr: 50,
      battery: 95,
      status: 'STABLE',
      dropFactor: 20,
      patientName: 'Jane Smith',
      ward: 'ICU'
    });

    useBedsStore.getState().setBedMeta('08', {
      patientName: '',
      ward: ''
    });

    const bed = useBedsStore.getState().beds['08'];
    expect(bed.patientName).toBe('');
    expect(bed.ward).toBe('');
  });

});
