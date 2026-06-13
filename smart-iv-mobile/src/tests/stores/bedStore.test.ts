import { useBedStore } from '../../stores/bedStore';
import { Bed, BedDetail } from '../../types/bed.types';

describe('useBedStore', () => {
  beforeEach(() => {
    useBedStore.getState().reset();
  });

  test('should initialize with default state', () => {
    const state = useBedStore.getState();
    expect(state.beds).toEqual([]);
    expect(state.selectedBedId).toBeNull();
    expect(state.bedDetail).toBeNull();
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  test('should set beds', () => {
    const mockBeds: Bed[] = [
      {
        bedId: '01',
        patientName: 'John Doe',
        status: 'STABLE',
        targetFlowRate: 80,
        batteryLevel: 90,
        volRemaining: 450,
        lastUpdated: '2026-06-08T12:00:00Z',
      },
    ];

    useBedStore.getState().setBeds(mockBeds);
    expect(useBedStore.getState().beds).toEqual(mockBeds);
  });

  test('should update a specific bed', () => {
    const mockBeds: Bed[] = [
      {
        bedId: '01',
        patientName: 'John Doe',
        status: 'STABLE',
        targetFlowRate: 80,
        batteryLevel: 90,
        volRemaining: 450,
        lastUpdated: '2026-06-08T12:00:00Z',
      },
      {
        bedId: '02',
        patientName: 'Jane Smith',
        status: 'STABLE',
        targetFlowRate: 100,
        batteryLevel: 80,
        volRemaining: 300,
        lastUpdated: '2026-06-08T12:00:00Z',
      },
    ];
    useBedStore.setState({ beds: mockBeds });

    useBedStore.getState().updateBed('01', {
      status: 'CRITICAL',
      volRemaining: 400,
    });

    const beds = useBedStore.getState().beds;
    expect(beds[0].status).toBe('CRITICAL');
    expect(beds[0].volRemaining).toBe(400);
    expect(beds[1].status).toBe('STABLE'); // unchanged
  });

  test('should set bed detail', () => {
    const mockDetail: BedDetail = {
      bedId: '01',
      patientName: 'John Doe',
      ward: 'Ward A',
      status: 'STABLE',
      targetFlowRate: 80,
      volRemaining: 450,
      maxVolume: 500,
      batteryLevel: 90,
      dropFactor: 20,
      macAddress: '00:11:22:33:44:55',
      sessionStartedAt: '2026-06-08T10:00:00Z',
      flowRateHistory: [{ time: '10:00', rate: 80 }],
    };

    useBedStore.getState().setBedDetail(mockDetail);
    expect(useBedStore.getState().bedDetail).toEqual(mockDetail);
  });

  test('should select a bed ID', () => {
    useBedStore.getState().selectBed('02');
    expect(useBedStore.getState().selectedBedId).toBe('02');
  });

  test('should set loading and error states', () => {
    useBedStore.getState().setLoading(true);
    expect(useBedStore.getState().isLoading).toBe(true);

    useBedStore.getState().setError('Failed to fetch beds');
    expect(useBedStore.getState().error).toBe('Failed to fetch beds');
  });
});
