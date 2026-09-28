import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../../context/ThemeContext';
import { ToastProvider } from '../../context/ToastContext';
import type { SettingTab } from './settingsNavigation';

vi.mock('../../api/client', async () => {
  const actual = await vi.importActual<typeof import('../../api/client')>('../../api/client');
  return {
    ...actual,
    api: {
      profile: vi.fn().mockResolvedValue({
        first_name: 'Duy', last_name: 'Nguyen', email: 'duy@example.com', bio: 'hi', avatar_path: null,
        username: 'duy_ng', phone_number: null, language: 'en',
      }),
      updateProfile: vi.fn().mockResolvedValue({}),
      avatarUrl: vi.fn(() => undefined),
    },
  };
});
// The heavy account panels are covered by their own tests.
vi.mock('./TwoFactorPanel', () => ({ TwoFactorPanel: () => <div>two-factor-panel</div> }));
vi.mock('./SessionsPanel', () => ({ SessionsPanel: () => <div>sessions-panel</div> }));
vi.mock('./PrivacyPanel', () => ({ PrivacyPanel: () => <div>privacy-panel</div> }));
vi.mock('./ModerationStatusPanel', () => ({ ModerationStatusPanel: () => <div>moderation-status-panel</div> }));

import { api } from '../../api/client';
import { Settings } from './Settings';

afterEach(cleanup);

// Tab switching lives in the Sidebar (via the `?tab=` query param), not inside <Settings/> itself —
// this component just renders whichever section `activeTab` says to, so tests drive it via the prop.
const renderSettings = (activeTab?: SettingTab) =>
  render(
    <ThemeProvider>
      <ToastProvider>
        <Settings activeTab={activeTab} />
      </ToastProvider>
    </ThemeProvider>,
  );

describe('Settings layout', () => {
  it('loads the fetched profile into the profile form', async () => {
    renderSettings('profile');
    expect(await screen.findByDisplayValue('duy@example.com')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Duy Nguyen')).toBeInTheDocument();
    expect(screen.getByText('Profile Details')).toBeInTheDocument();
  });

  it('saves username, phone and language with the profile; username only when changed', async () => {
    renderSettings('profile');
    expect(await screen.findByDisplayValue('duy_ng')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Phone Number'), { target: { value: '0901234567' } });
    fireEvent.click(screen.getByRole('button', { name: /save profile settings/i }));
    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledTimes(1));
    const first = vi.mocked(api.updateProfile).mock.calls[0][0];
    expect(first).toMatchObject({ phone_number: '0901234567', language: 'en' });
    expect(first).not.toHaveProperty('username');

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'duy_new' } });
    fireEvent.click(screen.getByRole('button', { name: /save profile settings/i }));
    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledTimes(2));
    expect(vi.mocked(api.updateProfile).mock.calls[1][0]).toMatchObject({ username: 'duy_new' });
  });

  it('renders the security panels for the security tab', async () => {
    renderSettings('security');
    expect(await screen.findByText('two-factor-panel')).toBeInTheDocument();
    expect(screen.getByText('sessions-panel')).toBeInTheDocument();
    expect(screen.getByText('moderation-status-panel')).toBeInTheDocument();
  });

  it('renders the privacy panel for the privacy tab', async () => {
    renderSettings('privacy');
    expect(await screen.findByText('privacy-panel')).toBeInTheDocument();
  });

  it('renders the theme picker for the appearance tab', async () => {
    renderSettings('appearance');
    expect(await screen.findByText('Streetwear Dark')).toBeInTheDocument();
    expect(screen.getByText('Premium Cream')).toBeInTheDocument();
  });
});
