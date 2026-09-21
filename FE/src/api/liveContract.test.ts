/// <reference types="node" />
/**
 * Contract check of the FE API layer against a REAL backend.
 *
 * Skipped unless KUS_LIVE_API is set. Needs a database seeded with the users below (see the
 * seed script used in CI/dev) and VITE_API_BASE_URL pointing at the API:
 *   VITE_API_BASE_URL=http://localhost:18000 KUS_LIVE_API=1 npx vitest run src/api/liveContract.test.ts
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { api, requestBlob } from './client';
import { saveAdminSession } from './adminSession';
import { accountApi } from './account';
import { billingApi } from './billing';
import { studioApi } from './studio';
import {
  adminAnalytics,
  adminAuth,
  adminFeedback,
  adminFinance,
  adminStudio,
  adminUserActions,
  adminUsers,
} from './adminClient';

const live = Boolean(process.env.KUS_LIVE_API);
const PASSWORD = 'Password1';

/** Same steps as AdminAuthContext.login: authenticate, then keep the session for later calls. */
async function signInAdmin(): Promise<void> {
  const response = await adminAuth.login('fe.admin@example.com', PASSWORD);
  saveAdminSession({ role: response.role, accessToken: response.access_token, email: 'fe.admin@example.com' });
}

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of input.replace(/=+$/, '')) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** RFC 6238, 30s step, 6 digits: what an authenticator app would show. */
function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}

