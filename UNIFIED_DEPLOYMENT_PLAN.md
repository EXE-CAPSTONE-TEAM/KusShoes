# Kế hoạch thống nhất luồng triển khai — KusShoes làm Single Source of Truth

**Ngày lập:** 2026-07-18 · **Phạm vi:** web, mobile (APK), desktop (exe) dùng chung 1 database qua KusShoes BE

---

## 1. Nguyên tắc kiến trúc

- **KusShoes BE** (FastAPI + Celery + Postgres + Redis + MinIO, `KusShoes/BE`) là backend và database **duy nhất**. Mọi client đọc/ghi qua API này.
- **KusShoes/FE** là codebase editor chuẩn cho cả web lẫn desktop. `ar-ai-exe/frontend` ngừng phát triển.
- `ar-ai-exe/backend` không còn là server chính; các phần giá trị được **port sang KusShoes BE**: KIRI pipeline (`kiri_client.py`, `kiri_pipeline.py`, `kiri_worker.py`), mesh cleanup (Blender), và tiếp tục dùng làm sidecar offline cho desktop.
- Domain (đã định trong `docs/kusshoes-api-contract.md`):

| Domain | Trỏ tới |
|---|---|
| `app.kusshoes.vn` | KusShoes FE (web editor) |
| `api.kusshoes.vn` | KusShoes BE API |
| `cdn.kusshoes.vn` | MinIO (models, thumbnails) |

## 2. Kiến trúc đích

```
                      ┌────────────────── VPS (docker compose) ──────────────────┐
  Web browser ──────► │ nginx+TLS → fe (KusShoes/FE)                             │
                      │           → api (KusShoes BE) ── Postgres ── Redis        │
  Mobile APK ───────► │           → MinIO (GLB/textures)                          │
  (api.kusshoes.vn)   │  worker (Celery): bake | scan-KIRI | mesh-cleanup | beat  │
                      └───────────────────────────────┬──────────────────────────┘
  Desktop exe (Tauri + KusShoes/FE)                   │ KIRI Engine cloud API
    ├─ Online  → gọi thẳng api.kusshoes.vn ◄──────────┘
    └─ Offline → sidecar SQLite local → tự sync khi có mạng lại
```

**Luồng scan mobile:** quét video → `POST /api/v1/mobile/scans/bootstrap` → upload video → worker gửi KIRI cloud → GLB thô về MinIO → mobile xem model (model_viewer) → chọn mặt cắt Oxyz xóa phần thừa → gửi tham số cắt → worker Blender crop → **model sạch nằm trong project chung** → desktop/web mở ra custom.

**Luồng desktop hybrid (online-first, offline fallback):**

1. Mở app có mạng → làm việc trực tiếp với `api.kusshoes.vn`, local chỉ cache.
2. Mất mạng → tự chuyển sang sidecar SQLite, đánh dấu project đang sửa offline.
3. Có mạng lại → tự đẩy thay đổi lên cloud rồi **giải phóng bản local**.
4. Nếu bản trên server đã bị sửa trong lúc desktop offline → **không ghi đè**, tạo bản sao "Offline copy" để user tự chọn (không mất data, không cần UI merge).

## 3. Các phase thực hiện

### Phase 0 — Hạ tầng VPS + domain (≈2 ngày)

- [ ] DNS: `api`, `app`, `cdn` → IP VPS.
- [ ] Thêm service `nginx` (reverse proxy) + certbot/Let's Encrypt vào `KusShoes/BE/docker-compose.yml` (hoặc compose mới ở root KusShoes).
- [ ] Tạo `.env` production: secrets mới (JWT, MinIO, Postgres — bỏ user/pass mặc định `kusshoes/kusshoes`), `KIRI_API_TOKEN`.
- [ ] MinIO: public read cho bucket qua `cdn.kusshoes.vn`.

### Phase 1 — Web hoàn chỉnh trên compose (≈3 ngày)

- [ ] Viết `KusShoes/FE/Dockerfile` (build Vite → nginx serve `dist/`) — **hiện chưa có**.
- [ ] Thêm service `fe` vào compose; cấu hình API base URL production cho FE.
- [ ] CORS trong BE cho `app.kusshoes.vn`.
- [ ] Chạy Alembic migration trên Postgres VPS, seed tài khoản admin.
- **Nghiệm thu:** mở `app.kusshoes.vn` từ mạng ngoài, login, tạo/lưu project → dữ liệu nằm trong Postgres VPS.

### Phase 2 — Mobile APK (≈1–1.5 tuần)

