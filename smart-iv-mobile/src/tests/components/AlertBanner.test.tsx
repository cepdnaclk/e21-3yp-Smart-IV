import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { AlertBanner } from '../../components/AlertBanner';
import { Alert } from '../../types/alert.types';

describe('AlertBanner Component', () => {
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
    {
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
    },
  ];

  test('should return null when there are no alerts', async () => {
    const { toJSON } = await render(<AlertBanner alerts={[]} onPress={jest.fn()} />);
    expect(toJSON()).toBeNull();
  });

  test('should render active alert count message correctly', async () => {
    await render(<AlertBanner alerts={mockAlerts} onPress={jest.fn()} />);
    expect(screen.getByText('2 active alert(s) require attention')).toBeTruthy();
  });

  test('should call onPress callback when clicked', async () => {
    const handlePress = jest.fn();
    await render(<AlertBanner alerts={mockAlerts} onPress={handlePress} />);
    
    const bannerButton = screen.getByText('2 active alert(s) require attention');
    fireEvent.press(bannerButton);
    
    expect(handlePress).toHaveBeenCalledTimes(1);
  });
});
