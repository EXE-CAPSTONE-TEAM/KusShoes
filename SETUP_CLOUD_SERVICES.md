# Runbook: Setup dịch vụ cloud cho KusShoes (production)

Theo bảng chi phí đã chốt: Namecheap (domain) + DigitalOcean (droplet) + Neon (Postgres) + Cloudflare R2 (storage) + KIRI Engine (scan 3D). Code/config đã sửa sẵn — chỉ cần đăng ký dịch vụ và điền giá trị vào `.env.production`.

**Các file liên quan (đã tạo/sửa sẵn):**

| File | Vai trò |
|---|---|
| `BE/.env.production.example` | Template biến môi trường production — copy thành `.env.production` và điền |
| `BE/docker-compose.prod.yml` | Compose production: không có `db`/`minio`, thêm nginx + certbot |
| `BE/deploy/nginx/` | Config nginx (HTTP active sẵn, HTTPS kích hoạt sau khi có cert) |
| `BE/app/config.py` | Đã thêm `STORAGE_REGION`, `KIRI_API_TOKEN`, `KIRI_API_BASE_URL` |
| `BE/app/infrastructure/storage.py` | boto3 client đã hỗ trợ R2 (SigV4 + region cấu hình được) |

Dev local **không đổi gì**: vẫn `docker compose up` với Postgres + MinIO container như cũ.

---

## Bước 1 — Namecheap: mua domain (~$11.48 năm đầu)

1. Mua domain `.com` ($11.28 năm đầu + $0.20 ICANN fee; renewal $14.98–18.48/năm).
2. Vào **Domain List → Manage → Advanced DNS**, tạo 3 bản ghi A (điền IP droplet sau khi xong Bước 2):

| Type | Host | Value |
|---|---|---|
| A | `api` | IP droplet |
| A | `app` | IP droplet |
| CNAME | `cdn` | (KHÔNG trỏ droplet — sẽ do Cloudflare R2 quản lý, xem Bước 4) |

Lưu ý: nếu domain thật không phải `kusshoes.vn`, thay domain tương ứng trong `.env.production`, `deploy/nginx/*.conf`, và CORS `allow_origins` trong `BE/app/main.py:36`.

## Bước 2 — DigitalOcean: tạo droplet ($24–48/tháng)

1. Create → Droplet → Ubuntu 24.04 LTS.
2. Size khuyến nghị: **Basic 8 GB / 4 vCPU ($48)** — compose chạy 6 container; sau này worker cài thêm Blender (Phase 2) sẽ cần RAM. Tối thiểu cho UAT: 4 GB / 2 vCPU ($24).
3. **Chưa cần Load Balancer ($12/node)** — kiến trúc hiện tại 1 node; chỉ mua khi scale ngang.
4. SSH vào droplet, cài Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
5. Quay lại Namecheap điền IP droplet vào 2 bản ghi A (`api`, `app`).

## Bước 3 — Neon: tạo database ($0 Free tier → ~$15 Launch)

