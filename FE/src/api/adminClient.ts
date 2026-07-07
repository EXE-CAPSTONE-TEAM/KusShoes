import type {
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
import { getAdminSession, updateAccessToken, expireAdminSession } from './adminSession';

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
    const refreshToken = getAdminSession()?.refreshToken;
    if (!refreshToken) return null;

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
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
  logout: (refreshToken: string): Promise<void> =>
    request<void>('/api/v1/admin/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    }, false),
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
  refund: (invoiceId: string): Promise<{ status: string; polar_refund_id: string }> =>
    request(`/api/v1/admin/billing/invoices/${encodeURIComponent(invoiceId)}/refund`, {
      method: 'POST',
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
