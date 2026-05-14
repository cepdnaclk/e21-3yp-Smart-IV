import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import '@testing-library/jest-dom';
import BedCard from '../components/BedCard';
import { LiveBedState } from '../types';

describe('BedCard Component Tests', () => {

    const mockBedStable: LiveBedState = {
        bedId: '10',
        sessionId: 'sess-1',
        patientName: 'John Doe',
        ward: 'ICU',
        flowRate: 100,
        targetMlhr: 100,
        volRemaining: 400,
        maxVolume: 500,
        battery: 85,
        status: 'STABLE',
        dropFactor: 20,
        lastSeen: Date.now(),
        isConnected: true,
    };

    test('renders basic bed information correctly', () => {
        render(<BedCard bed={mockBedStable} />);

        expect(screen.getByText(/Bed 10/i)).toBeInTheDocument();
        expect(screen.getByText(/John Doe/i)).toBeInTheDocument();
        expect(screen.getByText(/Stable/i)).toBeInTheDocument();
    });

    test('renders blockage state correctly', () => {
        const blockedBed: LiveBedState = {
            ...mockBedStable,
            status: 'BLOCKAGE',
        };

        render(<BedCard bed={blockedBed} />);

        // We use exact string matching because /Blockage/i matches both the badge and the warning overlay!
        expect(screen.getByText('Blockage!')).toBeInTheDocument();
    });

    test('calls onClick handler when clicked', () => {
        const handleClick = vi.fn();

        render(
            <BedCard
                bed={mockBedStable}
                onClick={handleClick}
            />
        );

        const card = screen.getByRole('button');

        fireEvent.click(card);

        expect(handleClick).toHaveBeenCalledTimes(1);
    });

});