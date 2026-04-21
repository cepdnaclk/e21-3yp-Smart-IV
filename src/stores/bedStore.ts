import { create } from 'zustand';
import { Bed, BedDetail } from '../types/bed.types';

interface BedStore {
  // STATE
  beds: Bed[];
  selectedBedId: string | null;
  bedDetail: BedDetail | null;
  isLoading: boolean;
  error: string | null;

  // ACTIONS
  setBeds: (beds: Bed[]) => void;
  updateBed: (bedId: string, update: Partial<Bed>) => void;
  setBedDetail: (detail: BedDetail) => void;
  selectBed: (bedId: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

export const useBedStore = create<BedStore>((set) => ({
  beds: [],
  selectedBedId: null,
  bedDetail: null,
  isLoading: false,
  error: null,

  setBeds: (beds) => set({ beds }),
  updateBed: (bedId, update) => set((state) => ({
    beds: state.beds.map(b => 
      b.bedId === bedId ? { ...b, ...update } : b
    )
  })),
  setBedDetail: (bedDetail) => set({ bedDetail }),
  selectBed: (selectedBedId) => set({ selectedBedId }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  reset: () => set({ 
    beds: [], 
    selectedBedId: null, 
    bedDetail: null, 
    isLoading: false, 
    error: null 
  }),
}));