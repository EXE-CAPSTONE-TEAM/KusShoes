# API Contract — Backend **KusShoes** (`KusShoes/BE`)

> **Đây là backend của dự án KusShoes** (control plane: auth, project, design, asset, job, billing —
> database duy nhất của hệ thống). **Không phải** backend của `ar-ai-exe`; contract của backend đó ở
> `ar-ai-exe/docs/api-contract.md`.

| | |
|---|---|
| Code | `KusShoes/BE/app` (FastAPI) — router mount ở `app/main.py` |
| Đối chiếu | 189 operation trong OpenAPI sinh từ code ngày 2026-09-27 (125 user/editor/mobile/internal + 64 admin) |
| Schema đầy đủ từng field | `docs/API_REFERENCE.md` (sinh bằng `cd BE && python -m scripts.export_api_docs`), `/docs`, `/openapi.json` (tắt ở production) |
| Base URL | dev `http://127.0.0.1:8000` · VM hiện tại `https://136.85.55.175.sslip.io` (mặc định của mobile) · web đặt qua `VITE_API_BASE_URL` |
| Tiền tố | mọi route nghiệp vụ nằm dưới `/api/v1`; ngoài ra `/health`, `/health/ready`, `/metrics` |

File này là **contract tích hợp**: ai gọi route nào, bằng credential gì, theo thứ tự nào.
Khi thêm/sửa route, cập nhật cả file này lẫn `API_REFERENCE.md` (chạy lại script).

---

## 0. Quy ước chung

### 0.1 Credential

| Loại | Header | Ai cầm | Cấp bởi | Sống |
|---|---|---|---|---|
| User access token | `Authorization: Bearer <jwt>` | Web FE, Mobile | `/auth/login`, `/auth/2fa/verify`, `/auth/refresh`, `/auth/google/mobile/exchange` | ngắn; web đổi bằng `/auth/refresh` (refresh token trong cookie HttpOnly, `credentials: 'include'`) |
| Editor session token | `Authorization: Bearer <jwt>` (aud `kusshoes-editor`) | KusStudio (desktop/web editor) | `/auth/editor/launch/exchange` | 15 phút (`EDITOR_ACCESS_TOKEN_EXPIRE_MINUTES`), **không có refresh**, gắn đúng 1 project, scope `editor:read` / `editor:write` |
| Claim token | `X-Claim-Token: <token>` | KusStudio desktop, sau khi claim job | `/editor/jobs/{id}/claim` | bằng lease `CLAIM_LEASE_SECONDS` = 3600 s; chỉ dùng cho `complete` / `fail` |
| Service token | `X-Service-Token: <SERVICE_TOKEN>` | dịch vụ nội bộ | env `SERVICE_TOKEN` | cố định |
| Mobile compute token | `X-Service-Token: <MOBILE_COMPUTE_SERVICE_TOKEN>` | ar-ai-exe relay | env `MOBILE_COMPUTE_SERVICE_TOKEN` | cố định |
| Admin token | `Authorization: Bearer <jwt>` | trang `/admin` của web | `/admin/auth/login` | role `admin` được ghi, `staff` chỉ đọc |

### 0.2 Định dạng

- **Lỗi nghiệp vụ:** `{"code": "MA_LOI", "message": "..."}` (+ field phụ như `retry_after`). Lỗi validate
  (422) theo FastAPI: `{"detail": [...]}`.
  *Khác backend ar-ai-exe* (`{"error": {"code", "message", "details"}}`) — client gọi cả hai phải parse cả hai.
- **Kiểu chữ của field:** route người dùng `/api/v1/*` dùng **snake_case**; route editor
  `/api/v1/editor/*` dùng **camelCase** (trừ `assets/upload-url` và `assets/confirm` dùng snake_case).
