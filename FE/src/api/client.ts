import type {
  Design,
  DesignAsset,
  DesignAssetSource,
  DesignConfig,
  ExportPackage,
  ModelAsset,
  ModelImportResponse,
  ReconstructionReadiness,
  ScanMetadata,
  ScanSession,
  User,
} from '../types';
import { toast as notifyToast } from '../context/ToastContext';

if (import.meta.env.PROD && !import.meta.env.VITE_API_BASE_URL) {
  // Falling through to the dev fallback below would silently point at a nonexistent
  // same-origin:8000 backend and every request would fail with an opaque network error.
  console.error(
    "VITE_API_BASE_URL is not set. Set it in the deployment's environment variables " +
      "(e.g. Vercel project settings) to the backend's public URL, then redeploy.",
  );
}
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? `http://${window.location.hostname}:8000`;
const STORAGE_PUBLIC_URL =
  import.meta.env.VITE_STORAGE_PUBLIC_URL ?? `http://${window.location.hostname}:9000/kusshoes`;
const LEGACY_ACCESS_TOKEN_KEY = 'kusshoes_access_token';
const LEGACY_REFRESH_TOKEN_KEY = 'kusshoes_refresh_token';
let accessTokenInMemory: string | null = null;

export type ImpersonationSession = { banner: string; expiresAt: string };
let impersonationSession: ImpersonationSession | null = null;
const IMPERSONATION_EVENT = 'kusshoes:impersonation';

function setImpersonation(next: ImpersonationSession | null): void {
  impersonationSession = next;
  window.dispatchEvent(new Event(IMPERSONATION_EVENT));
}

function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;) ?kusshoes_csrf_token=([^;]*)(?:;|$)/);
  return match ? match[1] : null;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly data: Record<string, unknown>;

  constructor(
    message: string,
    status: number,
    code: string | null = null,
    data: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

type AuthTokens = {
  access_token: string;
  token_type: string;
};

export type LoginOutcome =
  { mfaRequired: false } | { mfaRequired: true; challengeToken: string; method: 'totp' | 'email' };

export type RegisterInput = {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
  fullName: string;
  ageConfirmed: boolean;
};

export type RegisterResult = {
  userId: string;
  email: string;
  message: string;
};

export type UserProfile = {
  id: string;
  account_code: string;
  email: string;
  first_name: string;
  last_name: string;
  username: string;
  avatar_path: string | null;
  phone_number: string | null;
  bio: string | null;
  language: string;
  preferred_styles: string[];
  status: string;
  member_since: string;
  total_designs: number;
};

export type Usage = {
  tier: string;
  max_projects: number | null;
  max_exports_per_month: number | null;
  projects_count: number;
  exports_count: number;
  ai_credits_used: number;
  ai_credits_limit: number | null;
};

export type PortalProject = {
  id: string;
  name: string;
  baseModel: string;
  status: 'Scanned' | 'Designing' | 'Completed';
  rawStatus: string;
  isLocked: boolean;
  visibility: 'Private' | 'Link' | 'Public';
  updatedAt: string;
  createdAt: string;
  imageUrl: string;
  editorUrl: string;
  device: string;
  fileSize: string;
  photosCount: number;
  verticesCount: string;
  colorCode: string;
  description: string;
};

type ProjectResponse = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  is_locked?: boolean;
  thumbnail_path: string | null;
  design_config: Record<string, unknown> | null;
  editor_url: string;
  created_at: string;
  updated_at: string;
};

export type ProjectPage = {
  items: PortalProject[];
  nextCursor: string | null;
  hasNext: boolean;
};

/** BR-47: a soft-deleted project, restorable for PROJECT_RESTORE_DAYS (30) before it's purged. */
export type TrashedProject = PortalProject & {
  deletedAt: string;
  purgeAt: string;
};

export type TrashedProjectPage = {
  items: TrashedProject[];
  nextCursor: string | null;
  hasNext: boolean;
};

export type EditorLaunch = {
  desktopUrl: string;
  expiresIn: number;
};

export type Plan = {
  id: string;
  tier: string;
  billing_cycle: string | null;
  price_vnd: number;
  max_projects: number | null;
  max_exports_per_month: number | null;
  allowed_export_formats: string[];
  bake_priority: string;
  max_ai_credits_per_cycle: number | null;
  max_scans_per_cycle: number | null;
  max_layers_per_zone: number;
  max_layers_per_project: number;
  allow_draw_artwork: boolean;
};

