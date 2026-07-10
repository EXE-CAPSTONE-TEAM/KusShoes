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
} from "../types";
import { toast as notifyToast } from "../context/ToastContext";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? `http://${window.location.hostname}:8000`;
const STORAGE_PUBLIC_URL = import.meta.env.VITE_STORAGE_PUBLIC_URL ?? `http://${window.location.hostname}:9000/kusshoes`;
const LEGACY_ACCESS_TOKEN_KEY = "kusshoes_access_token";
const LEGACY_REFRESH_TOKEN_KEY = "kusshoes_refresh_token";
let accessTokenInMemory: string | null = null;

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
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

type AuthTokens = {
  access_token: string;
  token_type: string;
};

export type RegisterInput = {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
  fullName: string;
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
  status: "Scanned" | "Designing" | "Completed";
  rawStatus: string;
  visibility: "Private" | "Link" | "Public";
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
  thumbnail_path: string | null;
  editor_url: string;
  created_at: string;
  updated_at: string;
};

export type ProjectPage = {
  items: PortalProject[];
  nextCursor: string | null;
  hasNext: boolean;
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
  plan_tier: string;
  billing_cycle: string;
  amount_vnd: number;
  payment_method: string;
  status: string;
  paid_at: string | null;
  created_at: string;
};

export type ProjectExport = {
  id: string;
  format: string;
  file_size_bytes: number | null;
  download_count: number;
  created_at: string;
};

export type DesktopLaunch = {
  ssoToken: string;
  expiresIn: number;
  apiBaseUrl: string;
};

const fallbackProjectImage = new URL("../assets/sneaker-hero.png", import.meta.url).href;

function toPortalProject(project: ProjectResponse): PortalProject {
  const normalizedStatus = project.status.toLowerCase();
  const status: PortalProject["status"] = ["completed", "ready", "exported"].includes(normalizedStatus)
    ? "Completed"
    : ["in_progress", "processing", "queued", "baking"].includes(normalizedStatus)
      ? "Designing"
      : "Scanned";

  return {
    id: project.id,
    name: project.name,
    baseModel: "Custom sneaker model",
    status,
    rawStatus: project.status,
    visibility: "Private",
    updatedAt: project.updated_at,
    createdAt: project.created_at,
    imageUrl: fallbackProjectImage,
    editorUrl: project.editor_url,
    device: "KusStudio",
    fileSize: "—",
    photosCount: 0,
    verticesCount: "—",
    colorCode: "#FF5A36",
    description: project.description ?? "",
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
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
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
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/verify-otp",
    "/api/v1/auth/refresh",
  ].includes(path);
}

function notifyApiError(error: ApiError, path: string): void {
  if (responseIsAuthNoise(path)) return;
  if (error.status >= 500) {
    notifyToast.error("Server error. Please try again later.");
    return;
  }
  if (error.status === 401) {
    notifyToast.error("Session expired. Please sign in again.");
    return;
  }
  if (error.status >= 400) {
    notifyToast.error(error.message || "Request failed. Please check your input.");
  }
}

