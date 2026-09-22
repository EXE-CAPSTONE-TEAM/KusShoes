import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Navbar } from './Navbar';

vi.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'dark', toggleTheme: vi.fn() }),
}));

afterEach(cleanup);

describe('Navbar mobile menu', () => {
  it('opens from the hamburger, navigates and closes', () => {
    const navigate = vi.fn();
    render(<Navbar navigate={navigate} currentPage="landing" />);

    const toggle = screen.getByRole('button', { name: /open menu/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('navigation', { name: /main menu/i })).not.toBeInTheDocument();

    fireEvent.click(toggle);
    const menu = screen.getByRole('navigation', { name: /main menu/i });
    expect(screen.getByRole('button', { name: /close menu/i })).toHaveAttribute('aria-expanded', 'true');
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(menu.querySelector('a[href="/pricing"]')!);
    expect(navigate).toHaveBeenCalledWith('/pricing');
  });

  it('closes on Escape and restores page scrolling', () => {
    render(<Navbar navigate={vi.fn()} currentPage="landing" />);
    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument();
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
