import { ApiError, api } from "./client";

// ---- Public artisan viewer (BR-101): unauthenticated, no cookies, no session token ----

export type ArtisanPublicView = {
  project_id: string;
  project_name: string;
  format: string;
  expires_at: string;
  downloads_remaining: number;
};

export type ArtisanDownloadResponse = {
  download_url: string;
  expires_in_seconds: number;
};

export type ContentReportReason = "copyright" | "trademark" | "inappropriate" | "other";

export type ContentReportPayload = {
  project_id: string;
  reason: ContentReportReason;
  details: string;
  reporter_email?: string;
  reporter_name?: string;
  evidence_url?: string;
};

export type ContentReportAccepted = {
  report_id: string;
  status: string;
};

/** Bare fetch, deliberately without credentials or an Authorization header: this is public data. */
async function publicRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${api.baseUrl}${path}`, {
    ...options,
    credentials: "omit",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    let message = response.statusText;
    let code: string | null = null;
    let data: Record<string, unknown> = {};
    try {
      data = (await response.json()) as Record<string, unknown>;
      if (typeof data.message === "string") message = data.message;
      if (typeof data.code === "string") code = data.code;
    } catch {
      // no JSON body
    }
    throw new ApiError(message || `Request failed (${response.status})`, response.status, code, data);
  }

  return response.json() as Promise<T>;
}

export const artisanPublicApi = {
  view: (token: string) => publicRequest<ArtisanPublicView>(`/api/v1/public/artisan/${encodeURIComponent(token)}`),
  download: (token: string) =>
    publicRequest<ArtisanDownloadResponse>(`/api/v1/public/artisan/${encodeURIComponent(token)}/download`, {
      method: "POST",
    }),
  reportContent: (payload: ContentReportPayload) =>
    publicRequest<ContentReportAccepted>("/api/v1/public/content-reports", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
