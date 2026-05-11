export type AlertType = 'BLOCKAGE' | 'EMPTY_BAG' | 'LOW_BATTERY' | 'DEVICE_OFFLINE';

export interface Alert {
  id: number;
  bedId: number;           
  bedLabel: string;        
  patientName: string;
  ward: string;
  type: AlertType;
  message: string;
  resolved: boolean;
  createdAt: string;       
  resolvedAt: string | null;
}