export type NurseRole = 'NURSE' | 'HEAD_NURSE' | 'ADMIN';

export interface Nurse {
  id: number;
  cognitoId: string;
  name: string;
  email: string;
  ward: string;
  role: NurseRole;
}

export interface AuthState {
  token: string | null;
  nurse: Nurse | null;
  isAuthenticated: boolean;
}