- Phân trang con trỏ: `cursor`, `limit` → `next_cursor`, `has_next`. Thời gian ISO 8601 có múi giờ. Tiền VND số nguyên.
- File lớn **không bao giờ đi qua API**: server chỉ cấp presigned URL (`SIGNED_URL_TTL_SECONDS` = 900 s),
  client PUT/GET thẳng object storage, **không** gửi header `Authorization` và dùng `credentials: "omit"`.

### 0.3 Ai gọi phần nào

| Client | Repo | Nhóm route dùng | Mục |
|---|---|---|---|
| Web app | `KusShoes/FE` | auth, users, projects, assets, studio, exports, subscription, feedback, moderation, public artisan, admin | §1 |
| KusStudio editor (desktop Tauri + web editor) | `ar-ai-exe/frontend`, `ar-ai-exe/desktop` | `/auth/editor/launch/*`, `/editor/*` | §2 |
| Mobile app | `ar-ai-exe/mobile` | auth, users, projects, templates, exports, subscription, feedback, `/mobile/scans/bootstrap` | §3 |
| KIRI relay | `ar-ai-exe/backend` (`APP_ROLE=relay`) | `/internal/mobile/*`, `/internal/api-cost/calls` | §4 |
| Cổng thanh toán | PayOS, MoMo | `/webhooks/payos`, `/webhooks/momo` | §4 |

---

## 1. Web app `KusShoes/FE` → KusShoes BE

Client: `FE/src/api/{client,account,billing,studio}.ts`. Base URL `VITE_API_BASE_URL`.

### 1.1 Route web đang gọi (đã đối chiếu code FE)

| Nhóm | Route |
|---|---|
| Auth | `POST /auth/register`, `/verify-otp`, `/resend-otp`, `/login`, `/2fa/verify`, `/refresh`, `/logout`, `/forgot-password`, `/reset-password`, `/restore-account/request`, `/restore-account/confirm` · `GET /auth/google` (điều hướng cả trang) · `GET/DELETE /auth/sessions`, `DELETE /auth/sessions/{id}` |
| Mở desktop | `POST /auth/editor/launch` — xem §1.2 |
| Users | `GET/PATCH/DELETE /users/me`, `POST/DELETE /users/me/avatar`, `PUT /users/me/password`, `GET /users/me/usage`, `GET/PATCH /users/me/privacy`, `GET/POST /users/me/consents`, `GET /users/me/login-history`, `POST /users/me/data-export`, `POST /users/me/data-import/upload-url`, `POST /users/me/data-import/{id}/confirm`, `GET /users/me/data-imports`, `/users/me/2fa*`, `POST /users/me/impersonation/end` |
| Projects | `GET/POST /projects`, `GET /projects/trash`, `GET/PATCH/DELETE /projects/{id}`, `POST /projects/{id}/restore`, `DELETE /projects/{id}/permanent`, `GET /projects/{id}/exports`, `GET /projects/{id}/watermark-policy` |
| Assets | `POST /projects/{id}/assets/upload-url` → PUT presigned → `POST /projects/{id}/assets/confirm`; `GET /projects/{id}/assets`; `DELETE /projects/{id}/assets/{asset_id}` |
| Studio | `GET /projects/{id}/versions`, `POST …/versions/{vid}/restore`, `GET /templates`, `POST /projects/{id}/apply-template/{tid}`, `GET/POST /projects/{id}/artisan-links`, `POST /artisan-links/{id}/revoke|renew`, `GET /projects/{id}/reference-pack` |
| Public | `GET /public/artisan/{token}`, `POST /public/artisan/{token}/download`, `POST /public/content-reports` |
| Exports | `POST /exports/{id}/download-url` |
| Billing | `GET /plans`, `GET /subscription`, `POST /subscription/checkout|cancel`, `POST /subscription/coupon/preview`, `GET /subscription/invoices`, `GET …/invoices/{id}/receipt`, `GET /subscription/credits`, `GET …/credits/ledger`, `POST …/credits/checkout` |
| Khác | `GET /feedback/eligibility`, `POST /feedback`, `GET /feedback/mine`, `GET /moderation/me` |
| Admin | 64 route dưới `/api/v1/admin/*` — xem `API_REFERENCE.md` |

