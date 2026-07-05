import type {
  AdminUserDetail, AdminPlan, AdminSubscription, AdminInvoice,
  AdminProjectDetail, AdminBakeJobDetail, AdminExport, AdminAuditLog,
  DashboardStats, MonthlyPoint, RecentUser, SystemHealth, PlanTier,
} from '../types/admin';

let idCounter = 1000;
const nextId = (prefix: string) => `${prefix}-${(idCounter++).toString(36)}`;

const FIRST_NAMES = ['Nguyen', 'Tran', 'Le', 'Pham', 'Hoang', 'Vu', 'Dang', 'Bui', 'Do', 'Ho'];
const LAST_NAMES = ['Van A', 'Thi B', 'Minh C', 'Quoc D', 'Thanh E', 'Gia F', 'Hai G', 'Bao H'];
const pick = <T,>(arr: readonly T[], seed: number): T => arr[seed % arr.length];

const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

// ---------------- Users ----------------
const TIERS: PlanTier[] = ['free', 'creator_monthly', 'creator_yearly', 'pro_monthly', 'pro_yearly'];
const TIER_MRR: Record<PlanTier, number> = {
  free: 0,
  creator_monthly: 199000,
  creator_yearly: 159000,
  pro_monthly: 399000,
  pro_yearly: 329000,
};

export const mockUsers: AdminUserDetail[] = Array.from({ length: 42 }).map((_, i) => {
  const idx = i + 1;
  const isStaff = idx === 2;
  const isAdmin = idx === 1;
  const tier = pick(TIERS, idx);
  const suspended = idx % 11 === 0 && !isAdmin && !isStaff;
  return {
    id: nextId('usr'),
    email: isAdmin ? 'admin@kusshoes.vn' : isStaff ? 'staff@kusshoes.vn' : `user${idx}@kusshoes.vn`,
    username: isAdmin ? 'admin' : isStaff ? 'support01' : `creator_${idx}`,
    account_code: `KS-2026-${String(idx).padStart(5, '0')}`,
    role: isAdmin ? 'admin' : isStaff ? 'staff' : 'user',
    status: suspended ? 'suspended' : 'active',
    is_verified: idx % 7 !== 0,
    deleted_at: null,
    created_at: daysAgo(180 - idx * 3),
    first_name: pick(FIRST_NAMES, idx),
    last_name: pick(LAST_NAMES, idx + 3),
    subscription_tier: tier,
    subscription_status: tier === 'free' ? 'expired' : suspended ? 'cancelled' : 'active',
    subscription_expires_at: tier === 'free' ? null : daysAgo(-30 + (idx % 20)),
    projects_count_this_month: idx % 6,
    exports_count_this_month: idx % 10,
    total_projects: (idx % 15) + 1,
  };
});

// ---------------- Plans ----------------
export const mockPlans: AdminPlan[] = [
  { id: nextId('plan'), tier: 'free', billing_cycle: 'monthly', price_vnd: 0, max_projects: 3, max_exports_per_month: 5, allowed_export_formats: ['glb'], bake_priority: 'low', is_active: true, polar_product_id: null },
  { id: nextId('plan'), tier: 'creator', billing_cycle: 'monthly', price_vnd: 199000, max_projects: 20, max_exports_per_month: 50, allowed_export_formats: ['glb', 'obj'], bake_priority: 'normal', is_active: true, polar_product_id: 'polar-creator-m' },
  { id: nextId('plan'), tier: 'creator', billing_cycle: 'yearly', price_vnd: 1908000, max_projects: 20, max_exports_per_month: 50, allowed_export_formats: ['glb', 'obj'], bake_priority: 'normal', is_active: true, polar_product_id: 'polar-creator-y' },
  { id: nextId('plan'), tier: 'pro', billing_cycle: 'monthly', price_vnd: 399000, max_projects: 100, max_exports_per_month: 200, allowed_export_formats: ['glb', 'obj', 'zip'], bake_priority: 'high', is_active: true, polar_product_id: 'polar-pro-m' },
  { id: nextId('plan'), tier: 'pro', billing_cycle: 'yearly', price_vnd: 3948000, max_projects: 100, max_exports_per_month: 200, allowed_export_formats: ['glb', 'obj', 'zip'], bake_priority: 'high', is_active: true, polar_product_id: 'polar-pro-y' },
];

// ---------------- Subscriptions ----------------
export const mockSubscriptions: AdminSubscription[] = mockUsers
  .filter(u => u.subscription_tier !== 'free')
  .map((u, i) => ({
    id: nextId('sub'),
    user_id: u.id,
    user_email: u.email,
    tier: u.subscription_tier,
    status: u.subscription_status,
    started_at: daysAgo(90 - i),
    expires_at: u.subscription_expires_at,
    cancel_at_period_end: i % 8 === 0,
  }));

