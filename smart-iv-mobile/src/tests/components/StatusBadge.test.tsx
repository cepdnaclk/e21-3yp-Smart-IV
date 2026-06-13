import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { StatusBadge } from '../../components/StatusBadge';

describe('StatusBadge Component', () => {
  test('should render stable status badge correctly', async () => {
    await render(<StatusBadge status="STABLE" />);
    expect(screen.getByText('STABLE')).toBeTruthy();
  });

  test('should render alert status badge correctly', async () => {
    await render(<StatusBadge status="ALERT" />);
    expect(screen.getByText('ALERT')).toBeTruthy();
  });

  test('should render critical status badge correctly', async () => {
    await render(<StatusBadge status="CRITICAL" />);
    expect(screen.getByText('CRITICAL')).toBeTruthy();
  });

  test('should render offline status badge correctly', async () => {
    await render(<StatusBadge status="OFFLINE" />);
    expect(screen.getByText('OFFLINE')).toBeTruthy();
  });
});
