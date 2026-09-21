import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../context/ThemeContext';
import { ToastProvider } from '../../context/ToastContext';

vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
  return {
    ...actual,
    api: {
      profile: vi.fn().mockResolvedValue({
        first_name: 'Duy', last_name: 'Nguyen', email: 'duy@example.com', bio: 'hi', avatar_path: null,
      }),
      usage: vi.fn().mockResolvedValue({
        tier: 'basic_monthly', max_projects: 20, max_exports_per_month: 10, projects_count: 3, exports_count: 1,
        ai_credits_used: 0, ai_credits_limit: null,
      }),
      avatarUrl: vi.fn(() => undefined),
    },
  };
});
// The heavy account panels are covered by their own tests.
vi.mock('./TwoFactorPanel', () => ({ TwoFactorPanel: () => <div>two-factor-panel</div> }));
vi.mock('./SessionsPanel', () => ({ SessionsPanel: () => <div>sessions-panel</div> }));
vi.mock('./PrivacyPanel', () => ({ PrivacyPanel: () => <div>privacy-panel</div> }));

import { Settings } from './Settings';

afterEach(cleanup);

const renderSettings = () =>
  render(
    <ThemeProvider>
      <ToastProvider>
        <Settings />
      </ToastProvider>
    </ThemeProvider>,
  );

describe('Settings layout', () => {
  it('shows a compact profile banner with real usage instead of the old side card', async () => {
    renderSettings();
    expect(await screen.findByText('duy@example.com')).toBeInTheDocument();
    expect(await screen.findByText(/3 \/ 20 projects/)).toBeInTheDocument();
    expect(screen.getByText(/1 \/ 10 exports/)).toBeInTheDocument();
    expect(screen.queryByText('Cloud Scans')).not.toBeInTheDocument(); // the placeholder figures are gone
    expect(screen.queryByText(/Level 4/)).not.toBeInTheDocument();
  });

  it('offers four horizontal tabs and moves the theme picker to Appearance', async () => {
    renderSettings();
    for (const name of [/profile details/i, /security & auth/i, /privacy & data/i, /appearance/i]) {
      expect(await screen.findByRole('tab', { name })).toBeInTheDocument();
    }
    expect(screen.queryByText('Streetwear Dark')).not.toBeInTheDocument(); // not in the profile form any more

    fireEvent.mouseDown(screen.getByRole('tab', { name: /appearance/i }));
    fireEvent.click(screen.getByRole('tab', { name: /appearance/i }));
    expect(await screen.findByText('Streetwear Dark')).toBeInTheDocument();
    expect(screen.getByText('Premium Cream')).toBeInTheDocument();
  });

  it('renders the security and privacy panels inside their tabs', async () => {
    renderSettings();
    fireEvent.mouseDown(await screen.findByRole('tab', { name: /security & auth/i }));
    fireEvent.click(screen.getByRole('tab', { name: /security & auth/i }));
    await waitFor(() => expect(screen.getByText('two-factor-panel')).toBeInTheDocument());
    expect(screen.getByText('sessions-panel')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('tab', { name: /privacy & data/i }));
    fireEvent.click(screen.getByRole('tab', { name: /privacy & data/i }));
    await waitFor(() => expect(screen.getByText('privacy-panel')).toBeInTheDocument());
  });
});
