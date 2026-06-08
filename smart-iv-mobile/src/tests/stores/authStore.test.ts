import { useAuthStore } from '../../stores/authStore';
import { Nurse } from '../../types/auth.types';

describe('useAuthStore', () => {
  beforeEach(() => {
    // Reset state before each test
    useAuthStore.setState({
      token: null,
      nurse: null,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  test('should initialize with default state', () => {
    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.nurse).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  test('should set authentication state', () => {
    const mockNurse: Nurse = {
      id: 1,
      cognitoId: 'sub-123',
      name: 'Nurse Joy',
      email: 'joy@hospital.com',
      ward: 'Ward A',
      role: 'NURSE',
    };
    const mockToken = 'mock-jwt-token';

    useAuthStore.getState().setAuth(mockToken, mockNurse);

    const state = useAuthStore.getState();
    expect(state.token).toBe(mockToken);
    expect(state.nurse).toEqual(mockNurse);
    expect(state.isAuthenticated).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  test('should clear authentication state', () => {
    const mockNurse: Nurse = {
      id: 1,
      cognitoId: 'sub-123',
      name: 'Nurse Joy',
      email: 'joy@hospital.com',
      ward: 'Ward A',
      role: 'NURSE',
    };
    useAuthStore.setState({
      token: 'mock-jwt-token',
      nurse: mockNurse,
      isAuthenticated: true,
    });

    useAuthStore.getState().clearAuth();

    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.nurse).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });

  test('should refresh token', () => {
    useAuthStore.setState({ token: 'old-token' });

    useAuthStore.getState().refreshToken('new-token');

    expect(useAuthStore.getState().token).toBe('new-token');
  });

  test('should set loading state', () => {
    useAuthStore.getState().setLoading(true);
    expect(useAuthStore.getState().isLoading).toBe(true);

    useAuthStore.getState().setLoading(false);
    expect(useAuthStore.getState().isLoading).toBe(false);
  });
});