Route user có trong BE nhưng web **chưa gọi**: `GET /projects/{id}/preview-image`, `GET /exports`,
`GET /subscription/invoices/{id}`, `GET /projects/{id}/versions/{vid}`.

### 1.2 Web mở KusStudio Desktop

```
Web (user Bearer)                KusShoes BE                         OS / Tauri
 │ POST /api/v1/auth/editor/launch {project_id}
 │ ─────────────────────────────►│
 │ ◄──── {launch_ticket, desktop_url, expires_in: 60}
 │ window.location.assign(desktop_url)   ── kusshoes-editor://launch?ticket=<launch_ticket> ──► KusStudio
```

| | |
|---|---|
| Request | `{ "project_id": "<uuid>" }` |
| Response 200 | `{ "launch_ticket": str, "desktop_url": "kusshoes-editor://launch?ticket=…", "expires_in": 60 }` |
| Lỗi | 401 chưa đăng nhập · 403 không sở hữu project |
| Ràng buộc | vé dùng một lần, sống `EDITOR_LAUNCH_TICKET_EXPIRE_SECONDS` = 60 s. Scheme = `EDITOR_DESKTOP_URL_SCHEME` (mặc định `kusshoes-editor`) **phải trùng** `desktop/src-tauri/tauri.conf.json → plugins.deep-link.desktop.schemes`. Máy chưa cài KusStudio thì deep link không mở được gì — web nên có fallback "Tải KusStudio". |

Phía desktop tiếp tục ở §2.1.

---

## 2. KusStudio (`ar-ai-exe/frontend` + `ar-ai-exe/desktop`) → KusShoes BE

Client: `frontend/src/api/editorLaunch.ts` (PKCE), `frontend/src/api/editorClient.ts` (editor + job).
Base URL `VITE_KUSSHOES_API_BASE_URL`.

### 2.1 Đổi launch ticket lấy editor session (PKCE S256)

| Bước | Route | Request | Response 200 |
|---|---|---|---|
| 1 | `POST /api/v1/auth/editor/launch/claim` (không auth) | `{ launch_ticket, code_challenge, code_challenge_method: "S256" }` | `{ authorization_code, expires_in }` (60 s) |
| 2 | `POST /api/v1/auth/editor/launch/exchange` (không auth) | `{ authorization_code, code_verifier }` | `{ access_token, token_type: "bearer", expires_in, user_id, project_id, scopes[] }` |
| 3 | `GET /api/v1/auth/editor/session` (editor Bearer) | — | `{ user_id, project_id, scopes[], expires_at }` |

Ticket/code dùng lại, hết hạn, hoặc verifier sai → 401 `AUTH_EDITOR_LAUNCH_INVALID`.
Token hết hạn sau 15 phút → user phải mở lại từ web (không có refresh).

> Legacy còn trong code: `POST /auth/sso-token`, `POST /auth/verify-sso` (X-Service-Token),
> `POST /auth/desktop-session`. Client hiện tại **không** dùng; không xây tính năng mới trên chúng.

### 2.2 Route editor (`/api/v1/editor`, editor Bearer, camelCase)

