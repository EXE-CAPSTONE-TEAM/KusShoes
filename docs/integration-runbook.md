# Integration runbook — KusShoes ↔ ar-ai-exe

**Nhánh tích hợp chính:** `codex/kusshoes-production-e2e` — có ở **cả hai repo** và phải
checkout ở cả hai thì hệ thống mới chạy đủ.

| Repo | Vai trò |
|---|---|
| `KusShoes` | **Control plane**: auth, project, design revision, asset, billing. Là database duy nhất. `FE/` là web app chính (`app.kusshoes.vn`). |
| `ar-ai-exe` | **Compute plane + KusStudio**: `backend/` chạy bake worker (và sau này là scan pipeline KIRI), `frontend/` là editor 3D, `desktop/` đóng gói editor thành app Tauri. |

Mobile (`ar-ai-exe/mobile`) **để lại phase sau**. Trong lúc chưa có scan, model 3D được
**import thủ công từ KusStudio desktop** (xem mục 4).

---

## 1. Sơ đồ kết nối

```
   Web (KusShoes/FE :5173)
        │  session cookie + bearer
        ▼
   KusShoes BE :8000  ────────── Postgres / Redis / MinIO
        │      ▲
        │      │ POST /bake  (X-Service-Token)
        │      └──────────────── ar-ai-exe/backend :8010   ← bake worker
        │
        │ POST /api/v1/auth/editor/launch
        │   → kusshoes-editor://launch?ticket=…
        ▼
   KusStudio desktop (Tauri + ar-ai-exe/frontend)
        │ PKCE claim → exchange → editor access token
        └─────────────► KusShoes BE /api/v1/editor/*
```

### Web → Desktop (PKCE, một lần dùng)

1. Web gọi `POST /api/v1/auth/editor/launch` → nhận `desktop_url` dạng
   `kusshoes-editor://launch?ticket=…` (ticket sống 60s).
2. Trình duyệt mở deep link → Tauri (`tauri-plugin-deep-link`, scheme khai báo trong
   `desktop/src-tauri/tauri.conf.json`) chuyển URL cho frontend.
3. `frontend/src/api/editorLaunch.ts` sinh `code_verifier`, gọi
   `POST /api/v1/auth/editor/launch/claim` rồi `…/exchange` để đổi lấy editor access token
   (scope `editor:read`, `editor:write`) gắn với đúng một project.
4. Từ đó KusStudio làm việc trực tiếp với `/api/v1/editor/*` của KusShoes.

> `POST /api/v1/auth/sso-token` + `/api/v1/auth/desktop-session` là luồng **legacy** còn giữ
> lại trên nhánh này. Desktop dùng PKCE ở trên, không dùng SSO token.

### KusShoes → bake worker

`KusShoes/BE` gọi `POST {EDITOR_WORKER_URL}/bake` kèm header `X-Service-Token`.
`ar-ai-exe/backend` xác thực bằng `CONTROL_PLANE_SERVICE_TOKEN`.
**Hai giá trị này phải giống hệt nhau.** Worker không bao giờ nhận credential của object
store — KusShoes cấp presigned download/upload URL trong payload.

---

## 2. Cổng dùng chung (local dev)

Hai stack chạy song song trên cùng máy, không được đụng cổng:

| Cổng | Service |
|---|---|
| 8000 | KusShoes BE (control plane) |
| 5173 | KusShoes FE (web chính) |
| 8010 | ar-ai-exe backend (compute/bake worker) |
| 5174 | ar-ai-exe frontend (KusStudio editor dev) |
| 5432 / 6379 / 9000 / 9001 | Postgres / Redis / MinIO API / MinIO console |

`ar-ai-exe/docker-compose.dev.yml` đã map sẵn `8010:8000` và `5174:5173`.

---

## 3. Khởi động toàn bộ

```bash
# 1. Control plane — KusShoes
cd KusShoes/BE
cp .env.example .env          # điền SECRET_KEY, SERVICE_TOKEN, EDITOR_WORKER_SERVICE_TOKEN
docker compose up -d
docker compose exec api alembic upgrade head
docker compose exec api python -m scripts.create_admin

# 2. Web
cd ../FE && npm ci && npm run dev        # http://localhost:5173

# 3. Compute plane — ar-ai-exe (CONTROL_PLANE_SERVICE_TOKEN = EDITOR_WORKER_SERVICE_TOKEN)
cd ../../ar-ai-exe
docker compose -f docker-compose.dev.yml up -d --build   # backend :8010, editor :5174

# 4. Desktop
cd desktop
cp frontend.env.desktop.example ../frontend/.env.local   # VITE_KUSSHOES_API_BASE_URL=http://127.0.0.1:8000
npm run tauri dev
```

Biến môi trường bắt buộc khớp nhau giữa hai repo:

| KusShoes/BE/.env | ar-ai-exe |
|---|---|
| `EDITOR_WORKER_URL=http://localhost:8010` | — |
| `EDITOR_WORKER_SERVICE_TOKEN=<token>` | `CONTROL_PLANE_SERVICE_TOKEN=<cùng token>` |
| `EDITOR_DESKTOP_URL_SCHEME=kusshoes-editor` | scheme trong `desktop/src-tauri/tauri.conf.json` |
| — | `VITE_KUSSHOES_API_BASE_URL=http://127.0.0.1:8000` |

---

## 4. Import model 3D thủ công (tạm thời, thay cho scan mobile)

Luồng scan mobile chưa làm, nên model gốc được nạp bằng tay:

- **Từ web:** upload asset `source_model` qua
  `POST /api/v1/projects/{id}/assets/upload-url` → PUT file → `…/assets/confirm`.
- **Từ KusStudio desktop:** khi project chưa có model canonical, editor hiện thẻ
  *"Import model 3D cho project"* (`SourceModelImportCard`) → chọn `.glb` → đẩy thẳng vào
  project qua `/api/v1/editor/assets/upload-url` + `/confirm`.

Ràng buộc bảo mật giữ nguyên: **chỉ import được lần đầu**. Khi project đã có
`canonical_model_asset_id`, KusStudio không thể thay model gốc
(`EDITOR_ASSET_TYPE_FORBIDDEN`) — muốn đổi phải làm từ web.

Sau khi confirm, `confirm_upload` set `project.canonical_model_asset_id`, nên web thấy model
ngay và có thể duyệt.

---

## 5. Việc còn lại

- **Mobile (phase sau):** repoint `mobile/lib/services/backend_api.dart` từ IP LAN
  `172.16.1.232` sang domain thật, bật luồng `/api/v1/mobile/scans/*` và
  `MOBILE_COMPUTE_URL` / `CONTROL_PLANE_API_BASE_URL`.
- Bỏ luồng legacy `sso-token` / `desktop-session` khi chắc không client nào còn dùng.
- Chạy E2E xuyên nền tảng theo `UNIFIED_DEPLOYMENT_PLAN.md` mục 3, Phase 4.