Backend:
- [ ] Port KIRI pipeline từ `ar-ai-exe/backend/app/services|workers` sang Celery task KusShoes (queue `scan`): nhận video → KIRI cloud → GLB vào MinIO → gắn vào project.
- [ ] Port mesh cleanup (Blender crop) sang worker; endpoint nhận tham số mặt cắt Oxyz từ mobile. Docker image worker cài Blender headless.

Mobile (`ar-ai-exe/mobile`):
- [ ] `backend_api.dart`: đổi endpoints sang `/api/v1` KusShoes (auth, projects, mobile/scans); default `BACKEND_BASE_URL = https://api.kusshoes.vn` (bỏ IP LAN `172.16.1.232`).
- [ ] Màn hình sau scan: xem GLB + UI chọn mặt phẳng cắt Oxyz → gửi crop request → poll kết quả model sạch.
- [ ] Đổi `applicationId` (bỏ `com.example.`), tạo keystore release (hiện đang ký debug key — TODO trong `build.gradle.kts`), tắt `usesCleartextTraffic` (đã có HTTPS).
- [ ] `flutter build apk --release`.
- **Nghiệm thu:** cài APK máy thật dùng 4G (ngoài LAN), login cùng account web, scan → thấy model → cắt phần thừa → model sạch hiện trên web editor.

### Phase 3 — Desktop hybrid (≈1.5–2 tuần, effort lớn nhất)

- [ ] Chuyển desktop bundle từ `ar-ai-exe/frontend` sang **KusShoes/FE** (thêm mode desktop: API URL động, detect Tauri).
- [ ] Tauri runtime manager: probe mạng → chọn `api.kusshoes.vn` hoặc khởi động sidecar SQLite.
- [ ] Sync service (Rust hoặc trong sidecar Python): hàng đợi thay đổi offline → khi online: push lên KusShoes API, xử lý conflict bằng "Offline copy", xóa cache local sau khi thành công. File GLB/texture sync qua MinIO presigned URL.
- [ ] Mapping schema sidecar (SQLite, schema ar-ai-exe) ↔ KusShoes API — chỉ sync entity cần thiết: project, design, asset.
- [ ] Rebuild exe (`npm run build:production`).
- **Nghiệm thu:** có mạng edit → F5 web thấy ngay; rút mạng edit tiếp → cắm mạng → tự sync, không mất thay đổi nào; sửa chéo web trong lúc offline → xuất hiện "Offline copy", không bị ghi đè.

### Phase 4 — E2E tự động + UAT (≈1 tuần, chạy song song từ Phase 1)

- [ ] Port `ar-ai-exe/backend/e2e_smoke.py` sang API `/api/v1` KusShoes — smoke test sau mỗi lần deploy.
- [ ] Playwright cho web: login → mở project → edit → save → reload còn nguyên.
- [ ] `flutter test` + integration_test cơ bản cho luồng scan.
- [ ] Pytest 2 backend giữ xanh; ruff + SonarCloud (đã cấu hình sẵn).
- [ ] Viết UAT checklist từ `docs/e2e-demo-script.md` (cập nhật URL production, bỏ path cũ `F:\_FPT\EXE101\test-project`).
- **Kịch bản UAT xuyên nền tảng:** 1 account duy nhất — scan trên mobile → cắt Oxyz → mở web thấy model → custom trên web → mở desktop exe thấy đúng design → desktop offline edit → online lại sync → web thấy bản mới.

## 4. Rủi ro & việc phải chốt

| Rủi ro | Ứng phó |
|---|---|
| KIRI token/quota production | Đăng ký gói phù hợp trước Phase 2; pipeline fail rõ ràng, không mock |
| Blender trong Docker worker | Image nặng (~500MB+); build riêng image worker, cache layer |
| 2 schema DB khác nhau khi sync desktop | Giới hạn sync ở project/design/asset; viết mapping layer + test riêng |
| API contract mobile hiện viết theo ar-ai-exe | Rà `docs/mobile-backend-contract.md` vs KusShoes `/api/v1/mobile` ngay đầu Phase 2 |
| VPS yếu | Compose hiện gồm 7+ service; tối thiểu 4GB RAM, khuyến nghị 8GB |

## 5. Thứ tự ưu tiên tổng

`P0 hạ tầng → P1 web (nền tảng cho mọi thứ) → P2 mobile → P3 desktop → P4 chạy song song từ P1`

Tổng ước tính: **4–5 tuần** với 1–2 người làm.
