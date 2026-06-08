import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react-native';
import { BedCard } from '../../components/BedCard';
import { Bed } from '../../types/bed.types';

describe('BedCard Component', () => {
  const mockBed: Bed = {
    bedId: '01',
    patientName: 'John Doe',
    status: 'STABLE',
    targetFlowRate: 80.456,
    batteryLevel: 95,
    volRemaining: 450,
    lastUpdated: '2026-06-08T12:00:00Z',
  };

  test('should render patient name, bed ID, battery level, flow rate, and remaining volume correctly', async () => {
    await render(<BedCard bed={mockBed} onPress={jest.fn()} />);

    expect(screen.getByText('01')).toBeTruthy();
    expect(screen.getByText('John Doe')).toBeTruthy();
    expect(screen.getByText('95%')).toBeTruthy();
    // Flow rate targetFlowRate (80.456) should format to 2 decimal places: 80.46
    expect(screen.getByText(/80\.46/)).toBeTruthy();
    // Remaining volume (450) should format to 0 decimal places: 450
    expect(screen.getByText(/450/)).toBeTruthy();
  });

  test('should trigger onPress callback on press', async () => {
    const handlePress = jest.fn();
    await render(<BedCard bed={mockBed} onPress={handlePress} />);

    const cardButton = screen.getByText('John Doe');
    fireEvent.press(cardButton);

    expect(handlePress).toHaveBeenCalledTimes(1);
  });
});