function responseIsAuthNoise(path: string): boolean {
  return [
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/verify-otp",
    "/api/v1/auth/resend-otp",
  ].includes(path);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const accessToken = accessTokenInMemory;
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  if (options.method && ["POST", "PUT", "PATCH", "DELETE"].includes(options.method.toUpperCase())) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }
  }

  let response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  if (response.status === 401 && canRefreshRequest(path)) {
    const refreshedAccessToken = await refreshAccessToken();
    if (refreshedAccessToken) {
      headers.Authorization = `Bearer ${refreshedAccessToken}`;
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        credentials: "include",
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

async function apiError(response: Response): Promise<ApiError> {
  try {
    const payload = (await response.json()) as Record<string, unknown>;
    const detail = payload.detail;
    let message = typeof payload.message === "string" ? payload.message : response.statusText;
    if (typeof detail === "string") {
      message = detail;
    } else if (Array.isArray(detail)) {
      message = detail
        .map((item) => {
          if (typeof item !== "object" || item === null) return String(item);
          const validationError = item as { msg?: string };
          return validationError.msg ?? JSON.stringify(item);
        })
        .join("; ");
    }
    return new ApiError(
      message || `Request failed (${response.status})`,
      response.status,
      typeof payload.code === "string" ? payload.code : null,
      payload,
    );
  } catch {
    return new ApiError(response.statusText || "Unable to connect to the server", response.status);
  }
}

async function throwApiResponseError(response: Response, path: string): Promise<never> {
  const error = await apiError(response);
  notifyApiError(error, path);
  throw error;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
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

  async logout(): Promise<void> {
    try {
      await request("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // Local logout must still succeed when the API/token is unavailable.
    } finally {
      clearTokens();
    }
  },

  async register(input: RegisterInput): Promise<RegisterResult> {
    const payload = await request<{ user_id: string; email: string; message: string }>("/api/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        username: input.username,
        password: input.password,
        confirm_password: input.confirmPassword,
        full_name: input.fullName,
      }),
    });
    return { userId: payload.user_id, email: payload.email, message: payload.message };
  },

  async login(email: string, password: string, remember = true): Promise<void> {
    const tokens = await request<AuthTokens>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    saveTokens(tokens, remember);
  },

  async verifyOtp(userId: string, otpCode: string, remember = true): Promise<void> {
    const tokens = await request<AuthTokens>("/api/v1/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, otp_code: otpCode }),
    });
    saveTokens(tokens, remember);
  },

  async resendOtp(userId: string): Promise<{ message: string; resendRemaining: number }> {
    const payload = await request<{ message: string; resend_remaining: number }>("/api/v1/auth/resend-otp", {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    });
    return { message: payload.message, resendRemaining: payload.resend_remaining };
  },

  async listProjects(cursor?: string | null): Promise<ProjectPage> {
    const params = new URLSearchParams({ limit: "100" });
    if (cursor) params.set("cursor", cursor);
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

  async createDesktopLaunch(projectId: string): Promise<DesktopLaunch> {
    const payload = await request<{ sso_token: string; expires_in: number }>("/api/v1/auth/sso-token", {
      method: "POST",
      body: JSON.stringify({ project_id: projectId }),
    });
    return {
      ssoToken: payload.sso_token,
      expiresIn: payload.expires_in,
      apiBaseUrl: API_BASE_URL,
    };
  },

  async createProject(payload: { name: string; description?: string | null }): Promise<PortalProject> {
    const project = await request<ProjectResponse>("/api/v1/projects", {
      method: "POST",
      body: JSON.stringify({ name: payload.name, description: payload.description ?? null }),
    });
    return toPortalProject(project);
  },

  async updateProject(
    projectId: string,
    payload: { name?: string; description?: string | null },
  ): Promise<PortalProject> {
    const project = await request<ProjectResponse>(`/api/v1/projects/${projectId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return toPortalProject(project);
  },

  async deleteProject(projectId: string): Promise<void> {
    await request<{ message: string }>(`/api/v1/projects/${projectId}`, { method: "DELETE" });
  },

  async me(): Promise<User> {
    const profile = await this.profile();
    return {
      id: profile.id,
      role: "user",
      name: `${profile.first_name} ${profile.last_name}`.trim(),
      email: profile.email,
      createdAt: profile.member_since,
    };
  },

  async profile(): Promise<UserProfile> {
    return request<UserProfile>("/api/v1/users/me");
  },

  async updateProfile(payload: {
    first_name?: string;
    last_name?: string;
    username?: string;
    avatar_path?: string | null;
    phone_number?: string | null;
    bio?: string | null;
    language?: "vi" | "en";
    preferred_styles?: string[];
  }): Promise<UserProfile> {
    return request<UserProfile>("/api/v1/users/me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  avatarUrl(path: string | null): string | undefined {
    if (!path) return undefined;
    return `${STORAGE_PUBLIC_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  },

  async uploadAvatar(file: File): Promise<UserProfile> {
    const upload = await request<{ upload_url: string; file_path: string }>("/api/v1/users/me/avatar", {
      method: "POST",
      body: JSON.stringify({ filename: file.name, content_type: file.type }),
    });
    const response = await fetch(upload.upload_url, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!response.ok) throw new ApiError("Unable to upload avatar.", response.status);
    return this.updateProfile({ avatar_path: upload.file_path });
  },

  async changePassword(payload: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }): Promise<string> {
    const result = await request<{ message: string }>("/api/v1/users/me/password", {
      method: "PUT",
      body: JSON.stringify({
        current_password: payload.currentPassword,
        new_password: payload.newPassword,
        confirm_password: payload.confirmPassword,
      }),
    });
    return result.message;
  },

  async usage(): Promise<Usage> {
    return request<Usage>("/api/v1/users/me/usage");
  },

  async listPlans(): Promise<Plan[]> {
    return request<Plan[]>("/api/v1/plans");
  },

  async subscription(): Promise<Subscription> {
    return request<Subscription>("/api/v1/subscription");
  },

  async listInvoices(): Promise<Invoice[]> {
    return request<Invoice[]>("/api/v1/subscription/invoices?limit=100");
  },

  async createCheckout(tier: string, billingCycle: string): Promise<string> {
    const result = await request<{ checkout_url: string }>("/api/v1/subscription/checkout", {
      method: "POST",
      body: JSON.stringify({ tier, billing_cycle: billingCycle }),
    });
    return result.checkout_url;
  },

  async changePlan(tier: string, billingCycle: string): Promise<void> {
    await request<{ status: string }>("/api/v1/subscription/change-plan", {
      method: "POST",
      body: JSON.stringify({ tier, billing_cycle: billingCycle }),
    });
  },

  async cancelSubscription(immediate = false): Promise<void> {
    await request<{ status: string }>("/api/v1/subscription/cancel", {
      method: "POST",
      body: JSON.stringify({ immediate }),
    });
  },

  async billingPortal(): Promise<string> {
    const result = await request<{ portal_url: string }>("/api/v1/subscription/portal", {
      method: "POST",
    });
    return result.portal_url;
  },

  async listProjectExports(projectId: string): Promise<ProjectExport[]> {
    const result = await request<{ items: ProjectExport[] }>(`/api/v1/projects/${projectId}/exports`);
    return result.items;
  },

  async createExportDownloadUrl(exportId: string): Promise<string> {
    const result = await request<{ download_url: string }>(`/api/v1/exports/${exportId}/download-url`, {
      method: "POST",
    });
    return result.download_url;
  },

  async getReconstructionReadiness(): Promise<ReconstructionReadiness> {
    return request<ReconstructionReadiness>("/api/system/reconstruction-readiness");
  },

  async getScanSession(scanSessionId: string): Promise<ScanSession> {
    return request<ScanSession>(`/api/scan-sessions/${scanSessionId}`);
  },

  async getModelAsset(modelAssetId: string): Promise<ModelAsset> {
    return request<ModelAsset>(`/api/models/${modelAssetId}`);
  },

  async importModel(payload: ModelImportPayload): Promise<ModelImportResponse> {
    const form = new FormData();
    form.append("name", payload.name);
    form.append("format", payload.format);
    form.append("metadata", JSON.stringify(payload.metadata));
    if (payload.model) {
      form.append("model", payload.model);
    }
    if (payload.mtl) {
      form.append("mtl", payload.mtl);
    }
    if (payload.texture) {
      form.append("texture", payload.texture);
    }
    if (payload.package) {
      form.append("package", payload.package);
    }

    const response = await fetch(`${API_BASE_URL}/api/models/import`, {
      method: "POST",
      credentials: "include",
      headers: {
        "X-CSRF-Token": getCsrfToken() || "",
      },
      body: form,
    });
    if (!response.ok) {
      await throwApiResponseError(response, "/api/models/import");
    }
    return response.json() as Promise<ModelImportResponse>;
  },

  async uploadDesignAsset(file: File, sourceType: DesignAssetSource): Promise<DesignAsset> {
    const form = new FormData();
    form.append("file", file);
    form.append("sourceType", sourceType);

    const response = await fetch(`${API_BASE_URL}/api/design-assets`, {
      method: "POST",
      credentials: "include",
      headers: {
        "X-CSRF-Token": getCsrfToken() || "",
      },
      body: form,
    });
    if (!response.ok) {
      await throwApiResponseError(response, "/api/design-assets");
    }
    return response.json() as Promise<DesignAsset>;
  },

  async fetchDesignAssetBlobUrl(assetId: string): Promise<string> {
    const path = `/api/design-assets/${assetId}/download`;
    const response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
    });
    if (!response.ok) {
      await throwApiResponseError(response, path);
    }
    return URL.createObjectURL(await response.blob());
  },

  async fetchModelBlobUrl(modelAsset: ModelAsset): Promise<string> {
    const response = await fetch(`${API_BASE_URL}${modelAsset.glbUrl}`, {
      credentials: "include",
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
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) {
      await throwApiResponseError(response, design.previewGlbUrl);
    }
    return URL.createObjectURL(await response.blob());
  },

  async createDesign(modelAssetId: string, name: string, config: DesignConfig): Promise<Design> {
    return request<Design>("/api/designs", {
      method: "POST",
      body: JSON.stringify({ modelAssetId, name, config }),
    });
  },

  async getDesign(designId: string): Promise<Design> {
    return request<Design>(`/api/designs/${designId}`);
  },

  async updateDesign(designId: string, name: string, config: DesignConfig): Promise<Design> {
    return request<Design>(`/api/designs/${designId}`, {
      method: "PUT",
      body: JSON.stringify({ name, config }),
    });
  },

  async exportDesign(designId: string): Promise<ExportPackage> {
    return request<ExportPackage>(`/api/designs/${designId}/export`, {
      method: "POST",
    });
  },

  async downloadExport(exportPackage: ExportPackage): Promise<void> {
    const response = await fetch(`${API_BASE_URL}${exportPackage.downloadUrl}`, {
      credentials: "include",
    });
    if (!response.ok) {
      await throwApiResponseError(response, exportPackage.downloadUrl);
    }

    downloadBlob(await response.blob(), `${exportPackage.id}.zip`);
  },

  async downloadModelFile(urlPath: string, filename: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}${urlPath}`, {
      credentials: "include",
    });
    if (!response.ok) {
      await throwApiResponseError(response, urlPath);
    }

    downloadBlob(await response.blob(), filename);
  },
};

export type ModelImportPayload = {
  name: string;
  format: "glb" | "obj";
  metadata: ScanMetadata;
  model?: File | null;
  mtl?: File | null;
  texture?: File | null;
  package?: File | null;
};

export function designStorageKey(modelAssetId: string): string {
  return `shoe-customizer-design-${modelAssetId}`;
}