export type Subscription = {
  id: string;
  tier: string;
  status: string;
  started_at: string;
  expires_at: string | null;
  cancel_at_period_end: boolean;
};

export type Invoice = {
  id: string;
  order_code: number;
  plan_tier: string;
  billing_cycle: string;
  listed_price_vnd: number;
  discount_vnd: number;
  amount_vnd: number;
  payment_method: 'payos' | 'momo' | 'manual';
  status: string;
  receipt_number?: string | null;
  paid_at: string | null;
  created_at: string;
  vat: { enabled: boolean; rate_percent: number; vat_vnd: number; net_vnd: number };
};

export type WatermarkPolicy = {
  required: boolean;
  text: string;
  max_edge_px: number;
  opacity_percent: number;
};

export type ProjectExport = {
  id: string;
  format: string;
  file_size_bytes: number | null;
  download_count: number;
  created_at: string;
};

const FALLBACK_PROJECT_IMAGE = new URL('../assets/sneaker-hero.png', import.meta.url).href;
const COMPLETED_PROJECT_STATUSES = new Set(['completed', 'ready', 'exported']);
const DESIGNING_PROJECT_STATUSES = new Set(['in_progress', 'processing', 'queued', 'baking']);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function formatProjectSize(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '—';
  return `${value.toFixed(value >= 100 ? 0 : 1)} MB`;
}

function storageUrl(path: string | null): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path) || path.startsWith('data:')) return path;
  return `${STORAGE_PUBLIC_URL.replace(/\/$/, '')}/${path.replace(/^\/+/, '')}`;
}

function projectImageUrl(path: string | null): string {
  return storageUrl(path) ?? FALLBACK_PROJECT_IMAGE;
}

function normalizeProjectStatus(status: string): PortalProject['status'] {
  const normalizedStatus = status.toLowerCase();
  if (COMPLETED_PROJECT_STATUSES.has(normalizedStatus)) return 'Completed';
  if (DESIGNING_PROJECT_STATUSES.has(normalizedStatus)) return 'Designing';
  return 'Scanned';
}

function normalizeProjectVisibility(value: unknown): PortalProject['visibility'] {
  if (value === 'Private' || value === 'Link' || value === 'Public') return value;
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (normalized === 'private') return 'Private';
    if (normalized === 'link') return 'Link';
    if (normalized === 'public') return 'Public';
  }
  return 'Private';
}

function toPortalProject(project: ProjectResponse): PortalProject {
  const config = asRecord(project.design_config);
  const scan = asRecord(config.scan);
  const palette = asRecord(config.palette);

  return {
    id: project.id,
    name: project.name,
    baseModel: stringValue(config.base_model, 'Custom sneaker model'),
    status: normalizeProjectStatus(project.status),
    rawStatus: project.status,
    isLocked: Boolean(project.is_locked),
    visibility: normalizeProjectVisibility(config.visibility),
    updatedAt: project.updated_at,
    createdAt: project.created_at,
    imageUrl: projectImageUrl(project.thumbnail_path),
    editorUrl: project.editor_url,
    device: stringValue(scan.device, 'KusStudio'),
    fileSize: formatProjectSize(scan.file_size_mb),
    photosCount: numberValue(scan.photos_count, 0),
    verticesCount: stringValue(scan.vertices, '—'),
    colorCode: stringValue(palette.primary, '#FF5A36'),
    description: project.description ?? '',
  };
}

function clearLegacyStoredTokens(): void {
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
    storage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
  }
}

clearLegacyStoredTokens();

function saveTokens(tokens: AuthTokens, _remember: boolean): void {
  accessTokenInMemory = tokens.access_token;
  clearLegacyStoredTokens();
}

function clearTokens(): void {
  accessTokenInMemory = null;
  clearLegacyStoredTokens();
}

function replaceAccessToken(accessToken: string): void {
  accessTokenInMemory = accessToken;
  clearLegacyStoredTokens();
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        clearTokens();
        return null;
      }
      const payload = (await response.json()) as { access_token: string };
      replaceAccessToken(payload.access_token);
      return payload.access_token;
    } catch {
      return null;
    }
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

function canRefreshRequest(path: string): boolean {
  return ![
    '/api/v1/auth/login',
    '/api/v1/auth/2fa/verify',
    '/api/v1/auth/register',
    '/api/v1/auth/verify-otp',
    '/api/v1/auth/refresh',
    '/api/v1/auth/forgot-password',
    '/api/v1/auth/reset-password',
    '/api/v1/auth/restore-account/request',
    '/api/v1/auth/restore-account/confirm',
  ].includes(path);
}

