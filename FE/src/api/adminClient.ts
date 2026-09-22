import type {
  AdminAnalytics,
  AdminCoupon,
  AdminFeedback,
  AdminTemplate,
  FeedbackStatus,
  FeedbackSummary,
  GrantPlanInput,
  GuardrailRule,
  ImpersonationResult,
  ManualTransactionInput,
  ReportFormat,
  ReportType,
  ReportingPeriod,
  AdminAuthResponse,
  DashboardStats,
  MonthlyPoint,
  RecentUser,
  AdminUserSummary,
  AdminUserDetail,
  AdminPlan,
  AdminSubscription,
  AdminInvoice,
  AdminProjectSummary,
  AdminProjectDetail,
  AdminBakeJob,
  AdminBakeJobDetail,
  AdminExport,
  SystemHealth,
  AdminAuditLog,
  CursorPage,
  UserStatus,
  ExportFormat,
  BakePriority,
  StaffCreateResponse,
} from '../types/admin';
import {
  getAdminSession,
  updateAccessToken,
  expireAdminSession,
  sessionFromAccessToken,
  type AdminSession,
} from './adminSession';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? `http://${window.location.hostname}:8000`;

export class AdminApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly data: Record<string, unknown>;

  constructor(code: string, message: string, status = 0, data: Record<string, unknown> = {}) {
    super(message);
    this.name = 'AdminApiError';
    this.code = code;
    this.status = status;
    this.data = data;
  }
}

async function parseApiError(response: Response): Promise<AdminApiError> {
  try {
    const payload = (await response.json()) as Record<string, unknown>;
    const detail = payload.detail;
    let message = typeof payload.message === 'string' ? payload.message : response.statusText;

    if (typeof detail === 'string') {
      message = detail;
    } else if (Array.isArray(detail)) {
      message = detail
        .map(item => {
          if (typeof item !== 'object' || item === null) return String(item);
          const validationError = item as { msg?: string };
          return validationError.msg ?? JSON.stringify(item);
        })
        .join('; ');
    }

    return new AdminApiError(
      typeof payload.code === 'string' ? payload.code : `HTTP_${response.status}`,
      message || `Yêu cầu thất bại (${response.status})`,
      response.status,
      payload,
    );
  } catch {
    return new AdminApiError(
      `HTTP_${response.status}`,
      response.statusText || `Yêu cầu thất bại (${response.status})`,
      response.status,
    );
  }
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
      if (!response.ok) return null;

      const payload = (await response.json()) as { access_token: string };
      updateAccessToken(payload.access_token);
      return payload.access_token;
    } catch {
      return null;
    }
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

async function request<T>(path: string, options: RequestInit = {}, retryOnUnauthorized = true): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const accessToken = getAdminSession()?.accessToken;
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      credentials: 'include',
      headers: { ...headers, ...options.headers },
      signal: options.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new AdminApiError('NETWORK_ERROR', 'Không thể kết nối tới máy chủ. Vui lòng kiểm tra lại BE.');
  }

  if (response.status === 401 && retryOnUnauthorized) {
    const refreshedToken = await refreshAccessToken();
    if (refreshedToken) {
      return request<T>(path, options, false);
    }
    expireAdminSession();
  }

  if (!response.ok) throw await parseApiError(response);
  return response.json() as Promise<T>;
}

function queryString(query: object): string {
  const params = new URLSearchParams();
  (Object.entries(query) as [string, string | number | boolean | undefined | null][]).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.set(key, String(value));
  });
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
}

