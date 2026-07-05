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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? `http://${window.location.hostname}:8000`;
const ACCESS_TOKEN_KEY = "kusshoes_access_token";
const REFRESH_TOKEN_KEY = "kusshoes_refresh_token";

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
  refresh_token: string;
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

function getStoredToken(key: string): string | null {
  return sessionStorage.getItem(key) ?? localStorage.getItem(key);
}

function saveTokens(tokens: AuthTokens, remember: boolean): void {
  clearTokens();
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
  storage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
}

function clearTokens(): void {
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem(ACCESS_TOKEN_KEY);
    storage.removeItem(REFRESH_TOKEN_KEY);
  }
}

function replaceAccessToken(accessToken: string): void {
  const storage = sessionStorage.getItem(REFRESH_TOKEN_KEY) ? sessionStorage : localStorage;
  storage.setItem(ACCESS_TOKEN_KEY, accessToken);
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = getStoredToken(REFRESH_TOKEN_KEY);
    if (!refreshToken) return null;

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const accessToken = getStoredToken(ACCESS_TOKEN_KEY);
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
    throw await apiError(response);
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

async function errorMessage(response: Response): Promise<string> {
  return (await apiError(response)).message;
}

// This backend exposes bearer tokens. "Remember me" chooses localStorage;
// otherwise tokens live only for the current browser tab/session.

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
    return Boolean(getStoredToken(ACCESS_TOKEN_KEY));
  },

  async logout(): Promise<void> {
    const refreshToken = getStoredToken(REFRESH_TOKEN_KEY);
    try {
      if (refreshToken) {
        await request("/api/v1/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      }
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

  async createProject(payload: { name: string; sourceType?: string; templateId?: string | null }): Promise<{ id: string; name: string }> {
    return request<{ id: string; name: string }>("/api/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async me(): Promise<User> {
    const profile = await request<{
      id: string;
      email: string;
      first_name: string;
      last_name: string;
      member_since: string;
    }>("/api/v1/users/me");
    return {
      id: profile.id,
      role: "user",
      name: `${profile.first_name} ${profile.last_name}`.trim(),
      email: profile.email,
      createdAt: profile.member_since,
    };
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
      throw new ApiError(await errorMessage(response), response.status);
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
      throw new ApiError(await errorMessage(response), response.status);
    }
    return response.json() as Promise<DesignAsset>;
  },

  async fetchDesignAssetBlobUrl(assetId: string): Promise<string> {
    const response = await fetch(`${API_BASE_URL}/api/design-assets/${assetId}/download`, {
      credentials: "include",
    });
    if (!response.ok) {
      throw new ApiError(await errorMessage(response), response.status);
    }
    return URL.createObjectURL(await response.blob());
  },

  async fetchModelBlobUrl(modelAsset: ModelAsset): Promise<string> {
    const response = await fetch(`${API_BASE_URL}${modelAsset.glbUrl}`, {
      credentials: "include",
    });
    if (!response.ok) {
      throw new ApiError(await errorMessage(response), response.status);
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
      throw new ApiError(await errorMessage(response), response.status);
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
      throw new ApiError(await errorMessage(response), response.status);
    }

    downloadBlob(await response.blob(), `${exportPackage.id}.zip`);
  },

  async downloadModelFile(urlPath: string, filename: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}${urlPath}`, {
      credentials: "include",
    });
    if (!response.ok) {
      throw new ApiError(await errorMessage(response), response.status);
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
