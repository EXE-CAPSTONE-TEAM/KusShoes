# Kế hoạch Triển khai: Dashboard Marketing & Google Analytics 4 (GA4)

## 1. Tổng quan & Mục tiêu

Mục tiêu là cung cấp cho Quản trị viên (Admin) góc nhìn toàn diện về hiệu quả tiếp thị, nguồn gốc khách hàng và hành vi người dùng trên website KusShoes bằng cách kết hợp:
1. **Google Analytics 4 (GA4 Data API v1beta):** Thu thập dữ liệu khách truy cập ẩn danh (Web Visitors), lưu lượng truy cập (Sessions, Pageviews), độ gắn kết (Engagement Rate, Duration), phân bổ địa lý (Tỉnh/Thành phố, Quốc gia), các nền tảng giới thiệu (TikTok, Facebook, Google, Zalo...) và số khách đang online thời gian thực (Realtime).
2. **Cơ sở dữ liệu nội bộ (PostgreSQL `user_attributions` + `users` + `invoices`):** Đo lường số người dùng tạo tài khoản thực tế (Registered Users), số khách mua gói/credit (Paying Customers) và doanh thu VNĐ thu được từ từng nguồn tiếp cận.

Mô hình này đã được chuẩn hóa trong [`CONTEXT.md`](file:///home/tak/openclaw/projects/exe/KusShoes/CONTEXT.md) và ghi nhận tại Architecture Decision Record [`docs/adr/0001-hybrid-marketing-analytics-and-attribution.md`](file:///home/tak/openclaw/projects/exe/KusShoes/docs/adr/0001-hybrid-marketing-analytics-and-attribution.md).

---

## 2. Kiến trúc Kỹ thuật & Luồng Dữ liệu (Technical Architecture)

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Admin Web Browser                               │
│        (Tab 'Marketing & Lưu lượng' + Widget trên Dashboard)           │
└───────────────────▲────────────────────────────────────────────────────┘
                    │  GET /api/v1/admin/analytics/marketing?date_from=...
                    │  GET /api/v1/admin/analytics/marketing/realtime
┌───────────────────┴────────────────────────────────────────────────────┐
│                       FastAPI Backend (KusShoes BE)                    │
│                                                                        │
│   ┌────────────────────────────────────────────────────────────────┐   │
│   │             marketing_analytics_service.py                     │   │
│   └───────────────┬───────────────────────────────┬────────────────┘   │
│                   │                               │                    │
│           (Kiểm tra Cache)                (First-touch + Rev)          │
│                   ▼                               ▼                    │
│   ┌───────────────────────────────┐ ┌──────────────────────────────┐   │
│   │   Redis Cache (TTL 15 phút)   │ │  PostgreSQL Database         │   │
│   │   - Tránh cạn Quota GA4       │ │  - user_attributions         │   │
│   │   - Phản hồi siêu tốc <50ms   │ │  - users, invoices           │   │
│   └───────────────┬───────────────┘ └──────────────────────────────┘   │
│                   │ (Cache miss)                                       │
│                   ▼                                                    │
│   ┌───────────────────────────────┐                                    │
│   │      ga4_service.py           │                                    │
│   │  (BetaAnalyticsDataClient)    │                                    │
│   └───────────────┬───────────────┘                                    │
└───────────────────┼────────────────────────────────────────────────────┘
                    │ Google Service Account (Credentials JSON)
                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               Google Analytics 4 Data API (Property GA4)               │
│               - runReport (Historical Aggregations)                    │
│               - runRealtimeReport (Trailing 30-min active visitors)    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Thiết kế Chi tiết Backend (BE)

### 3.1. Thư viện & Cấu hình môi trường
* **Thư viện:** Thêm `google-analytics-data>=0.18.0` vào `BE/pyproject.toml`.
* **Biến môi trường (`BE/app/config.py` & `.env`):**
  * `GA4_PROPERTY_ID`: Mã Property ID (dạng số nguyên, ví dụ `432109876`).
  * `GA4_CREDENTIALS_JSON_PATH`: Đường dẫn tới file JSON service account (ví dụ `secrets/ga4-service-account.json`).
  * `GA4_CREDENTIALS_JSON_RAW`: Hỗ trợ chuỗi JSON / Base64 trực tiếp khi triển khai trên Docker/Cloud không cần mount file.

### 3.2. Service: `BE/app/services/ga4_service.py`
Chịu trách nhiệm giao tiếp trực tiếp với Google Analytics Data API:
* `is_configured() -> bool`: Kiểm tra xem hệ thống đã có đủ credentials và Property ID chưa.
* `test_connection() -> dict`: Thử gửi 1 query nhỏ 1 ngày qua để kiểm tra quyền đọc của Service Account.
* `get_realtime_active_users() -> int`: Gọi `runRealtimeReport` lấy số active visitors trong 30 phút qua.
* `get_historical_report(date_from, date_to, country=None) -> dict`:
  * Dimensions: `date`, `sessionDefaultChannelGroup`, `sessionSourceMedium`, `city`, `country`, `pagePath`, `landingPagePlusQueryString`, `deviceCategory`.
  * Metrics: `activeUsers`, `newUsers`, `sessions`, `screenPageViews`, `bounceRate`, `averageSessionDuration`, `engagementRate`.

### 3.3. Service: `BE/app/services/marketing_analytics_service.py`
Tổng hợp dữ liệu đa tầng (**Hybrid Aggregation**):
1. **Top-of-funnel:** Lấy số liệu truy cập từ `ga4_service` (hoặc mock nếu chưa cấu hình key).
2. **Bottom-of-funnel:** Query PostgreSQL từ `UserAttribution`, `User`, `Invoice` trong cùng khoảng ngày `[date_from, date_to]`:
   * Nhóm theo `utm_source` / `initial_referrer` $\rightarrow$ Map với các kênh của GA4 (TikTok, Facebook, Google, Zalo...).
   * Đếm: Số người đăng ký mới (`signups`), Số khách có ít nhất 1 hóa đơn thanh toán thành công (`paying_customers`), Tổng số tiền thanh toán (`revenue_vnd`).
3. **Tính toán chuyển đổi:**
   * Tỷ lệ đăng ký theo kênh: `signups / ga4_visitors`.
   * Doanh thu trung bình theo nguồn truy cập.
4. **Phân bổ địa lý:**
   * Thống kê Top Tỉnh/Thành phố từ GA4 kèm tỷ lệ phân bổ.
   * Lọc theo Quốc gia (`country`).
5. **Phễu Marketing 4 bước:**
   * Bước 1: Khách vào web (`ga4.total_visitors`).
   * Bước 2: Xem tính năng 3D & sản phẩm (`ga4.page_views_products_or_studio`).
   * Bước 3: Tạo tài khoản (`db.new_registered_users`).
   * Bước 4: Thanh toán đơn hàng (`db.new_paying_customers`).

### 3.4. API Endpoints (`BE/app/routers/admin_analytics.py`)
Tất cả endpoint yêu cầu xác thực Admin (`Depends(get_current_admin)`):
1. `GET /api/v1/admin/analytics/marketing`:
   * Query params: `date_from: date`, `date_to: date`, `country: str | None`.
   * Cache: Redis key `marketing_report:{date_from}:{date_to}:{country}` với TTL 15 phút. Nút "Làm mới" cho phép truyền `refresh=true` để xóa cache.
2. `GET /api/v1/admin/analytics/marketing/realtime`:
   * Trả về số active visitors trong 30 phút qua (Cache TTL 30 giây).
3. `POST /api/v1/admin/analytics/marketing/test-connection`:
   * Chạy kiểm tra kết nối với Google Cloud Service Account và trả về kết quả hoặc thông báo lỗi cụ thể để hỗ trợ cấu hình.

---

## 4. Thiết kế Chi tiết Frontend (FE)

### 4.1. TypeScript Types (`FE/src/types/admin.ts`)
* `PlatformScorecardItem`: `{ platform: string, visitors: number, sessions: number, avg_duration_sec: number, engagement_rate: number, signups: number, signup_rate: number, paying_customers: number, revenue_vnd: number }`
* `GeoLocationItem`: `{ city: string, country: string, visitors: number, sessions: number, share: number }`
* `CampaignPerformanceItem`: `{ campaign: string, source: string, visitors: number, signups: number, revenue_vnd: number }`
* `MarketingFunnelStep`: `{ step_name: string, count: number, drop_off_pct: number }`
* `MarketingAnalyticsResponse`: Chứa các cards Hero KPI, Scorecard, Geo, Funnel, Campaign và trạng thái kết nối `ga4_connected: boolean`.

### 4.2. Quản lý Trạng thái & API Client (`FE/src/api/adminClient.ts`)
* Thêm `adminAnalytics.getMarketingReport(params)`
* Thêm `adminAnalytics.getRealtime()`
* Thêm `adminAnalytics.testGa4Connection()`

### 4.3. Giao diện Người dùng (UI Components)

#### A. Tab mới trong `FE/src/pages/Admin/Analytics/AdminAnalytics.tsx`
* Bổ sung tab thứ 5: **"Marketing & Lưu lượng"** (bên cạnh *Tất cả danh mục*, *Chỉ số tài chính*, *Biểu đồ phân tích*, *Trung tâm Báo cáo*).
* Đồng bộ bộ chọn khoảng ngày (7N, 30N, 90N, tùy chỉnh) và nút Refresh có sẵn của trang Analytics.

#### B. Khối giao diện chuyên biệt:
1. **Hero KPIs & Realtime Card:**
   * Badge nhấp nháy xanh: `● X khách đang online (30 phút qua)`
   * 4 thẻ chính: Người dùng mới (New Visitors), Tỷ lệ quay lại (Returning Rate), Thời gian phiên TB (Avg Duration), Tỷ lệ tương tác (Engagement Rate).
2. **Platform Performance Scorecard (Bảng xếp hạng nền tảng đa tầng):**
   * Bảng chi tiết đối soát TikTok, Facebook, Google Search, Zalo, YouTube, Direct...
   * Cột hiển thị rõ: Lưu lượng (GA4) $\rightarrow$ Tương tác $\rightarrow$ Đăng ký (DB) $\rightarrow$ Doanh thu (DB).
   * Huy hiệu đánh giá hiệu quả (Rất tốt, Ổn định, Cần cải thiện).
3. **Phân bổ Địa lý (Geographic Regions Card):**
   * Danh sách Top Tỉnh/Thành phố tại Việt Nam (TP.HCM, Hà Nội, Đà Nẵng...) sử dụng component thanh ngang [`HorizontalBarList`](file:///home/tak/openclaw/projects/exe/KusShoes/FE/src/components/Admin/HorizontalBarList.tsx).
   * Dropdown lọc theo Quốc gia.
4. **Phễu Chuyển đổi Marketing (Conversion Funnel):**
   * Biểu đồ bậc thang thể hiện tỷ lệ rụng khách từ lúc vào web đến khi thanh toán.
5. **Hiệu quả Chiến dịch (UTM Campaign Table):**
   * Danh sách chiến dịch cụ thể kèm thông số đo lường ROI/chuyển đổi.
6. **Màn hình Hướng dẫn khi chưa gắn Key (Fallback Setup Guide):**
   * Nếu `ga4_connected === false`, hiển thị Modal / Card hướng dẫn 3 bước:
     * Bước 1: Tạo Service Account trên Google Cloud.
     * Bước 2: Cấp quyền Viewer trong Google Analytics `G-ZB62H02JZW`.
     * Bước 3: Điền `GA4_PROPERTY_ID` vào `.env` và nhấn nút **"Kiểm tra kết nối ngay"**.

#### C. Widget tóm tắt trên `FE/src/pages/Admin/Dashboard/AdminDashboard.tsx`
* Bổ sung một mini-card trong khu vực KPI của trang Dashboard tổng quan:
  * Hiển thị: Lượng khách mới hôm nay, Nền tảng mang lại nhiều khách nhất tuần qua và số khách đang online.
  * Nút "Xem chi tiết Marketing →" điều hướng trực tiếp sang tab Marketing của trang Analytics.

---

## 5. Lộ trình Triển khai (Step-by-Step Roadmap)

| Giai đoạn | Nhiệm vụ | Files tác động | Seam kiểm tra |
|---|---|---|---|
| **Phase 1: Backend Setup & Services** | 1. Thêm dependency `google-analytics-data`<br>2. Cấu hình env vars trong `config.py`<br>3. Viết `ga4_service.py`<br>4. Viết `marketing_analytics_service.py` (Hybrid data) | `BE/pyproject.toml`<br>`BE/app/config.py`<br>`BE/app/services/ga4_service.py`<br>`BE/app/services/marketing_analytics_service.py` | Unit tests: mock GA4 API response + query DB attribution |
| **Phase 2: Backend API & Redis Cache** | 1. Viết Schemas Pydantic cho Marketing Analytics<br>2. Viết Router endpoints trong `admin_analytics.py`<br>3. Tích hợp Redis Caching (15 phút) & cache invalidation | `BE/app/schemas/analytics.py`<br>`BE/app/routers/admin_analytics.py` | API Test với FastAPI TestClient |
| **Phase 3: Frontend API & Types** | 1. Cập nhật `FE/src/types/admin.ts`<br>2. Bổ sung API client trong `FE/src/api/adminClient.ts` | `FE/src/types/admin.ts`<br>`FE/src/api/adminClient.ts` | Type check `tsc --noEmit` |
| **Phase 4: Frontend UI Components** | 1. Xây dựng `MarketingTab.tsx` và sub-components (Scorecard, Geo, Funnel, SetupGuide)<br>2. Tích hợp Tab vào `AdminAnalytics.tsx` | `FE/src/pages/Admin/Analytics/Marketing/*`<br>`FE/src/pages/Admin/Analytics/AdminAnalytics.tsx` | Render test & layout responsive |
| **Phase 5: Dashboard Overview Widget** | 1. Bổ sung widget tóm tắt Marketing vào `AdminDashboard.tsx` | `FE/src/pages/Admin/Dashboard/AdminDashboard.tsx` | Dashboard visual inspection |
| **Phase 6: Kiểm thử & Nghiệm thu** | 1. Chạy test harness `./harness/verify.sh`<br>2. Kiểm tra fallback khi chưa có key Google (Setup Guide hiển thị chuẩn) | Toàn dự án | Exit Code 0 |

---

## 6. Xử lý Rủi ro & Edge Cases (Risk Mitigation)

1. **Rủi ro cạn hạn ngạch API của Google (Quota Limit):**
   * *Giải pháp:* Caching Redis 15 phút cho mọi truy vấn lịch sử. Realtime chỉ cache 30 giây. Khi có lỗi `RESOURCE_EXHAUSTED` từ Google API, backend trả về dữ liệu cache gần nhất kèm cảnh báo mềm thay vì crash màn hình.
2. **Khách hàng dùng Ad-blocker:**
   * Ad-blocker có thể chặn GA4 client-side, nhưng backend PostgreSQL `user_attributions` vẫn lưu vết khi người dùng đăng ký hoặc đăng nhập. Bảng đối soát sẽ phản ánh trung thực cả 2 nguồn.
3. **Khi chưa có file Service Account trên môi trường local/dev:**
   * Hệ thống tự động kích hoạt chế độ **Setup Guide**: Không báo lỗi 500, trả về payload có cờ `is_configured: false` để UI hiển thị các bước hướng dẫn cài đặt trực quan.