| Route | Scope | Request → Response |
|---|---|---|
| `GET /me` | read | → `{ id, role, name, email, createdAt, updatedAt? }` |
| `GET /projects/{project_id}/context` | read | → `{ project, modelAsset?, latestDesign?, permissions{canEdit,canBake,canExport}, modelStatus?: "raw"\|"ready", rawModelAssetId? }` |
| `POST /projects/{project_id}/designs` | write | `{ designConfig{modelAssetId, baseColor, material, stickers[], texts[], camera, metadata}, name?, baseRevision }` → `EditorDesign` (mỗi lần lưu tạo revision mới; lệch `baseRevision` → 409) |
| `GET /designs/{design_id}` | read | → `EditorDesign` |
| `POST /projects/{project_id}/prepare` | write | `{ cropBox{center{x,y,z}, size{x,y,z}, rotation?{x,y,z}, coordinateSpace:"normalized"}, confirmResetDesign?: false }` → 202 `EditorJob` (`type:"prepare"`) |
| `POST /designs/{design_id}/bake` | write | — → 202 `EditorJob` (`type:"bake"`) |
| `GET /jobs/{job_id}` | read | → `EditorJob` |
| `POST /jobs/{job_id}/claim` | write | `{ deviceLabel? ≤100 }` hoặc rỗng → `{ job, claimId, claimToken, leaseExpiresAt, payload }` |
| `POST /jobs/{job_id}/complete` | **`X-Claim-Token`**, không Bearer | `{ outputs:[{format, filePath, fileSizeBytes}], watermarkApplied?: false, cleanupReport? }` → `EditorJob` |
| `POST /jobs/{job_id}/fail` | **`X-Claim-Token`**, không Bearer | `{ code ≤64, message ≤500 }` → `EditorJob` |
| `POST /designs/{design_id}/export` | read | → `{ id, designId, status:"ready", downloadUrl, zipUrl?, files[], createdAt }` |
| `POST /assets/upload-url` | write | `{ asset_type: source_model\|sticker\|texture\|reference_image, filename, content_type }` → `{ upload_url, asset_id, file_path, expires_in }` |
| `POST /assets/confirm` | write | `{ asset_id, file_size_bytes? }` → `Asset` (snake_case) |
| `GET /assets/{asset_id}/content` | read | → `{ url, expiresIn, filename, contentType }` (presigned GET, **JSON, không trả bytes**) |
| `GET /exports/{export_id}/content` | read | → như trên, URL có `Content-Disposition: attachment` |

`EditorJob` = `{ id, type: "bake"|"prepare", status, progress 0–100, errorMessage?, designId, projectId, leaseExpiresAt?, createdAt, updatedAt }`.

**Import model thủ công từ desktop:** `asset_type=source_model` chỉ được khi project chưa có
`canonical_model_asset_id`; đã có → 403 `EDITOR_ASSET_TYPE_FORBIDDEN` (muốn đổi phải làm trên web).

### 2.3 Vòng đời job bake/prepare (chạy trên máy người dùng)

```
awaiting_client ──claim──► claimed ──complete──► completed
      │                      │  └──fail──► failed
      └── bị job mới thay ──► cancelled      (lease hết hạn + 1 lease: sweep hằng giờ → failed)
```

Trình tự client (đúng như `editorClient.ts: runClaimedJob`):

1. `POST /editor/designs/{id}/bake` hoặc `/editor/projects/{id}/prepare` → job `awaiting_client`.
2. `POST /editor/jobs/{id}/claim` → `claimToken` + `payload` (capability presigned).
3. Gửi **nguyên `payload`** tới sidecar local `POST /bake` hoặc `POST /prepare`
   (contract ở `ar-ai-exe/docs/api-contract.md` §3).
4. Sidecar thành công → `POST /editor/jobs/{id}/complete` với `X-Claim-Token`; lỗi → `POST …/fail`.

`payload` của **bake** (snake_case, khớp `BakeWorkerRequest` của sidecar):

```json
{
  "job_id": "uuid", "project_id": "uuid",
  "design_config": { "...": "snapshot lúc tạo job" },
  "formats": ["glb", "obj"],
  "source_model": { "asset_id": "uuid", "download_url": "https://…", "file_size_bytes": 1, "mime_type": "model/gltf-binary" },
  "asset_downloads": [{ "asset_id": "uuid", "download_url": "https://…", "file_size_bytes": 1, "mime_type": "image/png" }],
  "outputs": [{ "format": "glb", "file_path": "staging/{project}/{job}/{claim}/…", "upload_url": "https://…", "content_type": "model/gltf-binary" }],
  "watermark": { "required": false, "text": "…", "opacity_percent": 0 }
}
```

