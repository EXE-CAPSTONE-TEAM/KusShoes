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

// ---- Project assets / source 3D model import (C3) -------------------------------------

export type ProjectAssetType = "source_model" | "sticker" | "texture" | "reference_image";

export type ProjectAsset = {
  id: string;
  project_id: string;
  asset_type: string;
  original_filename: string | null;
  file_path: string;
  file_size_bytes: number | null;
  mime_type: string | null;
  status: string;
  created_at: string;
};

export type AssetUploadUrl = {
  upload_url: string;
  asset_id: string;
  file_path: string;
  expires_in: number;
};

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

  listAssets: (projectId: string) =>
    request<{ items: ProjectAsset[] }>(`/api/v1/projects/${projectId}/assets`).then((page) => page.items),
  createAssetUploadUrl: (
    projectId: string,
    payload: { asset_type: ProjectAssetType; filename: string; content_type: string },
  ) =>
    request<AssetUploadUrl>(`/api/v1/projects/${projectId}/assets/upload-url`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  confirmAssetUpload: (projectId: string, payload: { asset_id: string; file_size_bytes?: number }) =>
    request<ProjectAsset>(`/api/v1/projects/${projectId}/assets/confirm`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteAsset: (projectId: string, assetId: string) =>
    request<{ message: string }>(`/api/v1/projects/${projectId}/assets/${assetId}`, { method: "DELETE" }),

  /** Uploads straight to the presigned storage URL: no auth header, no cookies sent. */
  async putAssetFile(uploadUrl: string, file: File, contentType: string): Promise<void> {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      credentials: "omit",
      headers: { "Content-Type": contentType },
      body: file,
    });
    if (!response.ok) {
      throw new Error(`Unable to upload the file to storage (status ${response.status}).`);
    }
  },
};