export const adminAuth = {
  login: (email: string, password: string): Promise<AdminAuthResponse> =>
    request<AdminAuthResponse>('/api/v1/admin/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }, false),
  logout: (): Promise<void> =>
    request<void>('/api/v1/admin/auth/logout', {
      method: 'POST',
    }, false),
  async restoreSession(): Promise<AdminSession | null> {
    const accessToken = await refreshAccessToken();
    return accessToken ? sessionFromAccessToken(accessToken) : null;
  },
};

export const adminDashboard = {
  stats: (): Promise<DashboardStats> => request('/api/v1/admin/dashboard/stats'),
  revenue: (months = 12): Promise<MonthlyPoint[]> =>
    request(`/api/v1/admin/dashboard/revenue${queryString({ months })}`),
  userGrowth: (months = 6): Promise<MonthlyPoint[]> =>
    request(`/api/v1/admin/dashboard/user-growth${queryString({ months })}`),
  recentUsers: (limit = 5): Promise<RecentUser[]> =>
    request(`/api/v1/admin/dashboard/recent-users${queryString({ limit })}`),
};

export interface UserListQuery {
  q?: string;
  status?: UserStatus;
  role?: 'user' | 'staff' | 'admin';
  include_deleted?: boolean;
  limit?: number;
  cursor?: string;
}

export const adminUsers = {
  list: (query: UserListQuery = {}, signal?: AbortSignal): Promise<CursorPage<AdminUserSummary>> =>
    request(`/api/v1/admin/users${queryString(query)}`, { signal }),
  detail: (userId: string): Promise<AdminUserDetail> =>
    request(`/api/v1/admin/users/${encodeURIComponent(userId)}`),
  ban: (userId: string, reason: string): Promise<{ status: string }> =>
    request(`/api/v1/admin/users/${encodeURIComponent(userId)}/ban`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  unban: (userId: string): Promise<{ status: string }> =>
    request(`/api/v1/admin/users/${encodeURIComponent(userId)}/unban`, { method: 'POST' }),
  createStaff: (
    payload: { email: string; username: string; password: string; first_name: string; last_name: string },
  ): Promise<StaffCreateResponse> =>
    request('/api/v1/admin/staff', { method: 'POST', body: JSON.stringify(payload) }),
};

export const adminPlans = {
  list: (): Promise<AdminPlan[]> => request('/api/v1/admin/plans'),
  update: (planId: string, patch: Partial<AdminPlan>): Promise<AdminPlan> =>
    request(`/api/v1/admin/plans/${encodeURIComponent(planId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
};

export interface SubscriptionListQuery {
  tier?: string;
  status?: string;
  limit?: number;
  cursor?: string;
}

export interface InvoiceListQuery {
  status?: string;
  user_id?: string;
  is_manual?: boolean;
  payment_method?: 'payos' | 'momo' | 'manual';
  exclude_internal?: boolean;
  limit?: number;
  cursor?: string;
}

export const adminBilling = {
  subscriptions: (
    query: SubscriptionListQuery = {},
    signal?: AbortSignal,
  ): Promise<CursorPage<AdminSubscription>> =>
    request(`/api/v1/admin/billing/subscriptions${queryString(query)}`, { signal }),
  forceDowngrade: (userId: string): Promise<{ status: string }> =>
    request(`/api/v1/admin/billing/subscriptions/${encodeURIComponent(userId)}/force-downgrade`, {
      method: 'POST',
    }),
  invoices: (query: InvoiceListQuery = {}, signal?: AbortSignal): Promise<CursorPage<AdminInvoice>> =>
    request(`/api/v1/admin/billing/invoices${queryString(query)}`, { signal }),
  refund: (
    invoiceId: string,
    body: { amount_vnd: number; reason: string; override?: boolean },
  ): Promise<{ status: string; refund_id: string }> =>
    request(`/api/v1/admin/billing/invoices/${encodeURIComponent(invoiceId)}/refund`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

export interface ProjectListQuery {
  user_id?: string;
  status?: string;
  q?: string;
  include_deleted?: boolean;
  limit?: number;
  cursor?: string;
}

export const adminProjects = {
  list: (query: ProjectListQuery = {}, signal?: AbortSignal): Promise<CursorPage<AdminProjectSummary>> =>
    request(`/api/v1/admin/projects${queryString(query)}`, { signal }),
  detail: (projectId: string): Promise<AdminProjectDetail> =>
    request(`/api/v1/admin/projects/${encodeURIComponent(projectId)}`),
  remove: (projectId: string): Promise<{ status: string }> =>
    request(`/api/v1/admin/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' }),
};

export interface BakeJobListQuery {
  status?: string;
  priority?: BakePriority;
  project_id?: string;
  limit?: number;
  cursor?: string;
}

export const adminBakeJobs = {
  list: (query: BakeJobListQuery = {}, signal?: AbortSignal): Promise<CursorPage<AdminBakeJob>> =>
    request(`/api/v1/admin/bake-jobs${queryString(query)}`, { signal }),
  detail: (jobId: string, signal?: AbortSignal): Promise<AdminBakeJobDetail> =>
    request(`/api/v1/admin/bake-jobs/${encodeURIComponent(jobId)}`, { signal }),
  requeue: (jobId: string): Promise<{ status: string }> =>
    request(`/api/v1/admin/bake-jobs/${encodeURIComponent(jobId)}/requeue`, { method: 'POST' }),
  cancel: (jobId: string): Promise<{ status: string }> =>
    request(`/api/v1/admin/bake-jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' }),
};

export interface ExportListQuery {
  user_id?: string;
  project_id?: string;
  format?: ExportFormat;
  limit?: number;
  cursor?: string;
}

export const adminExports = {
  list: (query: ExportListQuery = {}, signal?: AbortSignal): Promise<CursorPage<AdminExport>> =>
    request(`/api/v1/admin/exports${queryString(query)}`, { signal }),
};

export const adminSystem = {
  health: (): Promise<SystemHealth> => request('/api/v1/admin/system/health'),
};

export interface AuditLogListQuery {
  q?: string;
  actor_id?: string;
  action?: string;
  target_type?: string;
  target_id?: string;
  limit?: number;
  cursor?: string;
}

export const adminAuditLogs = {
  list: (query: AuditLogListQuery = {}, signal?: AbortSignal): Promise<CursorPage<AdminAuditLog>> =>
    request(`/api/v1/admin/audit-logs${queryString(query)}`, { signal }),
};

/** GET a file (CSV / XLSX / PDF) as the signed-in admin and hand it to the browser. */
async function downloadAdminFile(path: string, fallbackName: string): Promise<void> {
  const send = (token?: string) =>
    fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  let response = await send(getAdminSession()?.accessToken);
  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) response = await send(refreshed);
    else expireAdminSession();
  }
  if (!response.ok) throw await parseApiError(response);
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const jsonBody = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export interface DateRangeQuery {
  date_from?: string;
  date_to?: string;
}

export const adminAnalytics = {
  get: (query: DateRangeQuery = {}): Promise<AdminAnalytics> =>
    request(`/api/v1/admin/analytics${queryString(query)}`),
  downloadReport: (type: ReportType, format: ReportFormat, query: DateRangeQuery = {}): Promise<void> =>
    downloadAdminFile(`/api/v1/admin/reports/${type}${queryString({ format, ...query })}`, `${type}.${format}`),
};

export const adminStudio = {
  listRules: (): Promise<GuardrailRule[]> => request('/api/v1/admin/guardrail-rules'),
  createRule: (kind: 'banned' | 'trademark', term: string): Promise<GuardrailRule> =>
    request('/api/v1/admin/guardrail-rules', jsonBody('POST', { kind, term })),
  setRuleActive: (id: string, isActive: boolean): Promise<GuardrailRule> =>
    request(`/api/v1/admin/guardrail-rules/${id}`, jsonBody('PATCH', { is_active: isActive })),
  removeRule: (id: string): Promise<{ message: string }> =>
    request(`/api/v1/admin/guardrail-rules/${id}`, jsonBody('DELETE')),

  listTemplates: (status?: string): Promise<AdminTemplate[]> =>
    request(`/api/v1/admin/templates${queryString({ status })}`),
  createTemplate: (body: {
    name: string;
    description?: string | null;
    category?: string | null;
    design_config: Record<string, unknown>;
  }): Promise<AdminTemplate> => request('/api/v1/admin/templates', jsonBody('POST', body)),
  reviewTemplate: (id: string, approve: boolean): Promise<AdminTemplate> =>
    request(`/api/v1/admin/templates/${id}/${approve ? 'approve' : 'reject'}`, jsonBody('POST')),
};

export interface FeedbackListQuery {
  status?: FeedbackStatus;
  marketing_group?: string;
  rating?: number;
  include_internal?: boolean;
}

export const adminFeedback = {
  list: (query: FeedbackListQuery = {}): Promise<AdminFeedback[]> =>
    request(`/api/v1/admin/feedback${queryString(query)}`),
  summary: (): Promise<FeedbackSummary> => request('/api/v1/admin/feedback/summary'),
  update: (id: string, body: { status?: FeedbackStatus; changed_what?: string | null }): Promise<AdminFeedback> =>
    request(`/api/v1/admin/feedback/${id}`, jsonBody('PATCH', body)),
  exportXlsx: (): Promise<void> => downloadAdminFile('/api/v1/admin/feedback/export', 'feedback.xlsx'),
};

export const adminFinance = {
  listPeriods: (): Promise<ReportingPeriod[]> => request('/api/v1/admin/billing/periods'),
  createPeriod: (body: { name: string; start_date: string; end_date: string }): Promise<ReportingPeriod> =>
    request('/api/v1/admin/billing/periods', jsonBody('POST', body)),
  lockPeriod: (id: string): Promise<ReportingPeriod> =>
    request(`/api/v1/admin/billing/periods/${id}/lock`, jsonBody('POST')),

  listCoupons: (): Promise<AdminCoupon[]> => request('/api/v1/admin/billing/coupons'),
  createCoupon: (body: {
    code: string;
    discount_type: AdminCoupon['discount_type'];
    value: number;
    plan_tiers?: string[] | null;
    max_uses?: number | null;
    valid_until?: string | null;
  }): Promise<AdminCoupon> => request('/api/v1/admin/billing/coupons', jsonBody('POST', body)),
  updateCoupon: (id: string, body: Partial<Pick<AdminCoupon, 'is_active' | 'max_uses' | 'valid_until'>>): Promise<AdminCoupon> =>
    request(`/api/v1/admin/billing/coupons/${id}`, jsonBody('PATCH', body)),

  proofUpload: (
    filename: string,
    contentType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf',
  ): Promise<{ upload_url: string; file_path: string; expires_in: number }> =>
    request('/api/v1/admin/billing/manual-transactions/proof-upload', jsonBody('POST', { filename, content_type: contentType })),
  createManual: (body: ManualTransactionInput): Promise<AdminInvoice> =>
    request('/api/v1/admin/billing/manual-transactions', jsonBody('POST', body)),
  approveManual: (invoiceId: string): Promise<AdminInvoice> =>
    request(`/api/v1/admin/billing/invoices/${invoiceId}/approve`, jsonBody('POST')),
  rejectManual: (invoiceId: string, reason: string): Promise<AdminInvoice> =>
    request(`/api/v1/admin/billing/invoices/${invoiceId}/reject`, jsonBody('POST', { reason })),
};

export const adminUserActions = {
  grantPlan: (userId: string, body: GrantPlanInput): Promise<{ status: string; tier: string; is_comp: boolean }> =>
    request(`/api/v1/admin/users/${userId}/grant-plan`, jsonBody('POST', body)),
  impersonate: (userId: string, reason: string): Promise<ImpersonationResult> =>
    request(`/api/v1/admin/users/${userId}/impersonate`, jsonBody('POST', { reason })),
  resetPassword: (userId: string): Promise<{ message: string }> =>
    request(`/api/v1/admin/users/${userId}/reset-password`, jsonBody('POST')),
};
