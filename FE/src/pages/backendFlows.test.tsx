import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../context/ToastContext';
import { ThemeProvider } from '../context/ThemeContext';

// The API layer is mocked: these tests cover what each screen does with the responses.
vi.mock('../api/client', async () => {
  const actual = await vi.importActual<typeof import('../api/client')>('../api/client');
  return {
    ...actual,
    api: {
      login: vi.fn(),
      verifyTwoFactorLogin: vi.fn(),
      logout: vi.fn(),
      impersonation: vi.fn(() => null),
      onImpersonationChange: vi.fn(() => () => undefined),
    },
  };
});
vi.mock('../api/account', () => ({
  accountApi: {
    twoFactorStatus: vi.fn(),
    setupTwoFactor: vi.fn(),
    enableTwoFactor: vi.fn(),
    disableTwoFactor: vi.fn(),
    setRecoveryEmail: vi.fn(),
    verifyRecoveryEmail: vi.fn(),
    listSessions: vi.fn(),
    loginHistory: vi.fn(),
    revokeSession: vi.fn(),
    revokeAllSessions: vi.fn(),
    getPrivacy: vi.fn(),
    updatePrivacy: vi.fn(),
    listConsents: vi.fn(),
    recordConsent: vi.fn(),
    requestDataExport: vi.fn(),
    deleteAccount: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    requestAccountRestore: vi.fn(),
    confirmAccountRestore: vi.fn(),
  },
}));
vi.mock('../api/studio', () => ({
  studioApi: {
    listVersions: vi.fn(),
    listTemplates: vi.fn(),
    restoreVersion: vi.fn(),
    applyTemplate: vi.fn(),
    listArtisanLinks: vi.fn(),
    createArtisanLink: vi.fn(),
    renewArtisanLink: vi.fn(),
    revokeArtisanLink: vi.fn(),
    downloadReferencePack: vi.fn(),
    eligibility: vi.fn(),
    submitFeedback: vi.fn(),
    myFeedback: vi.fn(),
    listAssets: vi.fn(),
    createAssetUploadUrl: vi.fn(),
    putAssetFile: vi.fn(),
    confirmAssetUpload: vi.fn(),
    deleteAsset: vi.fn(),
  },
}));
vi.mock('../api/adminClient', async () => {
  const actual = await vi.importActual<typeof import('../api/adminClient')>('../api/adminClient');
  return { ...actual, adminAnalytics: { get: vi.fn(), downloadReport: vi.fn() } };
});

import { api, ApiError } from '../api/client';
import { accountApi } from '../api/account';
import { studioApi } from '../api/studio';
import { adminAnalytics } from '../api/adminClient';
import { Login } from './Login/Login';
import { TwoFactorPanel } from './Settings/TwoFactorPanel';
import { PrivacyPanel } from './Settings/PrivacyPanel';
import { Feedback } from './Feedback/Feedback';
import { ArtisanSharePanel } from './ProjectDetails/ArtisanSharePanel';
import { VersionHistoryPanel } from './ProjectDetails/VersionHistoryPanel';
import { ModelPanel } from './ProjectDetails/ModelPanel';
import { AdminAnalytics } from './Admin/Analytics/AdminAnalytics';