1. Đăng ký [console.neon.tech](https://console.neon.tech) → New Project (chọn region gần VN, ví dụ `ap-southeast-1`).
2. Bắt đầu bằng **Free tier** ($0 — 100 CU-hours + 0.5 GB); nâng **Launch** (~$15/tháng typical) khi vượt.
3. Connection Details → chọn **Pooled connection** → copy connection string.
4. Sửa string trước khi dán vào `.env.production`:
   - `postgresql://` → `postgresql+asyncpg://`
   - Bỏ `sslmode=require&channel_binding=require`, thay bằng `?ssl=require` (driver asyncpg không nhận 2 param kia)

   ```env
   DATABASE_URL=postgresql+asyncpg://USER:PASS@ep-xxx-pooler.ap-southeast-1.aws.neon.tech/neondb?ssl=require
   ```

   Migration tự chạy khi container `api` khởi động (entrypoint đã có `alembic upgrade head`).

## Bước 4 — Cloudflare R2: tạo bucket ($0 dưới 10 GB)

1. [dash.cloudflare.com](https://dash.cloudflare.com) → R2 → Create bucket, tên `kusshoes`.
2. **Manage R2 API Tokens** → Create API Token → quyền **Object Read & Write**, giới hạn bucket `kusshoes` → lưu Access Key ID + Secret Access Key.
3. Copy **Account ID** (góc phải trang R2).
4. Public access cho thumbnails/models: bucket → **Settings → Custom Domains** → thêm `cdn.kusshoes.vn` (yêu cầu domain đã dùng Cloudflare DNS — nếu DNS vẫn ở Namecheap, hoặc chuyển nameserver sang Cloudflare, hoặc tạm dùng URL `r2.dev` do R2 cấp).
5. Điền vào `.env.production`:

   ```env
   STORAGE_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
   STORAGE_ACCESS_KEY=...
   STORAGE_SECRET_KEY=...
   STORAGE_BUCKET=kusshoes
   STORAGE_REGION=auto
   STORAGE_PUBLIC_URL=https://cdn.kusshoes.vn
   ```

Free tier: 10 GB-month, egress miễn phí. Sau đó $0.015/GB-month.

## Bước 5 — KIRI Engine ($1/scan, nạp tối thiểu $500) — Phase 2

Chỉ cần khi port scan pipeline (Phase 2 trong `UNIFIED_DEPLOYMENT_PLAN.md`). Đăng ký [kiriengine.app](https://www.kiriengine.app) → Developer API → nạp credit → điền `KIRI_API_TOKEN` vào `.env.production`. Để trống vẫn deploy được — luồng editor/web không phụ thuộc KIRI.

## Bước 6 — Deploy lên droplet

```bash
# Trên droplet
git clone <repo-url> kusshoes && cd kusshoes/BE
cp .env.production.example .env.production
nano .env.production        # điền toàn bộ giá trị từ Bước 1–5
# Sinh secret: openssl rand -hex 32  (chạy 2 lần cho SECRET_KEY và SERVICE_TOKEN)

# Khởi động (nginx lúc này chỉ chạy HTTP — chưa có cert)
docker compose -f docker-compose.prod.yml up -d --build

# Cấp cert lần đầu (DNS ở Bước 1 phải đã trỏ đúng IP)
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot -w /var/www/certbot -d api.kusshoes.vn \
  --email your-email@example.com --agree-tos --no-eff-email

# Kích hoạt HTTPS
mv deploy/nginx/kusshoes-https.conf.template deploy/nginx/kusshoes-https.conf
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

## Bước 7 — Kiểm tra

```bash
curl https://api.kusshoes.vn/health          # {"status":"ok"...}
curl https://api.kusshoes.vn/health/ready    # kiểm tra DB + Redis + storage
docker compose -f docker-compose.prod.yml logs api --tail 50   # migration OK?
```

Sau đó cập nhật bên thứ ba: Google OAuth redirect URI (`https://api.kusshoes.vn/api/v1/auth/google/callback`), Polar webhook URL, và SMTP app password.

---

## Tóm tắt chi phí tháng đầu (theo bảng đã chốt)

| Hạng mục | Dịch vụ | Chi phí |
|---|---|---|
| Domain (năm đầu, chia tháng) | Namecheap | ~$0.96/tháng ($11.28 + $0.20 ICANN) |
| Droplet | DigitalOcean | $24 hoặc $48 |
| Load Balancer | DigitalOcean | $0 — chưa cần |
| Postgres | Neon | $0 (Free) → ~$15 (Launch) |
| Storage | Cloudflare R2 | $0 (<10 GB) |
| Redis | (container trên droplet) | $0 |
| KIRI | KIRI Engine | $0 đến Phase 2, sau đó $1/scan (nạp min $500) |
| **Tổng (không KIRI)** | | **~$25–64/tháng** |