describe.skipIf(!live)('portal API against the live backend', () => {
  it('signs in, reads the profile and lists projects with the lock flag', async () => {
    const outcome = await api.login('fe.user@example.com', PASSWORD);
    expect(outcome).toEqual({ mfaRequired: false });
    const profile = await api.profile();
    expect(profile.email).toBe('fe.user@example.com');
    const created = await api.createProject({ name: 'Contract shoe' });
    expect(created.isLocked).toBe(false);
  });

  it('runs the whole 2FA lifecycle: setup, enable, challenged login, recovery code, disable', async () => {
    await api.login('fe.user@example.com', PASSWORD);
    expect((await accountApi.twoFactorStatus()).enabled).toBe(false);

    const setup = await accountApi.setupTwoFactor('totp');
    expect(setup.totp_secret).toBeTruthy();
    const enabled = await accountApi.enableTwoFactor('totp', totp(setup.totp_secret as string));
    expect(enabled.recovery_codes).toHaveLength(10);
    expect((await accountApi.twoFactorStatus()).method).toBe('totp');

    // Password alone no longer signs in: the client must surface the challenge.
    const challenge = await api.login('fe.user@example.com', PASSWORD);
    expect(challenge.mfaRequired).toBe(true);
    if (!challenge.mfaRequired) return;
    expect(challenge.method).toBe('totp');

    await api.verifyTwoFactorLogin(challenge.challengeToken, { code: totp(setup.totp_secret as string) });
    expect((await api.profile()).email).toBe('fe.user@example.com');

    // A recovery code works once.
    const second = await api.login('fe.user@example.com', PASSWORD);
    if (!second.mfaRequired) throw new Error('expected a 2FA challenge');
    await api.verifyTwoFactorLogin(second.challengeToken, { recoveryCode: enabled.recovery_codes[0] });
    expect((await api.profile()).email).toBe('fe.user@example.com');

    await accountApi.disableTwoFactor({ password: PASSWORD, code: totp(setup.totp_secret as string) });
    expect((await accountApi.twoFactorStatus()).enabled).toBe(false);
  });

  it('reads sessions, login history, privacy settings and consents', async () => {
    await api.login('fe.user@example.com', PASSWORD);
    expect((await accountApi.listSessions()).length).toBeGreaterThan(0);
    expect((await accountApi.loginHistory()).length).toBeGreaterThan(0);

    const before = await accountApi.getPrivacy();
    expect(before.is_profile_public).toBe(false); // private by default (BR-15)
    const after = await accountApi.updatePrivacy({ is_profile_public: true });
    expect(after.is_profile_public).toBe(true);

    await accountApi.recordConsent('marketing_content', true);
    expect((await accountApi.listConsents()).some((c) => c.type === 'marketing_content' && !c.revoked_at)).toBe(true);
    await accountApi.recordConsent('marketing_content', false);
    expect((await accountApi.listConsents()).some((c) => c.type === 'marketing_content' && !c.revoked_at)).toBe(false);
  });

  it('accepts forgot-password and restore requests without leaking whether the email exists', async () => {
    const forgot = await accountApi.forgotPassword('nobody@example.com');
    expect(forgot.message).toBeTruthy();
    const restore = await accountApi.requestAccountRestore('nobody@example.com');
    expect(restore.message).toBeTruthy();
  });

  it('sends and lists feedback, then blocks a second submission within 14 days', async () => {
    await api.login('fe.user@example.com', PASSWORD);
    expect((await studioApi.eligibility()).can_submit).toBe(true);
    const sent = await studioApi.submitFeedback({ rating: 4, message: 'Contract test feedback', marketing_group: 'product' });
    expect(sent.status).toBe('new');
    expect((await studioApi.myFeedback())[0].message).toBe('Contract test feedback');
    const eligibility = await studioApi.eligibility();
    expect(eligibility.can_submit).toBe(false);
    expect(eligibility.next_allowed_at).toBeTruthy();
  });

  it('shows studio data for a paid account: versions, templates, artisan links, reference pack', async () => {
    await api.login('fe.paid@example.com', PASSWORD);
    const project = (await api.listProjects()).items.find((item) => item.name === 'Seeded Shoe');
    expect(project).toBeDefined();
    const projectId = (project as { id: string }).id;

    const versions = await studioApi.listVersions(projectId);
    expect(versions.length).toBeGreaterThanOrEqual(2);
    const restored = await studioApi.restoreVersion(projectId, versions[versions.length - 1].id);
    expect(restored.version_no).toBeGreaterThan(versions[0].version_no);

    const templates = await studioApi.listTemplates();
    expect(templates.map((t) => t.name)).toContain('Seed Template');
    await studioApi.applyTemplate(projectId, templates[0].id);

    const link = await studioApi.createArtisanLink(projectId);
    expect(link.token).toBeTruthy();
    expect(link.url).toContain(link.token);
    const links = await studioApi.listArtisanLinks(projectId);
    expect(links[0].is_active).toBe(true);
    expect('token' in links[0]).toBe(false); // the raw token is only ever returned once
    await studioApi.renewArtisanLink(link.id);
    await studioApi.revokeArtisanLink(link.id);
    expect((await studioApi.listArtisanLinks(projectId))[0].is_active).toBe(false);

    const pack = await requestBlob(`/api/v1/projects/${projectId}/reference-pack?token=${link.token}`);
    expect(pack.blob.type).toBe('application/pdf');
    expect(pack.filename).toMatch(/\.pdf$/);
    expect(pack.blob.size).toBeGreaterThan(1000);
  });

  it('refuses artisan links on the free plan with a stable error code', async () => {
    await api.login('fe.user@example.com', PASSWORD);
    const project = (await api.listProjects()).items[0];
    await expect(studioApi.createArtisanLink(project.id)).rejects.toMatchObject({ code: 'ARTISAN_LINK_PLAN_REQUIRED' });
  });

  it('previews a coupon and rejects an unknown one', async () => {
    await api.login('fe.user@example.com', PASSWORD);
    await expect(billingApi.previewCoupon('basic', 'monthly', 'NOPE')).rejects.toMatchObject({ status: 422 });
  });
});