// ---------------- Invoices ----------------
const INVOICE_STATUSES = ['paid', 'paid', 'paid', 'pending', 'failed', 'refunded'] as const;
export const mockInvoices: AdminInvoice[] = mockSubscriptions.flatMap((sub, i) =>
  Array.from({ length: 2 }).map((_, j) => {
    const status = pick(INVOICE_STATUSES, i + j);
    const tier = sub.tier.startsWith('pro') ? 'pro' : sub.tier === 'free' ? 'free' : 'creator';
    const cycle: 'monthly' | 'yearly' = sub.tier.endsWith('yearly') ? 'yearly' : 'monthly';
    return {
      id: nextId('inv'),
      user_id: sub.user_id,
      user_email: sub.user_email,
      plan_tier: tier as 'free' | 'creator' | 'pro',
      billing_cycle: cycle,
      amount_vnd: TIER_MRR[sub.tier] || 199000,
      payment_method: 'polar' as const,
      status,
      paid_at: status === 'paid' || status === 'refunded' ? daysAgo(60 - i * 2 - j) : null,
      created_at: daysAgo(60 - i * 2 - j),
      polar_order_id: status === 'pending' ? null : `polar-order-${i}-${j}`,
    };
  })
);

// ---------------- Projects ----------------
const PROJECT_STATUSES = ['draft', 'in_progress', 'baking', 'completed'] as const;
const SHOE_NAMES = ['Air Force 1 Street Art', 'Jordan 1 Retro Shadow', 'Superstar Core Neon', 'Yeezy 350 Sand Wave', 'Dunk Low Crimson', 'Forum Low Off-White', 'Chuck 70 Vapor', 'Air Max 90 Blaze'];

export const mockProjects: AdminProjectDetail[] = Array.from({ length: 56 }).map((_, i) => {
  const owner = pick(mockUsers.filter(u => u.role === 'user'), i);
  const status = pick(PROJECT_STATUSES, i);
  return {
    id: nextId('proj'),
    name: `${pick(SHOE_NAMES, i)} #${i + 1}`,
    status,
    user_id: owner.id,
    owner_email: owner.email,
    deleted_at: i % 17 === 0 ? daysAgo(2) : null,
    created_at: daysAgo(120 - i),
    updated_at: daysAgo(60 - (i % 40)),
    description: 'Custom sneaker reconstruction synced from mobile photogrammetry scan.',
    asset_count: (i % 8) + 1,
    latest_bake_status: status === 'completed' ? 'completed' : status === 'baking' ? 'processing' : status === 'draft' ? null : 'queued',
  };
});

// ---------------- Bake Jobs ----------------
const BAKE_STATUSES = ['queued', 'processing', 'completed', 'completed', 'failed', 'cancelled'] as const;
export const mockBakeJobs: AdminBakeJobDetail[] = mockProjects.slice(0, 45).map((proj, i) => {
  const status = pick(BAKE_STATUSES, i);
  return {
    id: nextId('bake'),
    project_id: proj.id,
    project_name: proj.name,
    status,
    priority: pick(['low', 'normal', 'high'] as const, i),
    error_message: status === 'failed' ? 'Worker timeout while packaging vertex buffers' : null,
    worker_id: status === 'queued' ? null : `worker-0${(i % 4) + 1}`,
    queued_at: daysAgo(30 - (i % 25)),
    started_at: status === 'queued' ? null : daysAgo(29 - (i % 25)),
    completed_at: status === 'completed' || status === 'failed' || status === 'cancelled' ? daysAgo(28 - (i % 25)) : null,
    design_config_snapshot: { colorway: `#${(i * 1234567 % 0xffffff).toString(16).padStart(6, '0')}`, baseModel: proj.name },
  };
});

// ---------------- Exports ----------------
const EXPORT_FORMATS = ['glb', 'obj', 'zip'] as const;
export const mockExports: AdminExport[] = mockProjects.slice(0, 40).map((proj, i) => {
  const format = pick(EXPORT_FORMATS, i);
  return {
    id: nextId('exp'),
    project_id: proj.id,
    project_name: proj.name,
    user_id: proj.user_id,
    user_email: proj.owner_email,
    format,
    file_path: `exports/${proj.id}/model-${i}.${format}`,
    created_at: daysAgo(50 - i),
  };
});

