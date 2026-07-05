import type {
  AdminRole, AdminAuthResponse, DashboardStats, MonthlyPoint, RecentUser,
  AdminUserSummary, AdminUserDetail, AdminPlan, AdminSubscription, AdminInvoice,
  AdminProjectSummary, AdminProjectDetail, AdminBakeJob, AdminBakeJobDetail,
  AdminExport, SystemHealth, AdminAuditLog, UserStatus, ExportFormat, BakePriority,
} from '../types/admin';
import {
  mockUsers, mockPlans, mockSubscriptions, mockInvoices, mockProjects,
  mockBakeJobs, mockExports, mockAuditLogs, mockDashboardStats, mockRevenue,
  mockUserGrowth, mockRecentUsers, mockSystemHealth,
} from '../data/adminMockData';

export class AdminApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const LATENCY = 350;
const delay = <T,>(value: T): Promise<T> =>
  new Promise(resolve => setTimeout(() => resolve(value), LATENCY));

const requireAdmin = (role: AdminRole | null) => {
  if (role !== 'admin') {
    throw new AdminApiError('ADMIN_FORBIDDEN', 'Chỉ quản trị viên mới có quyền thực hiện thao tác này');
  }
};

const paginate = <T extends Record<string, any>>(items: T[], cursorField: string, limit = 20, before?: string) => {
  let sorted = [...items].sort((a, b) => new Date(b[cursorField]).getTime() - new Date(a[cursorField]).getTime());
  if (before) {
    sorted = sorted.filter(item => new Date(item[cursorField]).getTime() < new Date(before).getTime());
  }
  return sorted.slice(0, limit);
};

// ---------------- Auth ----------------
export const adminAuth = {
  login: async (email: string, password: string): Promise<AdminAuthResponse> => {
    await delay(null);
    if (password !== 'Password123') {
      throw new AdminApiError('INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng');
    }
    const user = mockUsers.find(u => u.email.toLowerCase() === email.toLowerCase() && (u.role === 'admin' || u.role === 'staff'));
    if (!user) {
      throw new AdminApiError('INVALID_CREDENTIALS', 'Tài khoản không tồn tại hoặc không có quyền truy cập Admin');
    }
    return {
      access_token: `mock-access-${user.id}`,
      refresh_token: `mock-refresh-${user.id}`,
      token_type: 'bearer',
      role: user.role as 'admin' | 'staff',
    };
  },
};

// ---------------- Dashboard ----------------
export const adminDashboard = {
  stats: async (): Promise<DashboardStats> => delay(mockDashboardStats),
  revenue: async (months = 12): Promise<MonthlyPoint[]> => delay(mockRevenue.slice(-months)),
  userGrowth: async (months = 6): Promise<MonthlyPoint[]> => delay(mockUserGrowth.slice(-months)),
  recentUsers: async (limit = 5): Promise<RecentUser[]> => delay(mockRecentUsers.slice(0, limit)),
};

// ---------------- Users ----------------
export interface UserListQuery {
  q?: string;
  status?: UserStatus;
  role?: AdminRole;
  include_deleted?: boolean;
  limit?: number;
  before?: string;
}

export const adminUsers = {
  list: async (query: UserListQuery = {}): Promise<AdminUserSummary[]> => {
    let items = mockUsers.filter(u => query.include_deleted || !u.deleted_at);
    if (query.q) {
      const q = query.q.toLowerCase();
      items = items.filter(u => u.email.toLowerCase().includes(q) || u.username.toLowerCase().includes(q));
    }
    if (query.status) items = items.filter(u => u.status === query.status);
    if (query.role) items = items.filter(u => u.role === query.role);
    return delay(paginate(items, 'created_at', query.limit ?? 20, query.before));
  },
  detail: async (userId: string): Promise<AdminUserDetail> => {
    const user = mockUsers.find(u => u.id === userId);
    if (!user) throw new AdminApiError('NOT_FOUND', 'Không tìm thấy người dùng');
    return delay(user);
  },
  ban: async (role: AdminRole | null, userId: string, _reason: string): Promise<{ status: string }> => {
    requireAdmin(role);
    const user = mockUsers.find(u => u.id === userId);
    if (!user) throw new AdminApiError('NOT_FOUND', 'Không tìm thấy người dùng');
    if (user.role !== 'user') throw new AdminApiError('CANNOT_BAN', 'Chỉ được khóa tài khoản có role user');
    user.status = 'suspended';
    return delay({ status: 'banned' });
  },
  unban: async (role: AdminRole | null, userId: string): Promise<{ status: string }> => {
    requireAdmin(role);
    const user = mockUsers.find(u => u.id === userId);
    if (!user) throw new AdminApiError('NOT_FOUND', 'Không tìm thấy người dùng');
    user.status = 'active';
    return delay({ status: 'unbanned' });
  },
  createStaff: async (
    role: AdminRole | null,
    payload: { email: string; username: string; password: string; first_name: string; last_name: string }
  ): Promise<AdminUserSummary> => {
    requireAdmin(role);
    const newStaff: AdminUserDetail = {
      id: `usr-${Math.random().toString(36).slice(2, 8)}`,
      email: payload.email,
      username: payload.username,
      account_code: `KS-2026-${String(mockUsers.length + 1).padStart(5, '0')}`,
      role: 'staff',
      status: 'active',
      is_verified: true,
      deleted_at: null,
      created_at: new Date().toISOString(),
      first_name: payload.first_name,
      last_name: payload.last_name,
      subscription_tier: 'free',
      subscription_status: 'expired',
      subscription_expires_at: null,
      projects_count_this_month: 0,
      exports_count_this_month: 0,
      total_projects: 0,
    };
    mockUsers.unshift(newStaff);
    return delay(newStaff);
  },
};