describe.skipIf(!live)('admin API against the live backend', () => {
  it('signs in and reads analytics with every field the page renders', async () => {
    await signInAdmin();
    const data = await adminAnalytics.get();
    for (const key of ['mrr_vnd', 'arr_vnd', 'arpu_vnd', 'paying_customers', 'revenue_vnd', 'churn', 'retention', 'free_to_paid', 'repeat', 'failed_payments', 'revenue_by_plan', 'revenue_series', 'mrr_movement', 'top_customers']) {
      expect(data).toHaveProperty(key);
    }
    expect(data.revenue_vnd).toHaveProperty('previous');
  });

  it('manages guardrail rules and templates', async () => {
    await signInAdmin();
    const rule = await adminStudio.createRule('banned', 'Contract Word');
    expect(rule.term).toBe('contract word');
    expect((await adminStudio.setRuleActive(rule.id, false)).is_active).toBe(false);
    await adminStudio.removeRule(rule.id);
    expect((await adminStudio.listRules()).some((item) => item.id === rule.id)).toBe(false);

    const created = await adminStudio.createTemplate({ name: 'Contract Tpl', design_config: { baseColor: '#fff' } });
    expect(created.status).toBe('pending');
    expect((await adminStudio.reviewTemplate(created.id, true)).status).toBe('approved');
    await expect(
      adminStudio.createTemplate({ name: 'Bad', design_config: { texts: [{ id: '1', value: 'fuck' }] } }),
    ).rejects.toMatchObject({ code: 'CONTENT_BANNED' });
  });

  it('triages feedback and reads the summary', async () => {
    await signInAdmin();
    const items = await adminFeedback.list();
    expect(items.length).toBeGreaterThan(0);
    const updated = await adminFeedback.update(items[0].id, { status: 'planned', changed_what: 'Added a thing' });
    expect(updated.status).toBe('planned');
    const summary = await adminFeedback.summary();
    expect(summary.count).toBeGreaterThan(0);
    expect(summary.by_status).toHaveProperty('planned');
  });

  it('creates periods and coupons and asks for a proof-upload URL', async () => {
    await signInAdmin();
    const period = await adminFinance.createPeriod({ name: 'Contract Q', start_date: '2026-01-01', end_date: '2026-01-31' });
    expect(period.status).toBe('open');
    expect((await adminFinance.lockPeriod(period.id)).status).toBe('locked');

    const coupon = await adminFinance.createCoupon({ code: 'CONTRACT10', discount_type: 'percent', value: 10 });
    expect(coupon.used_count).toBe(0);
    expect((await adminFinance.updateCoupon(coupon.id, { is_active: false })).is_active).toBe(false);
    expect((await adminFinance.listCoupons()).some((item) => item.code === 'CONTRACT10')).toBe(true);

    const upload = await adminFinance.proofUpload('proof.png', 'image/png');
    expect(upload.upload_url).toContain('http');
    expect(upload.file_path).toBeTruthy();
  });

  it('impersonates a customer: banner state, restricted actions, and a clean end', async () => {
    await signInAdmin();
    const users = await adminUsers.list({ q: 'fe.paid' });
    const target = users.items.find((user) => user.email === 'fe.paid@example.com');
    expect(target).toBeDefined();

    const grant = await adminUserActions.grantPlan((target as { id: string }).id, { tier: 'pro', billing_cycle: 'monthly', days: 10, reason: 'contract' });
    expect(grant.is_comp).toBe(true);
    expect((await adminUserActions.resetPassword((target as { id: string }).id)).message).toBeTruthy();

    const session = await adminUserActions.impersonate((target as { id: string }).id, 'TICKET-1 contract');
    api.startImpersonation(session.access_token, { banner: session.banner, expiresAt: session.expires_at });
    expect(api.impersonation()?.banner).toContain('fe.paid@example.com');
    expect((await api.profile()).email).toBe('fe.paid@example.com');
    await expect(api.createCheckout('basic', 'monthly', 'payos')).rejects.toMatchObject({ code: 'IMPERSONATION_RESTRICTED' });
    await expect(accountApi.twoFactorStatus()).rejects.toMatchObject({ code: 'IMPERSONATION_RESTRICTED' });

    await api.endImpersonation();
    expect(api.impersonation()).toBeNull();
    expect(api.hasToken()).toBe(false);
  });
});
