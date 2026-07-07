export type AdminRole = 'user' | 'staff' | 'admin';

export interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
}

export interface AdminAuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  role: 'admin' | 'staff';
}

export interface AdminApiErrorBody {
  code: string;
  message: string;
}

export interface DashboardStats {
  total_users: number;
  mrr_vnd: number;
  total_exports: number;
}

export interface MonthlyPoint {
  month: string;
  value: number;
}

export type PlanTier = 'free' | 'creator_monthly' | 'creator_yearly' | 'pro_monthly' | 'pro_yearly';
export type UserStatus = 'active' | 'suspended';

export interface RecentUser {
  id: string;
  email: string;
  username: string;
  plan_tier: PlanTier;
  status: UserStatus;
  mrr_vnd: number;
  created_at: string;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  username: string;
  account_code: string;
  role: AdminRole;
  status: UserStatus;
  is_verified: boolean;
  deleted_at: string | null;
  created_at: string;
}

export interface AdminUserDetail extends AdminUserSummary {
  first_name: string | null;
  last_name: string | null;
  subscription_tier: PlanTier | null;
  subscription_status: 'active' | 'cancelled' | 'expired' | null;
  subscription_expires_at: string | null;
  projects_count_this_month: number;
  exports_count_this_month: number;
  total_projects: number;
}

export type ExportFormat = 'glb' | 'obj' | 'zip';
export type BakePriority = 'low' | 'normal' | 'high';

export interface AdminPlan {
  id: string;
  tier: 'free' | 'creator' | 'pro';
  billing_cycle: 'monthly' | 'yearly' | null;
  price_vnd: number;
  max_projects: number | null;
  max_exports_per_month: number | null;
  allowed_export_formats: ExportFormat[];
  bake_priority: BakePriority;
  is_active: boolean;
  polar_product_id: string | null;
}

export type SubscriptionStatus = 'active' | 'cancelled' | 'expired';

export interface AdminSubscription {
  id: string;
  user_id: string;
  user_email: string | null;
  tier: PlanTier;
  status: SubscriptionStatus;
  started_at: string;
  expires_at: string | null;
  cancel_at_period_end: boolean;
}

export type InvoiceStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface AdminInvoice {
  id: string;
  user_id: string;
  user_email: string | null;
  plan_tier: 'free' | 'creator' | 'pro';
  billing_cycle: 'monthly' | 'yearly';
  amount_vnd: number;
  payment_method: 'polar' | 'manual';
  status: InvoiceStatus;
  polar_order_id: string | null;
  paid_at: string | null;
  created_at: string;
}

export type ProjectStatus = 'draft' | 'in_progress' | 'baking' | 'completed';

export interface AdminProjectSummary {
  id: string;
  name: string;
  status: ProjectStatus;
  user_id: string;
  owner_email: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminProjectDetail extends AdminProjectSummary {
  description: string | null;
  asset_count: number;
  latest_bake_status: BakeJobStatus | null;
}

export type BakeJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface AdminBakeJob {
  id: string;
  project_id: string;
  project_name: string | null;
  status: BakeJobStatus;
  priority: BakePriority;
  error_message: string | null;
  worker_id: string | null;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface AdminBakeJobDetail extends AdminBakeJob {
  design_config_snapshot: Record<string, unknown>;
}

export interface AdminExport {
  id: string;
  project_id: string;
  project_name: string | null;
  user_id: string;
  user_email: string | null;
  format: ExportFormat;
  file_path: string;
  created_at: string;
}

export interface SystemHealth {
  status: 'ok' | 'degraded';
  checks: Record<string, string>;
  queue_depths: Partial<Record<BakePriority, number>>;
  bake_jobs_by_status: Record<BakeJobStatus, number>;
}

export type AuditAction =
  | 'user.ban'
  | 'user.unban'
  | 'staff.create'
  | 'plan.update'
  | 'project.delete'
  | 'bake_job.requeue'
  | 'bake_job.cancel'
  | 'subscription.force_downgrade'
  | 'invoice.refund';

export interface AdminAuditLog {
  id: string;
  actor_id: string;
  actor_email: string | null;
  actor_role: 'admin' | 'staff';
  action: AuditAction;
  target_type: string | null;
  target_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface StaffCreateResponse {
  id: string;
  email: string;
  username: string;
  account_code: string;
  role: 'staff';
}