// ---------------- Plans ----------------
export const adminPlans = {
  list: async (): Promise<AdminPlan[]> => delay(mockPlans),
  update: async (role: AdminRole | null, planId: string, patch: Partial<AdminPlan>): Promise<AdminPlan> => {
    requireAdmin(role);
    const plan = mockPlans.find(p => p.id === planId);
    if (!plan) throw new AdminApiError('NOT_FOUND', 'Không tìm thấy gói dịch vụ');
    Object.assign(plan, patch);
    return delay(plan);
  },
};

// ---------------- Billing ----------------
export interface SubscriptionListQuery {
  tier?: string;
  status?: string;
  limit?: number;
  before?: string;
}

export interface InvoiceListQuery {
  status?: string;
  user_id?: string;
  limit?: number;
  before?: string;
}

export const adminBilling = {
  subscriptions: async (query: SubscriptionListQuery = {}): Promise<AdminSubscription[]> => {
    let items = mockSubscriptions;
    if (query.tier) items = items.filter(s => s.tier === query.tier);
    if (query.status) items = items.filter(s => s.status === query.status);
    return delay(paginate(items, 'started_at', query.limit ?? 20, query.before));
  },
  forceDowngrade: async (role: AdminRole | null, userId: string): Promise<{ status: string }> => {
    requireAdmin(role);
    const sub = mockSubscriptions.find(s => s.user_id === userId);
    if (sub) {
      sub.tier = 'free';
      sub.status = 'cancelled';
    }
    return delay({ status: 'downgraded' });
  },
  invoices: async (query: InvoiceListQuery = {}): Promise<AdminInvoice[]> => {
    let items = mockInvoices;
    if (query.status) items = items.filter(i => i.status === query.status);
    if (query.user_id) items = items.filter(i => i.user_id === query.user_id);
    return delay(paginate(items, 'created_at', query.limit ?? 20, query.before));
  },
  refund: async (role: AdminRole | null, invoiceId: string): Promise<{ status: string; polar_refund_id: string }> => {
    requireAdmin(role);
    const invoice = mockInvoices.find(i => i.id === invoiceId);
    if (!invoice) throw new AdminApiError('NOT_FOUND', 'Không tìm thấy hóa đơn');
    if (invoice.status !== 'paid' || invoice.payment_method !== 'polar' || !invoice.polar_order_id) {
      throw new AdminApiError('REFUND_NOT_ALLOWED', 'Hóa đơn không đủ điều kiện hoàn tiền');
    }
    return delay({ status: 'refund_requested', polar_refund_id: `refund-${invoiceId}` });
  },
};

// ---------------- Projects ----------------
export interface ProjectListQuery {
  user_id?: string;
  status?: string;
  q?: string;
  include_deleted?: boolean;
  limit?: number;
  before?: string;
}

export const adminProjects = {
  list: async (query: ProjectListQuery = {}): Promise<AdminProjectSummary[]> => {
    let items = mockProjects.filter(p => query.include_deleted || !p.deleted_at);
    if (query.user_id) items = items.filter(p => p.user_id === query.user_id);
    if (query.status) items = items.filter(p => p.status === query.status);
    if (query.q) {
      const q = query.q.toLowerCase();
      items = items.filter(p => p.name.toLowerCase().includes(q));
    }
    return delay(paginate(items, 'created_at', query.limit ?? 20, query.before));
  },
  detail: async (projectId: string): Promise<AdminProjectDetail> => {
    const project = mockProjects.find(p => p.id === projectId);
    if (!project) throw new AdminApiError('NOT_FOUND', 'Không tìm thấy project');
    return delay(project);
  },
  remove: async (role: AdminRole | null, projectId: string): Promise<{ status: string }> => {
    requireAdmin(role);
    const project = mockProjects.find(p => p.id === projectId);
    if (!project) throw new AdminApiError('NOT_FOUND', 'Không tìm thấy project');
    project.deleted_at = new Date().toISOString();
    return delay({ status: 'deleted' });
  },
};