`payload` của **prepare**: `{ job_id, project_id, crop_box, source_model{…}, outputs[{format:"glb", …}] }`.

Kiểm tra khi `complete`: key phải là key đã cấp, object tồn tại, `ContentLength == fileSizeBytes`,
magic bytes (`glTF` cho GLB, `PK\x03\x04` cho OBJ zip). Hợp lệ → server copy staging → key final
(`exports/{project}/{job}/…` hoặc `models/{project}/{job}/prepared.glb`), xoá staging, trừ quota **một lần**.
Gọi `complete` lặp lại với cùng token → trả lại kết quả cũ, không trừ quota lần hai.

### 2.4 Mã lỗi editor/job

| HTTP | `code` | Khi nào |
|---|---|---|
| 401 | `AUTH_TOKEN_INVALID` / `AUTH_TOKEN_EXPIRED` | editor token sai/hết hạn |
| 403 | `EDITOR_ASSET_TYPE_FORBIDDEN` | import `source_model` khi đã có model gốc |
| 403 | `QUOTA_EXPORT_EXCEEDED` | hết hạn mức xuất (lúc tạo job hoặc lúc complete) |
| 403 | `JOB_CLAIM_MISMATCH` | claim token không phải do job này cấp |
| 409 | `EDITOR_MODEL_NOT_READY` | lưu design / bake khi model còn `raw` |
| 409 | `EDITOR_NO_RAW_MODEL` | prepare khi project không có model `raw` |
| 409 | `EDITOR_DESIGN_RESET_REQUIRED` | re-crop khi đã có design mà thiếu `confirmResetDesign: true` |
| 409 | `EDITOR_MODEL_CHANGED` | model gốc đổi giữa lúc tạo job và complete |
| 409 | `PROJ_BAKE_IN_PROGRESS` | đã có job `claimed` còn lease |
| 409 | `JOB_ALREADY_CLAIMED` / `JOB_NOT_CLAIMABLE` | job đang bị máy khác giữ / đã kết thúc |
| 409 | `JOB_CLAIM_SUPERSEDED` | máy khác đã claim lại sau khi lease hết |
| 409 | `JOB_PAYLOAD_INVALID` | không dựng được payload (dữ liệu design/asset hỏng) |
| 422 | `JOB_OUTPUT_INVALID` | output không qua kiểm tra; job vẫn `claimed`, có thể complete lại |

---

## 3. Mobile `ar-ai-exe/mobile` → KusShoes BE

Client: `mobile/lib/services/backend_api.dart`. Base URL `--dart-define=KUSSHOES_BASE_URL`
(mặc định `https://136.85.55.175.sslip.io`). Mobile dùng **user Bearer** như web; phần xử lý scan đi qua
relay của ar-ai-exe (xem contract ar-ai-exe §2).

### 3.1 Route mobile đang gọi

| Nhóm | Route |
|---|---|
| Auth | `POST /auth/register`, `/verify-otp`, `/resend-otp`, `/login`, `/2fa/verify`, `/refresh`, `/logout`, `/forgot-password`, `/reset-password` · `GET /auth/google?…` (mở trình duyệt) → `POST /auth/google/mobile/exchange { code, code_verifier }` → `{ access_token, token_type }` |
| Users | `GET/PATCH/DELETE /users/me`, `POST/DELETE /users/me/avatar`, `PUT /users/me/password`, `GET /users/me/usage` |
| Projects | `GET/POST /projects`, `GET /projects/trash`, `PATCH/DELETE /projects/{id}`, `POST /projects/{id}/restore`, `DELETE /projects/{id}/permanent`, `POST /projects/{id}/apply-template/{tid}` |
| Studio | `GET /templates?category=…` |
| Exports | `GET /exports`, `POST /exports/{id}/download-url` |
| Billing | `GET /plans`, `GET /subscription`, `POST /subscription/checkout`, `POST /subscription/cancel`, `GET /subscription/invoices?limit=` |
| Feedback | `POST /feedback` |
| Scan | `POST /mobile/scans/bootstrap` — xem §3.2 |

