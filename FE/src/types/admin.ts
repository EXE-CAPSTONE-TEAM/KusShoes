export type AdminRole = 'user' | 'staff' | 'admin';

export interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
}

export interface AdminAuthResponse {
  access_token: string;
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

export type PlanTier = 'free' | 'basic_monthly' | 'basic_yearly' | 'pro_monthly' | 'pro_yearly';
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
  tier: 'free' | 'basic' | 'pro';
  billing_cycle: 'monthly' | 'yearly' | null;
  price_vnd: number;
  max_projects: number | null;
  max_exports_per_month: number | null;
  allowed_export_formats: ExportFormat[];
  bake_priority: BakePriority;
  is_active: boolean;
  max_ai_credits_per_cycle: number | null;
  max_scans_per_cycle: number | null;
  max_layers_per_zone: number;
  max_layers_per_project: number;
  allow_draw_artwork: boolean;
}

export type SubscriptionStatus = 'active' | 'grace' | 'cancelled' | 'expired';

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

export type InvoiceStatus = 'pending' | 'awaiting_approval' | 'paid' | 'failed' | 'cancelled' | 'refunded';

export interface AdminInvoice {
  id: string;
  user_id: string;
  user_email: string | null;
  order_code: number;
  plan_tier: 'free' | 'basic' | 'pro';
  billing_cycle: 'monthly' | 'yearly';
  listed_price_vnd: number;
  discount_vnd: number;
  amount_vnd: number;
  payment_method: 'payos' | 'momo' | 'manual';
  status: InvoiceStatus;
  payment_reference: string | null;
  receipt_number?: string | null;
  coupon_code?: string | null;
  is_manual?: boolean;
  collected_by?: string | null;
  created_by?: string | null;
  approved_by?: string | null;
  paid_at: string | null;
  created_at: string;
  vat: { enabled: boolean; rate_percent: number; vat_vnd: number; net_vnd: number };
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

// ---- Analytics (SRS 5.4) ----
export interface PeriodValue { current: number; previous: number }
export interface AdminAnalytics {
  date_from: string;
  date_to: string;
  mrr_vnd: number;
  arr_vnd: number;
  arpu_vnd: number;
  paying_customers: number;
  revenue_vnd: PeriodValue;
  refunds_vnd: PeriodValue;
  new_paying_customers: PeriodValue;
  churn: { due: number; churned: number; rate: number | null };
  retention: { month: string; nrr: number | null; grr: number | null };
  free_to_paid: { numerator: number; denominator: number; rate: number | null };
  repeat: {
    paying_customers: number;
    repeat_customers: number;
    not_yet_due: number;
    rate: number | null;
    raw_rate: number | null;
  };
  failed_payments: { count_30d: number; amount_30d_vnd: number };
  revenue_by_plan: { plan_tier: string; revenue_vnd: number; share: number }[];
  revenue_series: { month: string; revenue_vnd: number }[];
  mrr_movement: {
    month: string;
    new: number;
    expansion: number;
    reactivation: number;
    contraction: number;
    churn: number;
    net_new: number;
  };
  top_customers: { user_id: string; email: string | null; net_paid_vnd: number; orders: number }[];
  payment_methods: { payment_method: string; revenue_vnd: number; share: number }[];
  outstanding: { count: number; amount_vnd: number };
  discounts_vnd: number;
  vat_collected_vnd: number;
  credit_revenue_vnd: number;
  refund_rate: number | null;
  api_cost_vnd: number;
  gross_margin_vnd: number;
}

export type ReportType = 'revenue' | 'users' | 'transactions' | 'channel-funnel' | 'api-cost';
export type ReportFormat = 'csv' | 'xlsx' | 'pdf';

// ---- Content guardrail & templates ----
export interface GuardrailRule { id: string; kind: 'banned' | 'trademark'; term: string; is_active: boolean }
export interface AdminTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  thumbnail_path: string | null;
  layer_count: number;
  use_count: number;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

// ---- Feedback ----
export type FeedbackStatus = 'new' | 'reviewed' | 'planned' | 'done' | 'wont_do';
export interface AdminFeedback {
  id: string;
  rating: number;
  marketing_group: 'product' | 'price' | 'place' | 'promotion';
  message: string;
  status: FeedbackStatus;
  changed_what: string | null;
  created_at: string;
  user_id: string;
  user_email: string | null;
  is_internal: boolean;
  reviewed_at: string | null;
}
export interface FeedbackSummary {
  count: number;
  average_rating: number;
  by_status: Record<string, number>;
  by_group: Record<string, number>;
}

// ---- Finance ----
export interface ReportingPeriod {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: 'open' | 'locked';
  locked_by: string | null;
  locked_at: string | null;
}
export interface AdminCoupon {
  id: string;
  code: string;
  discount_type: 'percent' | 'fixed' | 'fixed_price';
  value: number;
  plan_tiers: string[] | null;
  max_uses: number | null;
  used_count: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
}
export interface ManualTransactionInput {
  user_id: string;
  tier: 'basic' | 'pro';
  billing_cycle: 'monthly' | 'yearly';
  amount_vnd: number;
  paid_on: string;
  collected_by: string;
  proof_path: string;
  reason: string;
}
export interface GrantPlanInput {
  tier: 'basic' | 'pro';
  billing_cycle: 'monthly' | 'yearly';
  days: number;
  reason: string;
}
export interface ImpersonationResult {
  access_token: string;
  expires_at: string;
  target_user_id: string;
  banner: string;
}

// ---- VAT (BR-28) ----
export interface AdminTaxConfig {
  enabled: boolean;
  rate_percent: number;
}

// ---- Content moderation (BR-77 / UC-24) ----
export type ReportReason = 'copyright' | 'trademark' | 'inappropriate' | 'other';
export type ReportStatus = 'new' | 'reviewing' | 'upheld' | 'dismissed';
export type ModerationActionKind = 'warning' | 'share_restriction' | 'ban';

export interface ModerationAction {
  level: number;
  action: ModerationActionKind;
  restricted_until: string | null;
  report_status: ReportStatus | null;
  id: string;
  report_id: string | null;
  reason: string;
  created_by: string | null;
  created_at: string;
}

export interface AdminContentReport {
  id: string;
  project_id: string | null;
  template_id: string | null;
  reported_user_id: string;
  reason: ReportReason;
  status: ReportStatus;
  created_at: string;
}

export interface AdminContentReportDetail extends AdminContentReport {
  details: string;
  reporter_email: string | null;
  reporter_name: string | null;
  evidence_url: string | null;
  resolution_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  user_actions: ModerationAction[];
}

// ---- API cost tracking (SF-14 / BR-108) ----
export interface AdminApiCostDailyRow {
  day: string;
  calls: number;
  success_calls: number;
  failed_calls: number;
  cost_vnd: number;
}

export type ApiBudgetState = 'unconfigured' | 'ok' | 'warning' | 'suspended';

export interface AdminApiBudget {
  period_month: string;
  budget_vnd: number | null;
  spent_vnd: number;
  percent: number | null;
  state: ApiBudgetState;
  warned_at: string | null;
  suspended_at: string | null;
}
