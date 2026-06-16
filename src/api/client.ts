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

function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;) ?kusshoes_csrf_token=([^;]*)(?:;|$)/);
  return match ? match[1] : null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.method && ["POST", "PUT", "PATCH", "DELETE"].includes(options.method.toUpperCase())) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(await errorMessage(response), response.status);
  }

  return response.json() as Promise<T>;
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    return typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload.detail);
  } catch {
    return response.statusText;
  }
}

// Note: We no longer store tokens in localStorage per editor-integration-guide.md
// Cookies are automatically handled by the browser.

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
    // We can't strictly check HTTP-only cookies, so we assume true and let api.me() verify
    // or check if csrf cookie is present
    return Boolean(getCsrfToken());
  },

  async logout(): Promise<void> {
    try {
      await request("/api/auth/logout", { method: "POST" });
    } catch (e) {
      // ignore
    }
  },

  async register(name: string, email: string, password: string): Promise<User> {
    const payload = await request<{ accessToken: string; user: User }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });
    return payload.user;
  },

  async login(email: string, password: string): Promise<User> {
    const payload = await request<{ accessToken: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    return payload.user;
  },

  async demoLogin(): Promise<User> {
    const payload = await request<{ accessToken: string; user: User }>("/api/auth/demo-login", {
      method: "POST",
    });
    return payload.user;
  },

  async createProject(payload: { name: string; sourceType?: string; templateId?: string | null }): Promise<{ id: string; name: string }> {
    return request<{ id: string; name: string }>("/api/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async me(): Promise<User> {
    return request<User>("/api/auth/me");
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