function notifyApiError(error: ApiError, path: string): void {
  if (responseIsAuthNoise(path)) return;
  if (error.status >= 500) {
    notifyToast.error('Server error. Please try again later.');
    return;
  }
  if (error.status === 401) {
    notifyToast.error('Session expired. Please sign in again.');
    return;
  }
  if (error.status >= 400) {
    notifyToast.error(error.message || 'Request failed. Please check your input.');
  }
}

function responseIsAuthNoise(path: string): boolean {
  return [
    '/api/v1/auth/login',
    '/api/v1/auth/2fa/verify',
    '/api/v1/auth/register',
    '/api/v1/auth/verify-otp',
    '/api/v1/auth/resend-otp',
    '/api/v1/auth/restore-account/request',
    '/api/v1/auth/restore-account/confirm',
    '/api/v1/auth/forgot-password',
    '/api/v1/auth/reset-password',
  ].includes(path);
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const accessToken = accessTokenInMemory;
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  if (options.method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method.toUpperCase())) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  let response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  if (response.status === 401 && canRefreshRequest(path) && !impersonationSession) {
    const refreshedAccessToken = await refreshAccessToken();
    if (refreshedAccessToken) {
      headers.Authorization = `Bearer ${refreshedAccessToken}`;
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        credentials: 'include',
        headers: {
          ...headers,
          ...options.headers,
        },
      });
    }
  }

  if (!response.ok) {
    const error = await apiError(response);
    notifyApiError(error, path);
    throw error;
  }

  return response.json() as Promise<T>;
}

/** GET a binary file (e.g. a PDF) with the current session, refreshing the token once on 401. */
export async function requestBlob(path: string): Promise<{ blob: Blob; filename: string | null }> {
  const send = (token: string | null) =>
    fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  let response = await send(accessTokenInMemory);
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) response = await send(refreshed);
  }
  if (!response.ok) await throwApiResponseError(response, path);
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^";]+)"?/.exec(disposition);
  return { blob: await response.blob(), filename: match ? match[1] : null };
}

async function apiError(response: Response): Promise<ApiError> {
  try {
    const payload = (await response.json()) as Record<string, unknown>;
    const detail = payload.detail;
    let message = typeof payload.message === 'string' ? payload.message : response.statusText;
    if (typeof detail === 'string') {
      message = detail;
    } else if (Array.isArray(detail)) {
      message = detail
        .map((item) => {
          if (typeof item !== 'object' || item === null) return String(item);
          const validationError = item as { msg?: string };
          return validationError.msg ?? JSON.stringify(item);
        })
        .join('; ');
    }
    return new ApiError(
      message || `Request failed (${response.status})`,
      response.status,
      typeof payload.code === 'string' ? payload.code : null,
      payload,
    );
  } catch {
    return new ApiError(response.statusText || 'Unable to connect to the server', response.status);
  }
}