// ---------------- Audit Logs ----------------
const AUDIT_ACTIONS = [
  'user.ban', 'user.unban', 'staff.create', 'plan.update', 'project.delete',
  'bake_job.requeue', 'bake_job.cancel', 'subscription.force_downgrade', 'invoice.refund',
] as const;

const AUDIT_PAYLOAD = (action: (typeof AUDIT_ACTIONS)[number], i: number): Record<string, unknown> => {
  switch (action) {
    case 'user.ban':
      return { reason: pick(['Vi phạm điều khoản sử dụng', 'Spam nội dung', 'Gian lận thanh toán'], i) };
    case 'user.unban':
      return { reason: 'Yêu cầu khiếu nại đã được duyệt' };
    case 'staff.create':
      return { email: `support${(i % 5) + 1}@kusshoes.vn` };
    case 'plan.update':
      return { fields_changed: pick([['price_vnd'], ['max_projects', 'max_exports_per_month'], ['bake_priority'], ['allowed_export_formats']], i) };
    case 'project.delete':
      return { project_name: pick(SHOE_NAMES, i) };
    case 'bake_job.requeue':
      return { previous_error: 'Worker timeout while packaging vertex buffers' };
    case 'bake_job.cancel':
      return { reason: 'Người dùng hủy trước khi xử lý' };
    case 'subscription.force_downgrade':
      return { previous_tier: pick(TIERS, i) };
    case 'invoice.refund':
      return { amount_vnd: pick([199000, 259000, 399000], i) };
    default:
      return {};
  }
};

const AUDIT_TARGET_TYPE: Record<(typeof AUDIT_ACTIONS)[number], string> = {
  'user.ban': 'user',
  'user.unban': 'user',
  'staff.create': 'staff',
  'plan.update': 'plan',
  'project.delete': 'project',
  'bake_job.requeue': 'bake_job',
  'bake_job.cancel': 'bake_job',
  'subscription.force_downgrade': 'subscription',
  'invoice.refund': 'invoice',
};

export const mockAuditLogs: AdminAuditLog[] = Array.from({ length: 38 }).map((_, i) => {
  const action = pick(AUDIT_ACTIONS, i);
  const admin = mockUsers[0];
  return {
    id: nextId('audit'),
    actor_id: admin.id,
    actor_email: admin.email,
    actor_role: 'admin',
    action,
    target_type: AUDIT_TARGET_TYPE[action],
    target_id: nextId('target'),
    payload: AUDIT_PAYLOAD(action, i),
    created_at: daysAgo(40 - i),
  };
});

// ---------------- Dashboard ----------------
export const mockDashboardStats: DashboardStats = {
  total_users: mockUsers.length,
  mrr_vnd: mockSubscriptions.reduce((sum, s) => sum + (TIER_MRR[s.tier] || 0), 0),
  total_exports: mockExports.length,
};

export const mockRevenue: MonthlyPoint[] = Array.from({ length: 12 }).map((_, i) => {
  const d = new Date();
  d.setMonth(d.getMonth() - (11 - i));
  d.setDate(1);
  return { month: d.toISOString().slice(0, 10), value: 3000000 + Math.round(Math.sin(i / 2) * 1500000 + i * 400000) };
});

export const mockUserGrowth: MonthlyPoint[] = Array.from({ length: 6 }).map((_, i) => {
  const d = new Date();
  d.setMonth(d.getMonth() - (5 - i));
  d.setDate(1);
  return { month: d.toISOString().slice(0, 10), value: 60 + i * 15 + (i % 2 === 0 ? 5 : 0) };
});

export const mockRecentUsers: RecentUser[] = mockUsers
  .filter(u => u.role === 'user')
  .slice(-6)
  .reverse()
  .map(u => ({
    id: u.id,
    email: u.email,
    username: u.username,
    plan_tier: u.subscription_tier,
    status: u.status,
    mrr_vnd: TIER_MRR[u.subscription_tier] || 0,
    created_at: u.created_at,
  }));

export const mockSystemHealth: SystemHealth = {
  status: 'ok',
  checks: { db: 'ok', redis: 'ok', storage: 'ok' },
  queue_depths: { high: 1, normal: 4, low: 2 },
  bake_jobs_by_status: {
    queued: mockBakeJobs.filter(j => j.status === 'queued').length,
    processing: mockBakeJobs.filter(j => j.status === 'processing').length,
    completed: mockBakeJobs.filter(j => j.status === 'completed').length,
    failed: mockBakeJobs.filter(j => j.status === 'failed').length,
    cancelled: mockBakeJobs.filter(j => j.status === 'cancelled').length,
  },
};