const wrap = (ui: React.ReactElement) => render(<ThemeProvider><ToastProvider>{ui}</ToastProvider></ThemeProvider>);
const m = <T extends (...args: never[]) => unknown>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('Login with two-factor authentication', () => {
  const signIn = async () => {
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getAllByPlaceholderText('••••••••')[0], { target: { value: 'Password1' } });
    // The page has a "Sign In" tab and a "Sign In" submit button: press the submit one.
    const submit = screen.getAllByRole('button', { name: /^sign in/i }).find((button) => button.getAttribute('type') === 'submit');
    fireEvent.click(submit as HTMLElement);
  };

  it('asks for the second factor and finishes with the code', async () => {
    m(api.login).mockResolvedValue({ mfaRequired: true, challengeToken: 'chal', method: 'totp' });
    m(api.verifyTwoFactorLogin).mockResolvedValue(undefined);
    wrap(<Login setPage={vi.fn()} />);
    await signIn();

    expect(await screen.findByText(/two-step verification/i)).toBeInTheDocument();
    const code = screen.getByLabelText(/verification code/i);
    fireEvent.change(code, { target: { value: '12ab34' } });
    expect(code).toHaveValue('1234'); // digits only
    fireEvent.change(code, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify & continue/i }));

    await waitFor(() => expect(api.verifyTwoFactorLogin).toHaveBeenCalledWith('chal', { code: '123456' }, true));
  });

  it('accepts a recovery code instead', async () => {
    m(api.login).mockResolvedValue({ mfaRequired: true, challengeToken: 'chal', method: 'email' });
    m(api.verifyTwoFactorLogin).mockResolvedValue(undefined);
    wrap(<Login setPage={vi.fn()} />);
    await signIn();

    fireEvent.click(await screen.findByRole('button', { name: /use a recovery code/i }));
    fireEvent.change(screen.getByLabelText(/recovery code/i), { target: { value: 'abcd-1234' } });
    fireEvent.click(screen.getByRole('button', { name: /verify & continue/i }));
    await waitFor(() =>
      expect(api.verifyTwoFactorLogin).toHaveBeenCalledWith('chal', { recoveryCode: 'abcd-1234' }, true),
    );
  });

  it('returns to the password step when the challenge expired', async () => {
    m(api.login).mockResolvedValue({ mfaRequired: true, challengeToken: 'chal', method: 'totp' });
    m(api.verifyTwoFactorLogin).mockRejectedValue(new ApiError('expired', 401, 'AUTH_2FA_CHALLENGE_INVALID'));
    wrap(<Login setPage={vi.fn()} />);
    await signIn();
    fireEvent.change(await screen.findByLabelText(/verification code/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /verify & continue/i }));
    expect(await screen.findByText(/verification session expired/i)).toBeInTheDocument();
  });

  it('opens the password reset flow instead of pretending an email was sent', async () => {
    m(accountApi.forgotPassword).mockResolvedValue({ message: 'If the email is valid a code was sent.' });
    wrap(<Login setPage={vi.fn()} />);
    fireEvent.click(screen.getByText(/forgot password/i));
    expect(await screen.findByText(/reset your password/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: 'a@b.co' } });
    fireEvent.click(screen.getByRole('button', { name: /send code/i }));
    await waitFor(() => expect(accountApi.forgotPassword).toHaveBeenCalledWith('a@b.co'));
    expect(await screen.findByLabelText('New password')).toBeInTheDocument();
  });
});

describe('TwoFactorPanel', () => {
  it('walks through setup and shows the recovery codes once', async () => {
    m(accountApi.twoFactorStatus).mockResolvedValue({ enabled: false, method: null, recovery_email: null, recovery_email_verified: false });
    m(accountApi.setupTwoFactor).mockResolvedValue({ method: 'totp', totp_secret: 'JBSWY3DP', provisioning_uri: 'otpauth://x' });
    m(accountApi.enableTwoFactor).mockResolvedValue({ message: 'ok', recovery_codes: ['aaaa-1111', 'bbbb-2222'] });
    wrap(<TwoFactorPanel />);

    fireEvent.click(await screen.findByRole('button', { name: /set up 2fa/i }));
    fireEvent.click(screen.getByText(/authenticator app/i));
    expect(await screen.findByText('JBSWY3DP')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/6-digit code/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /turn on 2fa/i }));
    await waitFor(() => expect(accountApi.enableTwoFactor).toHaveBeenCalledWith('totp', '123456'));
    expect(await screen.findByText('aaaa-1111')).toBeInTheDocument();
    expect(screen.getByText(/will not be shown again/i)).toBeInTheDocument();
  });

  it('will not offer email codes until a recovery email is verified', async () => {
    m(accountApi.twoFactorStatus).mockResolvedValue({ enabled: false, method: null, recovery_email: null, recovery_email_verified: false });
    wrap(<TwoFactorPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /set up 2fa/i }));
    fireEvent.click(screen.getByText(/email code/i));
    expect(accountApi.setupTwoFactor).not.toHaveBeenCalled();
  });
});

