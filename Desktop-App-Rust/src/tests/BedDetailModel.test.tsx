import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import '@testing-library/jest-dom';
import BedDetailModal from '../components/BedDetailModal';
import { LiveBedState } from '../types';

globalThis.ResizeObserver = class ResizeObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
};

describe('BedDetailModal Component', () => {

    const mockBed: LiveBedState = {
        bedId: '05',
        sessionId: 'sess-5',
        patientName: 'Jane Smith',
        ward: 'ICU',
        flowRate: 50,
        targetMlhr: 50,
        volRemaining: 200,
        maxVolume: 1000,
        battery: 95,
        status: 'STABLE',
        dropFactor: 20,
        lastSeen: Date.now(),
        isConnected: true,
    };

    test('renders modal correctly', () => {
        render(
            <BedDetailModal
                bed={mockBed}
                onClose={vi.fn()}
            />
        );

        expect(screen.getByText(/Jane Smith/i)).toBeInTheDocument();
        expect(screen.getByText(/Bed 05/i)).toBeInTheDocument();
    });

    test('calls onClose when close button clicked', () => {
        const handleClose = vi.fn();

        render(
            <BedDetailModal
                bed={mockBed}
                onClose={handleClose}
            />
        );

        const closeButton = screen.getByRole('button', {
            name: /Close/i,
        });

        fireEvent.click(closeButton);

        expect(handleClose).toHaveBeenCalledTimes(1);
    });

});