### 3.2 Bắt đầu một lần quét

`POST /api/v1/mobile/scans/bootstrap` (user Bearer)

| | |
|---|---|
| Request | `{ "client_request_id": "<uuid>", "project_name"?: "1–100 ký tự" }` — **giữ nguyên `client_request_id` khi retry cùng một lần quét** (idempotent) |
| Response 201 | `{ project_id, compute_api_url, compute_grant, expires_in, web_project_url }` |
| Lỗi | 409 `SCAN_QUOTA_EXHAUSTED` · 503 `SCAN_INTAKE_SUSPENDED` (vượt ngân sách API) · 503 `MOBILE_COMPUTE_UNAVAILABLE` (chưa cấu hình `MOBILE_COMPUTE_URL`) |

Sau đó mobile gọi relay `POST {compute_api_url}/api/control-plane/scan/exchange { computeGrant }`.
Relay gọi ngược KusShoes (§4.1) để xác minh grant, rồi toàn bộ upload/KIRI/lưu model chạy ở relay.
Model scan về KusShoes với `status = "raw"` — cần prepare (crop) trên desktop trước khi thiết kế.

### 3.3 URL trao tay sang web/desktop

| Field | Giá trị BE trả | Mobile dùng cho |
|---|---|---|
| `web_project_url` (bootstrap, relay exchange) | `{PUBLIC_WEB_URL}/projects/{id}` | nút "Mở trên Desktop" (`scan_result_screen.dart`) |
| `editor_url` (project list/detail) | `https://app.kusshoes.vn/editor/{id}` (hằng số trong `project_service.py`) | mở từ "Thiết kế của tôi" (`my_designs_screen.dart`) |

⚠️ **Cả hai URL hiện không khớp route của web** — xem §6, mục 1.

---

## 4. Service-to-service

### 4.1 KIRI relay (`ar-ai-exe/backend`, `APP_ROLE=relay`) → KusShoes

Header `X-Service-Token: <MOBILE_COMPUTE_SERVICE_TOKEN>` (phía relay: `CONTROL_PLANE_MOBILE_SERVICE_TOKEN`).

| Route | Request → Response |
|---|---|
| `POST /api/v1/internal/mobile/compute-grants/claim` | `{ compute_grant }` → `{ user_id, project_id, project_name, completion_token, web_project_url }` · grant sai/hết hạn → 401 `MOBILE_SCAN_GRANT_INVALID` |
| `POST /api/v1/internal/mobile/scans/output-upload` | `{ completion_token }` → `{ project_id, asset_id, file_path, upload_url?, expires_in, already_completed }` (gọi lại sau confirm → `already_completed: true`, `upload_url: null`) |
| `POST /api/v1/internal/mobile/scans/output-confirm` | `{ completion_token, asset_id, file_size_bytes }` → asset `source_model` `status="raw"`, trừ 1 lượt quét · 401 `MOBILE_SCAN_COMPLETION_INVALID` · 409 `MOBILE_SCAN_PUBLISH_CONFLICT` |

### 4.2 Route dùng `SERVICE_TOKEN`

| Route | Người gọi hiện tại |
|---|---|
| `POST /api/v1/internal/api-cost/calls`, `GET /internal/api-cost/scan-intake` | relay gửi chi phí KIRI (`api_cost_reporter.py`) — **nhưng gửi bằng mobile compute token**, xem §6 mục 2 |
| `POST /api/v1/internal/scan-quota/consume`, `GET /internal/scan-quota/{user_id}` | không client nào ngoài gọi (quota được trừ trong `output-confirm`) |
| `PUT /projects/{id}/design`, `POST /projects/{id}/bake`, `GET …/bake/{job}`, `POST …/retry|cancel`, `POST /auth/verify-sso` | legacy, không client nào gọi |