describe('PrivacyPanel', () => {
  it('saves a toggle and rolls back when the server refuses', async () => {
    const settings = {
      is_profile_public: false,
      show_designs_publicly: false,
      is_searchable: false,
      allow_analytics: false,
      allow_ads_personalization: false,
    };
    m(accountApi.getPrivacy).mockResolvedValue(settings);
    m(accountApi.listConsents).mockResolvedValue([]);
    m(accountApi.updatePrivacy).mockRejectedValue(new Error('nope'));
    wrap(<PrivacyPanel />);

    const toggle = await screen.findByRole('switch', { name: /public profile/i });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);
    await waitFor(() => expect(accountApi.updatePrivacy).toHaveBeenCalledWith({ is_profile_public: true }));
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
  });

  it('records a consent change', async () => {
    m(accountApi.getPrivacy).mockResolvedValue({
      is_profile_public: false, show_designs_publicly: false, is_searchable: false, allow_analytics: false, allow_ads_personalization: false,
    });
    m(accountApi.listConsents).mockResolvedValue([]);
    m(accountApi.recordConsent).mockResolvedValue({});
    wrap(<PrivacyPanel />);
    const toggle = await screen.findByRole('switch', { name: /marketing content/i });
    await waitFor(() => expect(toggle).not.toBeDisabled());
    fireEvent.click(toggle);
    await waitFor(() => expect(accountApi.recordConsent).toHaveBeenCalledWith('marketing_content', true));
  });
});

describe('Feedback page', () => {
  it('submits a rated message and shows the team reply', async () => {
    m(studioApi.myFeedback).mockResolvedValue([
      { id: '1', rating: 5, marketing_group: 'product', message: 'Great', status: 'done', changed_what: 'Added dark mode', created_at: '2026-09-01T00:00:00Z' },
    ]);
    m(studioApi.eligibility).mockResolvedValue({ can_submit: true, next_allowed_at: null });
    m(studioApi.submitFeedback).mockResolvedValue({});
    wrap(<Feedback />);

    expect(await screen.findByText(/added dark mode/i)).toBeInTheDocument();
    const send = screen.getByRole('button', { name: /send feedback/i });
    expect(send).toBeDisabled(); // needs a rating and a message
    fireEvent.click(screen.getByRole('radio', { name: /4 stars/i }));
    fireEvent.change(screen.getByLabelText(/your message/i), { target: { value: 'Please add X' } });
    fireEvent.click(send);
    await waitFor(() =>
      expect(studioApi.submitFeedback).toHaveBeenCalledWith({ rating: 4, message: 'Please add X', marketing_group: 'product' }),
    );
  });

  it('explains the cooldown and blocks submission', async () => {
    m(studioApi.myFeedback).mockResolvedValue([]);
    m(studioApi.eligibility).mockResolvedValue({ can_submit: false, next_allowed_at: '2026-10-01T00:00:00Z' });
    wrap(<Feedback />);
    expect(await screen.findByText(/sent feedback recently/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /5 stars/i }));
    fireEvent.change(screen.getByLabelText(/your message/i), { target: { value: 'hello there' } });
    expect(screen.getByRole('button', { name: /send feedback/i })).toBeDisabled();
  });
});

