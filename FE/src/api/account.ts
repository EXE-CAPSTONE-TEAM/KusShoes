import { request } from "./client";

// ---- Two-factor authentication (BR-12/13) ----------------------------------------------

export type TwoFactorMethod = "totp" | "email";

export type TwoFactorStatus = {
  enabled: boolean;
  method: TwoFactorMethod | null;
  recovery_email: string | null;
  recovery_email_verified: boolean;
};

export type TwoFactorSetup = {
  method: TwoFactorMethod;
  totp_secret: string | null;
  provisioning_uri: string | null;
};

// ---- Sessions, login history ----------------------------------------------------------

export type SessionInfo = {
  id: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: string;
  last_used_at: string | null;
  expires_at: string;
};

export type LoginHistoryItem = {
  id: string;
  success: boolean;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

// ---- Privacy and consent (BR-15, BR-89) -----------------------------------------------

export type PrivacySettings = {
  is_profile_public: boolean;
  show_designs_publicly: boolean;
  is_searchable: boolean;
  allow_analytics: boolean;
  allow_ads_personalization: boolean;
};

export type ConsentType = "marketing_content" | "academic_report" | "cookie_analytics";

export type ConsentRecord = {
  id: string;
  type: string;
  doc_version: string;
  channel: string;
  created_at: string;
  revoked_at: string | null;
};

// ---- Data import from backup (BR-20) ---------------------------------------------------

export type DataImportStatus = "pending" | "completed" | "rejected";

export type DataImportUpload = {
  import_id: string;
  upload_url: string;
  storage_path: string;
  expires_in: number;
  max_bytes: number;
};

export type DataImportResult = {
  import_id: string;
  status: DataImportStatus;
  projects_imported: number;
  skipped_binary_assets: boolean;
  message: string;
};

export type DataImportHistoryItem = {
  id: string;
  status: DataImportStatus;
  projects_imported: number;
  rejected_reason: string | null;
  file_size_bytes: number | null;
  created_at: string;
  completed_at: string | null;
};

// ---- Content moderation status (BR-77) -------------------------------------------------

export type MyModerationStatus = {
  level: number;
  is_restricted: boolean;
  restricted_until: string | null;
  is_banned: boolean;
};

const json = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export const accountApi = {
  // 2FA
  twoFactorStatus: () => request<TwoFactorStatus>("/api/v1/users/me/2fa"),
  setRecoveryEmail: (recoveryEmail: string) =>
    request<{ message: string }>("/api/v1/users/me/2fa/recovery-email", json({ recovery_email: recoveryEmail })),
  verifyRecoveryEmail: (code: string) =>
    request<{ message: string }>("/api/v1/users/me/2fa/recovery-email/verify", json({ code })),
  setupTwoFactor: (method: TwoFactorMethod) =>
    request<TwoFactorSetup>("/api/v1/users/me/2fa/setup", json({ method })),
  enableTwoFactor: (method: TwoFactorMethod, code: string) =>
    request<{ message: string; recovery_codes: string[] }>("/api/v1/users/me/2fa/enable", json({ method, code })),
  disableTwoFactor: (payload: { password?: string; code?: string }) =>
    request<{ message: string }>("/api/v1/users/me/2fa/disable", json(payload)),

  // Sessions and history
  listSessions: async () => (await request<{ items: SessionInfo[] }>("/api/v1/auth/sessions")).items,
  revokeSession: (sessionId: string) =>
    request<{ message: string }>(`/api/v1/auth/sessions/${sessionId}`, { method: "DELETE" }),
  revokeAllSessions: () => request<{ message: string }>("/api/v1/auth/sessions", { method: "DELETE" }),
  loginHistory: async () =>
    (await request<{ items: LoginHistoryItem[] }>("/api/v1/users/me/login-history")).items,

  // Privacy and consent
  getPrivacy: () => request<PrivacySettings>("/api/v1/users/me/privacy"),
  updatePrivacy: (changes: Partial<PrivacySettings>) =>
    request<PrivacySettings>("/api/v1/users/me/privacy", { method: "PATCH", body: JSON.stringify(changes) }),
  listConsents: () => request<ConsentRecord[]>("/api/v1/users/me/consents"),
  recordConsent: (type: ConsentType, granted: boolean) =>
    request<ConsentRecord>("/api/v1/users/me/consents", json({ type, granted, doc_version: "1.0" })),

  // Password recovery (no session needed)
  forgotPassword: (email: string) =>
    request<{ message: string }>("/api/v1/auth/forgot-password", json({ email })),
  resetPassword: (email: string, otpCode: string, newPassword: string, confirmPassword: string) =>
    request<{ message: string }>(
      "/api/v1/auth/reset-password",
      json({ email, otp_code: otpCode, new_password: newPassword, confirm_password: confirmPassword }),
    ),

  // Data lifecycle
  requestDataExport: () =>
    request<{ download_url: string; expires_in: number }>("/api/v1/users/me/data-export", { method: "POST" }),
  deleteAccount: (password: string) =>
    request<{ message: string }>("/api/v1/users/me", { method: "DELETE", body: JSON.stringify({ password }) }),
  requestAccountRestore: (email: string) =>
    request<{ message: string }>("/api/v1/auth/restore-account/request", json({ email })),
  confirmAccountRestore: (email: string, otpCode: string) =>
    request<{ message: string }>("/api/v1/auth/restore-account/confirm", json({ email, otp_code: otpCode })),

  // Data import from a KusShoes backup (BR-20)
  requestDataImportUpload: () =>
    request<DataImportUpload>("/api/v1/users/me/data-import/upload-url", { method: "POST" }),
  confirmDataImport: (importId: string) =>
    request<DataImportResult>(`/api/v1/users/me/data-import/${importId}/confirm`, { method: "POST" }),
  listDataImports: () => request<DataImportHistoryItem[]>("/api/v1/users/me/data-imports"),

  // Content moderation status (BR-77)
  myModerationStatus: () => request<MyModerationStatus>("/api/v1/moderation/me"),
};