### 4.3 Webhook thanh toán

`POST /api/v1/webhooks/payos`, `POST /api/v1/webhooks/momo` — xác thực bằng chữ ký của nhà cung cấp, không dùng token hệ thống.

---

## 5. Biến môi trường phải khớp giữa hai repo

| `KusShoes/BE` | Phải khớp với |
|---|---|
| `EDITOR_DESKTOP_URL_SCHEME=kusshoes-editor` | `ar-ai-exe/desktop/src-tauri/tauri.conf.json` deep-link scheme |
| `MOBILE_COMPUTE_URL` | URL public của relay (`https://relay.136.85.55.175.sslip.io`); trả về cho mobile qua `compute_api_url` |
| `MOBILE_COMPUTE_SERVICE_TOKEN` | `CONTROL_PLANE_MOBILE_SERVICE_TOKEN` của relay |
| origin public của BE | `CONTROL_PLANE_API_BASE_URL` của relay; `VITE_KUSSHOES_API_BASE_URL` của editor; `KUSSHOES_BASE_URL` của mobile |
| `PUBLIC_WEB_URL` | domain web thật (đang dùng để dựng `web_project_url`) |
| `STORAGE_ENDPOINT` (origin ký presigned) | `WORKER_ALLOWED_STORAGE_ORIGINS` của sidecar desktop và allowlist upload của relay |
| CORS bucket (R2/MinIO) | origin web, `http://tauri.localhost`, `https://tauri.localhost`, `tauri://localhost`; method `GET, HEAD, PUT` |

`EDITOR_WORKER_URL` / `EDITOR_WORKER_SERVICE_TOKEN` **đã bị xoá**: KusShoes không còn gọi bake worker.
`docs/integration-runbook.md` §1 và §3 còn mô tả luồng cũ này.

---

## 6. Lệch contract đã phát hiện (2026-09-27)

1. **URL trao tay mobile → web trỏ vào route không tồn tại.** Web chỉ có `/project-details?id=…`
   (`FE/src/App.tsx:34`) và không có route `/editor/*`; `/projects/{id}` và `/editor/{id}` đều rơi về
   landing (`default` của `getPageFromPath`). Ảnh hưởng: nút "Mở trên Desktop" và "Thiết kế của tôi" trên
   mobile. Cần chọn một: sửa BE trả `/project-details?id={id}` (và bỏ hằng số `EDITOR_BASE_URL`, dùng
   `PUBLIC_WEB_URL`), hoặc thêm route `/projects/:id` trên web.
2. **Relay báo chi phí API bằng sai token.** `api_cost_reporter.py:96` gửi
   `CONTROL_PLANE_MOBILE_SERVICE_TOKEN`, còn `/internal/api-cost/*` kiểm `SERVICE_TOKEN`. Trong
   `BE/.env.production` hai giá trị khác nhau → mọi báo cáo chi phí KIRI nhận 401 và chỉ bị log warning,
   nên ngân sách SF-14 không bao giờ tăng. Chưa kiểm env thật trên VM.
3. **`API_REFERENCE.md` đã cũ 28 route** (thiếu cả `jobs/claim|complete|fail` và `prepare`). Đã sinh lại ngày 2026-09-27.
4. Watermark: BE vẫn gửi khối `watermark` và từ chối `complete` của job Free thiếu `watermarkApplied`;
   editor luôn gửi `false`. Không gây lỗi vì gói Free có `max_exports_per_month = 0` (Ticket-04 đã bỏ).
   Nếu sau này cho Free xuất file, luồng này sẽ gãy.