describe('Artisan sharing and version history', () => {
  it('shows the plan requirement returned by the API', async () => {
    m(studioApi.listArtisanLinks).mockResolvedValue([]);
    m(studioApi.createArtisanLink).mockRejectedValue(new ApiError('paid only', 403, 'ARTISAN_LINK_PLAN_REQUIRED'));
    wrap(<ArtisanSharePanel projectId="p1" onUpgrade={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /new link/i }));
    expect(await screen.findByText(/needs an active paid plan/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /see plans/i })).toBeInTheDocument();
  });

  it('reveals a new link exactly once', async () => {
    m(studioApi.listArtisanLinks).mockResolvedValue([]);
    m(studioApi.createArtisanLink).mockResolvedValue({
      id: 'l1', project_id: 'p1', export_record_id: 'e1', expires_at: '2026-10-01T00:00:00Z',
      max_downloads: 20, download_count: 0, revoked_at: null, is_active: true, token: 'tok', url: 'https://x/artisan/tok',
    });
    wrap(<ArtisanSharePanel projectId="p1" />);
    fireEvent.click(await screen.findByRole('button', { name: /new link/i }));
    expect(await screen.findByText('https://x/artisan/tok')).toBeInTheDocument();
  });

  it('disables restore and templates on a read-only project', async () => {
    m(studioApi.listVersions).mockResolvedValue([
      { id: 'v2', version_no: 2, is_pinned: false, export_bake_job_id: null, thumbnail_path: null, created_at: '2026-09-02T00:00:00Z' },
      { id: 'v1', version_no: 1, is_pinned: true, export_bake_job_id: 'j', thumbnail_path: null, created_at: '2026-09-01T00:00:00Z' },
    ]);
    m(studioApi.listTemplates).mockResolvedValue([
      { id: 't1', name: 'Tet', description: null, category: 'seasonal', thumbnail_path: null, layer_count: 2, use_count: 0 },
    ]);
    wrap(<VersionHistoryPanel projectId="p1" locked />);
    expect(await screen.findByText(/read-only after a plan downgrade/i)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /restore/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /use template/i })).toBeDisabled();
    expect(screen.getByText(/exported/i)).toBeInTheDocument();
  });
});

describe('ModelPanel (import the source 3D model, C3)', () => {
  const uploadResponse = {
    upload_url: 'https://storage.example/put',
    asset_id: 'a1',
    file_path: 'source_models/p1/a1.glb',
    expires_in: 900,
  };
  const readyAsset = {
    id: 'a1',
    project_id: 'p1',
    asset_type: 'source_model',
    original_filename: 'model.glb',
    file_path: 'source_models/p1/a1.glb',
    file_size_bytes: 9,
    mime_type: 'model/gltf-binary',
    status: 'ready',
    created_at: '2026-09-01T00:00:00Z',
  };

  const chooseFile = async (file: File) => {
    const input = await screen.findByLabelText('Import 3D model file');
    fireEvent.change(input, { target: { files: [file] } });
  };

  it('imports a model by calling upload-url, then PUT, then confirm, in order', async () => {
    m(studioApi.listAssets).mockResolvedValue([]);
    m(studioApi.createAssetUploadUrl).mockResolvedValue(uploadResponse);
    m(studioApi.putAssetFile).mockResolvedValue(undefined);
    m(studioApi.confirmAssetUpload).mockResolvedValue(readyAsset);
    const onModelChange = vi.fn();
    wrap(<ModelPanel projectId="p1" canonicalModelAssetId={null} onModelChange={onModelChange} />);

    const file = new File(['glb-bytes'], 'model.glb', { type: 'model/gltf-binary' });
    await chooseFile(file);

    await waitFor(() =>
      expect(studioApi.confirmAssetUpload).toHaveBeenCalledWith('p1', { asset_id: 'a1', file_size_bytes: file.size }),
    );
    expect(studioApi.createAssetUploadUrl).toHaveBeenCalledWith('p1', {
      asset_type: 'source_model',
      filename: 'model.glb',
      content_type: 'model/gltf-binary',
    });
    expect(studioApi.putAssetFile).toHaveBeenCalledWith(uploadResponse.upload_url, file, 'model/gltf-binary');

    const createOrder = m(studioApi.createAssetUploadUrl).mock.invocationCallOrder[0];
    const putOrder = m(studioApi.putAssetFile).mock.invocationCallOrder[0];
    const confirmOrder = m(studioApi.confirmAssetUpload).mock.invocationCallOrder[0];
    expect(createOrder).toBeLessThan(putOrder);
    expect(putOrder).toBeLessThan(confirmOrder);
    await waitFor(() => expect(onModelChange).toHaveBeenCalled());
  });

  it('does not confirm the upload when the PUT to storage fails', async () => {
    m(studioApi.listAssets).mockResolvedValue([]);
    m(studioApi.createAssetUploadUrl).mockResolvedValue(uploadResponse);
    m(studioApi.putAssetFile).mockRejectedValue(new Error('Unable to upload the file to storage (status 403).'));
    const onModelChange = vi.fn();
    wrap(<ModelPanel projectId="p1" canonicalModelAssetId={null} onModelChange={onModelChange} />);

    await chooseFile(new File(['glb-bytes'], 'model.glb', { type: 'model/gltf-binary' }));

    expect(await screen.findByText(/unable to upload the file to storage/i)).toBeInTheDocument();
    expect(studioApi.confirmAssetUpload).not.toHaveBeenCalled();
    expect(onModelChange).not.toHaveBeenCalled();
  });

  it('rejects a non-model file before calling the upload API', async () => {
    m(studioApi.listAssets).mockResolvedValue([]);
    wrap(<ModelPanel projectId="p1" canonicalModelAssetId={null} onModelChange={vi.fn()} />);

    await chooseFile(new File(['hello'], 'notes.txt', { type: 'text/plain' }));

    expect(await screen.findByText(/only \.glb and \.gltf files/i)).toBeInTheDocument();
    expect(studioApi.createAssetUploadUrl).not.toHaveBeenCalled();
  });

  it('lists assets and marks the canonical model', async () => {
    m(studioApi.listAssets).mockResolvedValue([readyAsset]);
    wrap(<ModelPanel projectId="p1" canonicalModelAssetId="a1" onModelChange={vi.fn()} />);

    expect(await screen.findByText('model.glb')).toBeInTheDocument();
    expect(screen.getByText('Canonical model')).toBeInTheDocument();
  });

  it('deletes an asset after confirmation and surfaces a refused deletion', async () => {
    m(studioApi.listAssets).mockResolvedValue([readyAsset]);
    m(studioApi.deleteAsset).mockRejectedValue(new ApiError('Asset không tồn tại', 404, 'ASSET_NOT_FOUND'));
    const onModelChange = vi.fn();
    wrap(<ModelPanel projectId="p1" canonicalModelAssetId="a1" onModelChange={onModelChange} />);

    fireEvent.click(await screen.findByRole('button', { name: /delete/i }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /delete/i }));

    await waitFor(() => expect(studioApi.deleteAsset).toHaveBeenCalledWith('p1', 'a1'));
    expect(await screen.findByText(/asset không tồn tại/i)).toBeInTheDocument();
    expect(onModelChange).not.toHaveBeenCalled();
  });
});

