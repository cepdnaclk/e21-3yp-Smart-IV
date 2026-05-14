import {
    render,
    screen,
    fireEvent,
    waitFor,
} from '@testing-library/react';

import '@testing-library/jest-dom';

import WardGrid from '../components/WardGrid';
import { useBedsStore } from '../store';

describe('WardGrid Component', () => {

    beforeEach(() => {
        useBedsStore.setState({ beds: {} });
    });

    test('renders empty state when no beds exist', () => {
        render(<WardGrid />);

        expect(
            screen.getByText(/No beds found/i)
        ).toBeInTheDocument();
    });

    test('renders bed cards from store', async () => {

        useBedsStore.getState().upsertBed({
            bedId: '01',
            sessionId: 'sess-1',
            patientName: 'Patient One',
            flowRate: 100,
            targetMlhr: 100,
            volRemaining: 500,
            maxVolume: 1000,
            battery: 100,
            status: 'STABLE',
            dropFactor: 20,
        });

        render(<WardGrid />);

        await waitFor(() => {
            expect(
                screen.getByText(/Patient One/i)
            ).toBeInTheDocument();
        });

        expect(
            screen.queryByText(/No beds found/i)
        ).not.toBeInTheDocument();
    });

    test('filters beds using search', async () => {

        useBedsStore.getState().upsertBed({
            bedId: '01',
            sessionId: 's1',
            patientName: 'Alice',
            flowRate: 0,
            targetMlhr: 0,
            volRemaining: 0,
            maxVolume: 0,
            battery: 0,
            status: 'STABLE',
            dropFactor: 20,
        });

        useBedsStore.getState().upsertBed({
            bedId: '02',
            sessionId: 's2',
            patientName: 'Bob',
            flowRate: 0,
            targetMlhr: 0,
            volRemaining: 0,
            maxVolume: 0,
            battery: 0,
            status: 'STABLE',
            dropFactor: 20,
        });

        render(<WardGrid />);

        const searchInput =
            screen.getByPlaceholderText(/Search bed, patient/i);

        fireEvent.change(searchInput, {
            target: { value: 'Bob' },
        });

        await waitFor(() => {
            expect(
                screen.queryByText(/Alice/i)
            ).not.toBeInTheDocument();

            expect(
                screen.getByText(/Bob/i)
            ).toBeInTheDocument();
        });
    });

});