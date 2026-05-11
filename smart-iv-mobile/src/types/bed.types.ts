export type BedStatus = 'STABLE' | 'ALERT' | 'CRITICAL' | 'OFFLINE';

export interface Bed {
  id: number;
  bedId: string;           
  ward: string;            
  patientName: string;
  status: BedStatus;
  targetFlowRate: number;  
  batteryLevel: number;    
  lastUpdated: string;     
}

export interface FlowLog {
  id: number;
  bedId: number;           
  dropsPerMin: number;
  volumeInfused: number;   
  volumeRemaining: number; 
  recordedAt: string;      
}

export interface BedDetail extends Bed {
  flowHistory: FlowLog[];  
  activeAlert: import('./alert.types').Alert | null;
}