describe('Admin analytics', () => {
  it('renders the KPIs from the API', async () => {
    m(adminAnalytics.get).mockResolvedValue({
      date_from: '2026-08-23', date_to: '2026-09-21', mrr_vnd: 500000, arr_vnd: 6000000, arpu_vnd: 250000, paying_customers: 2,
      revenue_vnd: { current: 800000, previous: 400000 }, refunds_vnd: { current: 0, previous: 0 },
      new_paying_customers: { current: 2, previous: 1 }, churn: { due: 4, churned: 1, rate: 0.25 },
      retention: { month: '2026-09', nrr: 1.1, grr: 0.9 }, free_to_paid: { numerator: 2, denominator: 10, rate: 0.2 },
      repeat: { paying_customers: 2, repeat_customers: 1, not_yet_due: 0, rate: 0.5, raw_rate: 0.5 },
      failed_payments: { count_30d: 1, amount_30d_vnd: 99000 },
      revenue_by_plan: [{ plan_tier: 'basic', revenue_vnd: 800000, share: 1 }],
      revenue_series: [{ month: '2026-09', revenue_vnd: 800000 }],
      mrr_movement: { month: '2026-09', new: 1, expansion: 0, reactivation: 0, contraction: 0, churn: 0, net_new: 1 },
      top_customers: [{ user_id: 'u1', email: 'top@example.com', net_paid_vnd: 800000, orders: 2 }],
    });
    wrap(<AdminAnalytics />);
    expect(await screen.findByText('25.0%')).toBeInTheDocument(); // churn
    expect(screen.getByText('top@example.com')).toBeInTheDocument();
    expect(screen.getAllByText(/▲ 100\.0% so với kỳ trước/).length).toBeGreaterThan(0);
    expect(screen.getByText('Sổ giao dịch EXE201')).toBeInTheDocument();
  });
});