// ---------------- Bake Jobs ----------------
export interface BakeJobListQuery {
  status?: string;
  priority?: BakePriority;
  project_id?: string;
  limit?: number;
  before?: string;
}

export const adminBakeJobs = {
  list: async (query: BakeJobListQuery = {}): Promise<AdminBakeJob[]> => {
    let items = mockBakeJobs;
    if (query.status) items = items.filter(j => j.status === query.status);
    if (query.priority) items = items.filter(j => j.priority === query.priority);
    if (query.project_id) items = items.filter(j => j.project_id === query.project_id);
    return delay(paginate(items, 'queued_at', query.limit ?? 20, query.before));
  },
  detail: async (jobId: string): Promise<AdminBakeJobDetail> => {
    const job = mockBakeJobs.find(j => j.id === jobId);
    if (!job) throw new AdminApiError('NOT_FOUND', 'Không tìm thấy bake job');
    return delay(job);
  },
  requeue: async (role: AdminRole | null, jobId: string): Promise<{ status: string }> => {
    requireAdmin(role);
    const job = mockBakeJobs.find(j => j.id === jobId);
    if (!job) throw new AdminApiError('NOT_FOUND', 'Không tìm thấy bake job');
    if (job.status !== 'failed') throw new AdminApiError('INVALID_STATE', 'Chỉ có thể requeue job đã failed');
    job.status = 'queued';
    job.error_message = null;
    job.started_at = null;
    job.completed_at = null;
    return delay({ status: 'requeued' });
  },
  cancel: async (role: AdminRole | null, jobId: string): Promise<{ status: string }> => {
    requireAdmin(role);
    const job = mockBakeJobs.find(j => j.id === jobId);
    if (!job) throw new AdminApiError('NOT_FOUND', 'Không tìm thấy bake job');
    if (job.status !== 'queued') throw new AdminApiError('INVALID_STATE', 'Chỉ có thể hủy job đang queued');
    job.status = 'cancelled';
    job.completed_at = new Date().toISOString();
    return delay({ status: 'cancelled' });
  },
};

// ---------------- Exports ----------------
export interface ExportListQuery {
  user_id?: string;
  project_id?: string;
  format?: ExportFormat;
  limit?: number;
  before?: string;
}

export const adminExports = {
  list: async (query: ExportListQuery = {}): Promise<AdminExport[]> => {
    let items = mockExports;
    if (query.user_id) items = items.filter(e => e.user_id === query.user_id);
    if (query.project_id) items = items.filter(e => e.project_id === query.project_id);
    if (query.format) items = items.filter(e => e.format === query.format);
    return delay(paginate(items, 'created_at', query.limit ?? 20, query.before));
  },
};

// ---------------- System ----------------
export const adminSystem = {
  health: async (): Promise<SystemHealth> => delay(mockSystemHealth),
};

// ---------------- Audit Logs ----------------
export interface AuditLogListQuery {
  actor_id?: string;
  action?: string;
  target_type?: string;
  target_id?: string;
  /** Free-text search across actor email, target id, and payload (FE-side convenience filter). */
  q?: string;
  limit?: number;
  before?: string;
}

export const adminAuditLogs = {
  list: async (role: AdminRole | null, query: AuditLogListQuery = {}): Promise<AdminAuditLog[]> => {
    requireAdmin(role);
    let items = mockAuditLogs;
    if (query.actor_id) items = items.filter(l => l.actor_id === query.actor_id);
    if (query.action) items = items.filter(l => l.action === query.action);
    if (query.target_type) items = items.filter(l => l.target_type === query.target_type);
    if (query.target_id) items = items.filter(l => l.target_id === query.target_id);
    if (query.q) {
      const q = query.q.toLowerCase();
      items = items.filter(l =>
        l.actor_email.toLowerCase().includes(q) ||
        l.target_id.toLowerCase().includes(q) ||
        l.target_type.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        JSON.stringify(l.payload).toLowerCase().includes(q)
      );
    }
    return delay(paginate(items, 'created_at', query.limit ?? 20, query.before));
  },
};
