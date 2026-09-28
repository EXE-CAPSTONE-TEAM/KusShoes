import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoadingDots } from './LoadingDots';

describe('LoadingDots component', () => {
  it('renders with role="status" and default aria-label', () => {
    render(<LoadingDots />);
    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute('aria-label', 'Loading…');
  });

  it('renders custom label when provided', () => {
    render(<LoadingDots label="Fetching your data..." />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-label', 'Fetching your data...');
    expect(screen.getByText('Fetching your data...')).toBeInTheDocument();
  });

  it('renders three dots for animation', () => {
    const { container } = render(<LoadingDots />);
    const dots = container.querySelectorAll('span[aria-hidden="true"] > span');
    expect(dots.length).toBe(3);
  });
});
