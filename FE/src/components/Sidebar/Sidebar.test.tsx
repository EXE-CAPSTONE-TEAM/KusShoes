import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '../../context/ThemeContext';
import type { SettingTab } from '../../pages/Settings/settingsNavigation';
import { Sidebar } from './Sidebar';

afterEach(cleanup);

function renderSidebar({
  activePage = 'dashboard',
  activeSettingTab = 'profile',
}: {
  activePage?: string;
  activeSettingTab?: SettingTab;
} = {}) {
  const setActivePage = vi.fn();

  render(
    <ThemeProvider>
      <Sidebar
        activePage={activePage}
        activeSettingTab={activeSettingTab}
        setActivePage={setActivePage}
        onLogout={vi.fn()}
        projects={[]}
      />
    </ThemeProvider>,
  );

  return { setActivePage };
}

describe('Sidebar settings submenu', () => {
  it('opens Settings from another page and navigates to the selected tab', () => {
    const { setActivePage } = renderSidebar();
    const settingsButton = screen.getByRole('button', { name: 'Settings' });

    expect(settingsButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Profile Details' })).not.toBeInTheDocument();

    fireEvent.click(settingsButton);

    expect(settingsButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Profile Details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Security & Auth' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Model Privacy' })).toBeInTheDocument();
    expect(setActivePage).toHaveBeenCalledWith('settings?tab=profile');
  });

  it('marks the current setting and allows the submenu to collapse', () => {
    renderSidebar({ activePage: 'settings', activeSettingTab: 'privacy' });
    const settingsButton = screen.getByRole('button', { name: 'Settings' });
    const privacyButton = screen.getByRole('button', { name: 'Model Privacy' });

    expect(settingsButton).toHaveAttribute('aria-expanded', 'true');
    expect(privacyButton).toHaveAttribute('aria-current', 'page');

    fireEvent.click(settingsButton);

    expect(settingsButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Model Privacy' })).not.toBeInTheDocument();
  });

  it('routes every submenu item to its canonical settings URL', () => {
    const { setActivePage } = renderSidebar({ activePage: 'settings' });

    fireEvent.click(screen.getByRole('button', { name: 'Profile Details' }));
    fireEvent.click(screen.getByRole('button', { name: 'Security & Auth' }));
    fireEvent.click(screen.getByRole('button', { name: 'Model Privacy' }));

    expect(setActivePage).toHaveBeenNthCalledWith(1, 'settings?tab=profile');
    expect(setActivePage).toHaveBeenNthCalledWith(2, 'settings?tab=security');
    expect(setActivePage).toHaveBeenNthCalledWith(3, 'settings?tab=privacy');
  });
});