async function throwApiResponseError(response: Response, path: string): Promise<never> {
  const error = await apiError(response);
  notifyApiError(error, path);
  throw error;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  baseUrl: API_BASE_URL,

  hasToken(): boolean {
    return Boolean(accessTokenInMemory);
  },

  /** Admin acting as a customer (BR-80): 30-minute token, kept in memory, no refresh. */
  startImpersonation(accessToken: string, session: ImpersonationSession): void {
    accessTokenInMemory = accessToken;
    setImpersonation(session);
  },

  impersonation(): ImpersonationSession | null {
    return impersonationSession;
  },

  onImpersonationChange(listener: () => void): () => void {
    window.addEventListener(IMPERSONATION_EVENT, listener);
    return () => window.removeEventListener(IMPERSONATION_EVENT, listener);
  },

  /** Tell the server the session is over (it emails the customer), then drop the token. */
  async endImpersonation(): Promise<void> {
    try {
      await request('/api/v1/users/me/impersonation/end', { method: 'POST' });
    } catch {
      // The token may already have expired; the local session must end either way.
    } finally {
      accessTokenInMemory = null;
      setImpersonation(null);
    }
  },

  async logout(): Promise<void> {
    try {
      await request('/api/v1/auth/logout', { method: 'POST' });
    } catch {
      // Local logout must still succeed when the API/token is unavailable.
    } finally {
      clearTokens();
    }
  },

  async register(input: RegisterInput): Promise<RegisterResult> {
    const payload = await request<{ user_id: string; email: string; message: string }>(
      '/api/v1/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          email: input.email,
          username: input.username,
          password: input.password,
          confirm_password: input.confirmPassword,
          full_name: input.fullName,
          age_confirmed: input.ageConfirmed,
        }),
      },
    );
    return { userId: payload.user_id, email: payload.email, message: payload.message };
  },

  /** Full-page navigation: BE redirects through Google and back to /auth/google/callback. */
  startGoogleLogin(): void {
    window.location.href = `${API_BASE_URL}/api/v1/auth/google`;
  },

  /** Called by the /auth/google/callback page with the token BE put in the URL fragment. */
  completeGoogleLogin(accessToken: string, tokenType: string): void {
    saveTokens({ access_token: accessToken, token_type: tokenType }, true);
  },

  async login(email: string, password: string, remember = true): Promise<LoginOutcome> {
    const result = await request<{
      access_token: string | null;
      token_type: string;
      mfa_required: boolean;
      challenge_token: string | null;
      method: string | null;
    }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (result.mfa_required && result.challenge_token) {
      return {
        mfaRequired: true,
        challengeToken: result.challenge_token,
        method: result.method === 'email' ? 'email' : 'totp',
      };
    }
    if (!result.access_token) throw new ApiError('Sign-in did not return a session.', 500);
    saveTokens({ access_token: result.access_token, token_type: result.token_type }, remember);
    return { mfaRequired: false };
  },

  /** Second step of a 2FA login: an authenticator/email code, or a one-time recovery code. */
  async verifyTwoFactorLogin(
    challengeToken: string,
    credential: { code: string } | { recoveryCode: string },
    remember = true,
  ): Promise<void> {
    const tokens = await request<AuthTokens>('/api/v1/auth/2fa/verify', {
      method: 'POST',
      body: JSON.stringify({
        challenge_token: challengeToken,
        ...('code' in credential
          ? { code: credential.code }
          : { recovery_code: credential.recoveryCode }),
      }),
    });
    saveTokens(tokens, remember);
  },

  async verifyOtp(userId: string, otpCode: string, remember = true): Promise<void> {
    const tokens = await request<AuthTokens>('/api/v1/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, otp_code: otpCode }),
    });
    saveTokens(tokens, remember);
  },

  async resendOtp(userId: string): Promise<{ message: string; resendRemaining: number }> {
    const payload = await request<{ message: string; resend_remaining: number }>(
      '/api/v1/auth/resend-otp',
      {
        method: 'POST',
        body: JSON.stringify({ user_id: userId }),
      },
    );
    return { message: payload.message, resendRemaining: payload.resend_remaining };
  },

  async listProjects(cursor?: string | null): Promise<ProjectPage> {
    const params = new URLSearchParams({ limit: '100' });
    if (cursor) params.set('cursor', cursor);
    const page = await request<{
      items: ProjectResponse[];
      next_cursor: string | null;
      has_next: boolean;
    }>(`/api/v1/projects?${params.toString()}`);
    return {
      items: page.items.map(toPortalProject),
      nextCursor: page.next_cursor,
      hasNext: page.has_next,
    };
  },

  async getProject(projectId: string): Promise<PortalProject> {
    const project = await request<ProjectResponse>(`/api/v1/projects/${projectId}`);
    return toPortalProject(project);
  },

  async createEditorLaunch(projectId: string): Promise<EditorLaunch> {
    const launch = await request<{
      launch_ticket: string;
      desktop_url: string;
      expires_in: number;
    }>('/api/v1/auth/editor/launch', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId }),
    });
    return {
      desktopUrl: launch.desktop_url,
      expiresIn: launch.expires_in,
    };
  },

  async createProject(payload: {
    name: string;
    description?: string | null;
  }): Promise<PortalProject> {
    const project = await request<ProjectResponse>('/api/v1/projects', {
      method: 'POST',
      body: JSON.stringify({ name: payload.name, description: payload.description ?? null }),
    });
    return toPortalProject(project);
  },

  async updateProject(
    projectId: string,
    payload: { name?: string; description?: string | null },
  ): Promise<PortalProject> {
    const project = await request<ProjectResponse>(`/api/v1/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    return toPortalProject(project);
  },

  async deleteProject(projectId: string): Promise<void> {
    await request<{ message: string }>(`/api/v1/projects/${projectId}`, { method: 'DELETE' });
  },

  /** BR-47: projects moved to trash by deleteProject(), listed here until they're purged. */
  async listTrash(cursor?: string | null): Promise<TrashedProjectPage> {
    const params = new URLSearchParams({ limit: '50' });
    if (cursor) params.set('cursor', cursor);
    const page = await request<{
      items: (ProjectResponse & { deleted_at: string; purge_at: string })[];
      next_cursor: string | null;
      has_next: boolean;
    }>(`/api/v1/projects/trash?${params.toString()}`);
    return {
      items: page.items.map((project) => ({
        ...toPortalProject(project),
        deletedAt: project.deleted_at,
        purgeAt: project.purge_at,
      })),
      nextCursor: page.next_cursor,
      hasNext: page.has_next,
    };
  },

  async restoreProject(projectId: string): Promise<PortalProject> {
    const project = await request<ProjectResponse>(`/api/v1/projects/${projectId}/restore`, {
      method: 'POST',
    });
    return toPortalProject(project);
  },

  async permanentlyDeleteProject(projectId: string): Promise<void> {
    await request<{ message: string }>(`/api/v1/projects/${projectId}/permanent`, {
      method: 'DELETE',
    });
  },

  async me(): Promise<User> {
    const profile = await this.profile();
    return {
      id: profile.id,
      role: 'user',
      name: `${profile.first_name} ${profile.last_name}`.trim(),
      email: profile.email,
      createdAt: profile.member_since,
    };
  },

  async profile(): Promise<UserProfile> {
    return request<UserProfile>('/api/v1/users/me');
  },

  async updateProfile(payload: {
    first_name?: string;
    last_name?: string;
    username?: string;
    avatar_path?: string | null;
    phone_number?: string | null;
    bio?: string | null;
    language?: 'vi' | 'en';
    preferred_styles?: string[];
  }): Promise<UserProfile> {
    return request<UserProfile>('/api/v1/users/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  avatarUrl(path: string | null): string | undefined {
    return storageUrl(path);
  },

  async uploadAvatar(file: File): Promise<UserProfile> {
    const upload = await request<{ upload_url: string; file_path: string }>(
      '/api/v1/users/me/avatar',
      {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, content_type: file.type }),
      },
    );
    const response = await fetch(upload.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!response.ok) throw new ApiError('Unable to upload avatar.', response.status);
    return this.updateProfile({ avatar_path: upload.file_path });
  },

  async changePassword(payload: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<string> {
    const result = await request<{ message: string }>('/api/v1/users/me/password', {
      method: 'PUT',
      body: JSON.stringify({
        current_password: payload.currentPassword,
        new_password: payload.newPassword,
        confirm_password: payload.confirmPassword,
      }),
    });
    return result.message;
  },

  async usage(): Promise<Usage> {
    return request<Usage>('/api/v1/users/me/usage');
  },

  async listPlans(): Promise<Plan[]> {
    return request<Plan[]>('/api/v1/plans');
  },

  async subscription(): Promise<Subscription> {
    return request<Subscription>('/api/v1/subscription');
  },

  async listInvoices(): Promise<Invoice[]> {
    return request<Invoice[]>('/api/v1/subscription/invoices?limit=100');
  },

  async createCheckout(
    tier: string,
    billingCycle: string,
    gateway: 'payos' | 'momo',
    couponCode?: string | null,
  ): Promise<string> {
    const result = await request<{ checkout_url: string }>('/api/v1/subscription/checkout', {
      method: 'POST',
      body: JSON.stringify({
        tier,
        billing_cycle: billingCycle,
        gateway,
        coupon_code: couponCode?.trim() || null,
      }),
    });
    return result.checkout_url;
  },

  async cancelSubscription(immediate = false): Promise<void> {
    await request<{ status: string }>('/api/v1/subscription/cancel', {
      method: 'POST',
      body: JSON.stringify({ immediate }),
    });
  },

  /** BR-65/67: whether renders of this project carry a watermark (Free tier). */
  async getWatermarkPolicy(projectId: string): Promise<WatermarkPolicy> {
    return request<WatermarkPolicy>(`/api/v1/projects/${projectId}/watermark-policy`);
  },

  async listProjectExports(projectId: string): Promise<ProjectExport[]> {
    const result = await request<{ items: ProjectExport[] }>(
      `/api/v1/projects/${projectId}/exports`,
    );
    return result.items;
  },

  async createExportDownloadUrl(exportId: string): Promise<string> {
    const result = await request<{ download_url: string }>(
      `/api/v1/exports/${exportId}/download-url`,
      {
        method: 'POST',
      },
    );
    return result.download_url;
  },

  async getReconstructionReadiness(): Promise<ReconstructionReadiness> {
    return request<ReconstructionReadiness>('/api/system/reconstruction-readiness');
  },

  async getScanSession(scanSessionId: string): Promise<ScanSession> {
    return request<ScanSession>(`/api/scan-sessions/${scanSessionId}`);
  },

  async getModelAsset(modelAssetId: string): Promise<ModelAsset> {
    return request<ModelAsset>(`/api/models/${modelAssetId}`);
  },

  async importModel(payload: ModelImportPayload): Promise<ModelImportResponse> {
    const form = new FormData();
    form.append('name', payload.name);
    form.append('format', payload.format);
    form.append('metadata', JSON.stringify(payload.metadata));
    if (payload.model) {
      form.append('model', payload.model);
    }
    if (payload.mtl) {
      form.append('mtl', payload.mtl);
    }
    if (payload.texture) {
      form.append('texture', payload.texture);
    }
    if (payload.package) {
      form.append('package', payload.package);
    }

    const response = await fetch(`${API_BASE_URL}/api/models/import`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'X-CSRF-Token': getCsrfToken() || '',
      },
      body: form,
    });
    if (!response.ok) {
      await throwApiResponseError(response, '/api/models/import');
    }
    return response.json() as Promise<ModelImportResponse>;
  },

  async uploadDesignAsset(file: File, sourceType: DesignAssetSource): Promise<DesignAsset> {
    const form = new FormData();
    form.append('file', file);
    form.append('sourceType', sourceType);

    const response = await fetch(`${API_BASE_URL}/api/design-assets`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'X-CSRF-Token': getCsrfToken() || '',
      },
      body: form,
    });
    if (!response.ok) {
      await throwApiResponseError(response, '/api/design-assets');
    }
    return response.json() as Promise<DesignAsset>;
  },

  async fetchDesignAssetBlobUrl(assetId: string): Promise<string> {
    const path = `/api/design-assets/${assetId}/download`;
    const response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
    });
    if (!response.ok) {
      await throwApiResponseError(response, path);
    }
    return URL.createObjectURL(await response.blob());
  },

  async fetchModelBlobUrl(modelAsset: ModelAsset): Promise<string> {
    const response = await fetch(`${API_BASE_URL}${modelAsset.glbUrl}`, {
      credentials: 'include',
    });
    if (!response.ok) {
      await throwApiResponseError(response, modelAsset.glbUrl);
    }
    return URL.createObjectURL(await response.blob());
  },

  async fetchDesignPreviewBlobUrl(design: Design): Promise<string | null> {
    if (!design.previewGlbUrl) {
      return null;
    }
    const response = await fetch(`${API_BASE_URL}${design.previewGlbUrl}`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!response.ok) {
      await throwApiResponseError(response, design.previewGlbUrl);
    }
    return URL.createObjectURL(await response.blob());
  },

  async createDesign(modelAssetId: string, name: string, config: DesignConfig): Promise<Design> {
    return request<Design>('/api/designs', {
      method: 'POST',
      body: JSON.stringify({ modelAssetId, name, config }),
    });
  },

  async getDesign(designId: string): Promise<Design> {
    return request<Design>(`/api/designs/${designId}`);
  },

  async updateDesign(designId: string, name: string, config: DesignConfig): Promise<Design> {
    return request<Design>(`/api/designs/${designId}`, {
      method: 'PUT',
      body: JSON.stringify({ name, config }),
    });
  },

  async exportDesign(designId: string): Promise<ExportPackage> {
    return request<ExportPackage>(`/api/designs/${designId}/export`, {
      method: 'POST',
    });
  },

  async downloadExport(exportPackage: ExportPackage): Promise<void> {
    const response = await fetch(`${API_BASE_URL}${exportPackage.downloadUrl}`, {
      credentials: 'include',
    });
    if (!response.ok) {
      await throwApiResponseError(response, exportPackage.downloadUrl);
    }

    downloadBlob(await response.blob(), `${exportPackage.id}.zip`);
  },

  async downloadModelFile(urlPath: string, filename: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}${urlPath}`, {
      credentials: 'include',
    });
    if (!response.ok) {
      await throwApiResponseError(response, urlPath);
    }

    downloadBlob(await response.blob(), filename);
  },
};

export type ModelImportPayload = {
  name: string;
  format: 'glb' | 'obj';
  metadata: ScanMetadata;
  model?: File | null;
  mtl?: File | null;
  texture?: File | null;
  package?: File | null;
};

export function designStorageKey(modelAssetId: string): string {
  return `shoe-customizer-design-${modelAssetId}`;
}
