import { downloadBlob, request, requestBlob } from "./client";

// ---- Design version history (BR-46) ---------------------------------------------------

export type DesignVersion = {
  id: string;
  version_no: number;
  is_pinned: boolean;
  export_bake_job_id: string | null;
  thumbnail_path: string | null;
  created_at: string;
};

// ---- Template gallery -----------------------------------------------------------------

export type DesignTemplate = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  thumbnail_path: string | null;
  layer_count: number;
  use_count: number;
};

// ---- Artisan share links (BR-101) -----------------------------------------------------

export type ArtisanLink = {
  id: string;
  project_id: string;
  export_record_id: string;
  expires_at: string;
  max_downloads: number;
  download_count: number;
  revoked_at: string | null;
  is_active: boolean;
};

/** Returned once, at creation: the raw token is never stored server-side. */
export type CreatedArtisanLink = ArtisanLink & { token: string; url: string };

// ---- Feedback (UC-25, BR-109) ---------------------------------------------------------

export type MarketingGroup = "product" | "price" | "place" | "promotion";

export type Feedback = {
  id: string;
  rating: number;
  marketing_group: MarketingGroup;
  message: string;
  status: string;
  changed_what: string | null;
  created_at: string;
};

export type FeedbackEligibility = {
  can_submit: boolean;
  next_allowed_at: string | null;
};

export const studioApi = {
  listVersions: (projectId: string) => request<DesignVersion[]>(`/api/v1/projects/${projectId}/versions`),
  restoreVersion: (projectId: string, versionId: string) =>
    request<DesignVersion>(`/api/v1/projects/${projectId}/versions/${versionId}/restore`, { method: "POST" }),

  listTemplates: (category?: string) =>
    request<DesignTemplate[]>(`/api/v1/templates${category ? `?category=${encodeURIComponent(category)}` : ""}`),
  applyTemplate: (projectId: string, templateId: string) =>
    request<{ message: string }>(`/api/v1/projects/${projectId}/apply-template/${templateId}`, { method: "POST" }),

  listArtisanLinks: (projectId: string) =>
    request<ArtisanLink[]>(`/api/v1/projects/${projectId}/artisan-links`),
  createArtisanLink: (projectId: string, exportId?: string) =>
    request<CreatedArtisanLink>(`/api/v1/projects/${projectId}/artisan-links`, {
      method: "POST",
      body: JSON.stringify({ export_id: exportId ?? null }),
    }),
  revokeArtisanLink: (linkId: string) =>
    request<{ message: string }>(`/api/v1/artisan-links/${linkId}/revoke`, { method: "POST" }),
  renewArtisanLink: (linkId: string) => request<ArtisanLink>(`/api/v1/artisan-links/${linkId}/renew`, { method: "POST" }),

  /** PDF for the craftsperson; passing a fresh link token prints a QR code that opens it (BR-71). */
  async downloadReferencePack(projectId: string, token?: string): Promise<void> {
    const query = token ? `?token=${encodeURIComponent(token)}` : "";
    const { blob, filename } = await requestBlob(`/api/v1/projects/${projectId}/reference-pack${query}`);
    downloadBlob(blob, filename ?? `reference-pack-${projectId}.pdf`);
  },

  eligibility: () => request<FeedbackEligibility>("/api/v1/feedback/eligibility"),
  submitFeedback: (payload: { rating: number; message: string; marketing_group: MarketingGroup }) =>
    request<Feedback>("/api/v1/feedback", { method: "POST", body: JSON.stringify(payload) }),
  myFeedback: () => request<Feedback[]>("/api/v1/feedback/mine"),
};
