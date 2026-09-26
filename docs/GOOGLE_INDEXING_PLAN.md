# Kế Hoạch Triển Khai Lập Chỉ Mục Google (Google Indexing Plan)
**Dự án:** KusShoes  
**Domain mục tiêu:** `https://kusshoes.vercel.app`  
**Ngày lập kế hoạch:** 24/09/2026  
**Trạng thái:** Sẵn sàng triển khai (Ready for Implementation)

---

## 1. Tổng quan & Kết quả kiểm tra hiện trạng

Qua kiểm tra trực tiếp mã nguồn và trạng thái mạng của domain `https://kusshoes.vercel.app`, Google chưa thể lập chỉ mục (index) do các nguyên nhân kỹ thuật sau:

| STT | Rào cản kỹ thuật | Trạng thái hiện tại | Ảnh hưởng đối với Googlebot |
| :--- | :--- | :--- | :--- |
| 1 | **Vercel SPA Routing** | `curl -I /pricing` trả về **404 NOT_FOUND** | Khi Googlebot cào các liên kết nội bộ (`/pricing`, `/products`), Vercel báo lỗi 404 khiến bot đánh dấu trang hỏng. |
| 2 | **Chỉ dẫn Crawl (`robots.txt`)** | `curl /robots.txt` trả về **404** | Googlebot không nhận được chỉ dẫn trang nào được phép/không được phép cào, không thấy link Sitemap. |
| 3 | **Sơ đồ trang web (`sitemap.xml`)** | `curl /sitemap.xml` trả về **404** | Googlebot không nắm được danh sách URL ưu tiên và thời gian cập nhật. |
| 4 | **Thẻ Meta SEO & Canonical** | Chưa có trong `FE/index.html` | Thiếu thẻ mô tả (`description`), từ khóa, canonical tag (chống trùng lặp nội dung với preview URL), OpenGraph. |
| 5 | **Nội dung HTML ban đầu (CSR)** | `<div id="root"></div>` hoàn toàn rỗng | Bundle client chứa Three.js nặng (~1.8MB). Googlebot cần xếp hàng vào Render Queue mới đọc được nội dung nếu không có fallback semantic HTML. |
| 6 | **Google Search Console** | Chưa xác thực quyền sở hữu | Tên miền `*.vercel.app` không được Google tự động ưu tiên cào nếu không chủ động khai báo và Request Index. |

---

## 2. Checklist triển khai (Implementation Checklist)

- [ ] **Bước 1 (Frontend):** Tạo file cấu hình `FE/vercel.json` (Khắc phục lỗi 404 SPA route + thêm security headers).
- [ ] **Bước 2 (Frontend):** Tạo file `FE/public/robots.txt` (Cho phép cào trang public, chặn trang dashboard/admin/portal).
- [ ] **Bước 3 (Frontend):** Tạo file `FE/public/sitemap.xml` (Khai báo các route công khai: `/`, `/pricing`, `/products`).
- [ ] **Bước 4 (Frontend):** Cập nhật `FE/index.html` (Thêm Meta Description, Open Graph, Twitter Cards, Canonical, Schema JSON-LD, Fallback HTML).
- [ ] **Bước 5 (Deploy & Verify):** Chạy `npm run build`, push code lên Git, kiểm tra các URL bằng `curl`.
- [ ] **Bước 6 (Google Search Console):** Thêm thuộc tính `https://kusshoes.vercel.app`, xác minh qua thẻ HTML.
- [ ] **Bước 7 (Sitemap & Request Indexing):** Gửi `sitemap.xml` lên GSC và dùng công cụ URL Inspection để "Yêu cầu lập chỉ mục" (Request Indexing).

---

## 3. Chi tiết mã nguồn & File cấu hình cần tạo/chỉnh sửa

### File 1: `FE/vercel.json`
> **Mục đích:** Hướng dẫn Vercel định tuyến mọi sub-route về `index.html` (tránh lỗi 404 khi vào thẳng `/pricing`, `/products`) và bổ sung header bảo mật cơ bản.

Tạo mới file `FE/vercel.json`:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        }
      ]
    },
    {
      "source": "/(robots.txt|sitemap.xml)",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=86400, s-maxage=86400"
        }
      ]
    }
  ]
}
```

---

### File 2: `FE/public/robots.txt`
> **Mục đích:** Cho phép Googlebot cào các trang công khai giới thiệu sản phẩm/bảng giá, đồng thời chặn bot cào vào các trang người dùng nội bộ (portal, dự án cá nhân, admin, thanh toán).

Tạo mới file `FE/public/robots.txt`:
```txt
# Robots.txt for KusShoes (https://kusshoes.vercel.app)
User-agent: *
Allow: /
Allow: /pricing
Allow: /products
Allow: /login

# Disallow private application & admin pages
Disallow: /dashboard*
Disallow: /projects*
Disallow: /project-details*
Disallow: /archives*
Disallow: /billing*
Disallow: /settings*
Disallow: /feedback*
Disallow: /admin*
Disallow: /api/

# Sitemap location
Sitemap: https://kusshoes.vercel.app/sitemap.xml
```

---

### File 3: `FE/public/sitemap.xml`
> **Mục đích:** Cung cấp danh sách các trang công khai để Googlebot thu thập dữ liệu nhanh chóng.

Tạo mới file `FE/public/sitemap.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <!-- Homepage -->
  <url>
    <loc>https://kusshoes.vercel.app/</loc>
    <lastmod>2026-09-24</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>

  <!-- Products Page -->
  <url>
    <loc>https://kusshoes.vercel.app/products</loc>
    <lastmod>2026-09-24</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>

  <!-- Pricing Page -->
  <url>
    <loc>https://kusshoes.vercel.app/pricing</loc>
    <lastmod>2026-09-24</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>
```

---

### File 4: `FE/index.html`
> **Mục đích:** Bổ sung đầy đủ thẻ meta SEO tiêu chuẩn, Canonical URL, Open Graph cho mạng xã hội, dữ liệu có cấu trúc Schema.org, và nội dung semantic fallback trong `<div id="root">`.

Cập nhật file `FE/index.html` theo nội dung sau:
```html
<!doctype html>
<html lang="vi">

<head>
  <meta charset="UTF-8" />
  <link rel="icon" type="image/x-icon" href="/favicon.ico" />
  <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
  <link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <!-- Primary Meta Tags -->
  <title>KusShoes - Nền Tảng Tuỳ Biến & Thiết Kế Giày 3D Tương Tác</title>
  <meta name="title" content="KusShoes - Nền Tảng Tuỳ Biến & Thiết Kế Giày 3D Tương Tác" />
  <meta name="description" content="KusShoes: Shape your shoes, show your style. Trải nghiệm nền tảng tuỳ biến thiết kế giày 3D tương tác thời gian thực, quản lý dự án và số hoá thời trang thể thao chuyên nghiệp." />
  <meta name="keywords" content="KusShoes, 3D shoe customizer, thiet ke giay 3D, tuy bien giay, 3D sneakers, shoe configurator" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="https://kusshoes.vercel.app/" />

  <!-- Open Graph / Facebook / Zalo -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://kusshoes.vercel.app/" />
  <meta property="og:title" content="KusShoes - Nền Tảng Tuỳ Biến & Thiết Kế Giày 3D Tương Tác" />
  <meta property="og:description" content="Khám phá nền tảng tuỳ biến thiết kế giày 3D tương tác thời gian thực cùng KusShoes." />
  <meta property="og:image" content="https://kusshoes.vercel.app/KusShoes_Logo.png" />
  <meta property="og:site_name" content="KusShoes" />

  <!-- Twitter Cards -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content="https://kusshoes.vercel.app/" />
  <meta name="twitter:title" content="KusShoes - Nền Tảng Tuỳ Biến Giày 3D" />
  <meta name="twitter:description" content="KusShoes: Shape your shoes, show your style. Công cụ tuỳ biến giày 3D chuyên nghiệp." />
  <meta name="twitter:image" content="https://kusshoes.vercel.app/KusShoes_Logo.png" />

  <!-- Google Search Console Verification Tag (Thay thế placeholder khi lấy mã từ GSC) -->
  <!-- <meta name="google-site-verification" content="YOUR_VERIFICATION_CODE_HERE" /> -->

  <!-- Structured Data (JSON-LD) for Search Engines -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "KusShoes",
    "url": "https://kusshoes.vercel.app/",
    "description": "Nền tảng tuỳ biến và thiết kế giày 3D tương tác thời gian thực",
    "applicationCategory": "DesignApplication",
    "operatingSystem": "All",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "VND"
    }
  }
  </script>

  <script>
    (function () {
      try {
        const saved = localStorage.getItem('theme');
        if (saved === 'light' || saved === 'dark') {
          document.documentElement.setAttribute('data-theme', saved);
        } else {
          document.documentElement.setAttribute('data-theme', 'dark');
        }
      } catch (e) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
    })();
  </script>
</head>

<body>
  <div id="root">
    <!-- Semantic Fallback cho Googlebot trước khi bundle React hydrate -->
    <noscript>
      <header>
        <h1>KusShoes: Shape your shoes, show your style</h1>
        <p>Nền tảng thiết kế và tuỳ biến giày 3D tương tác đa góc nhìn trong thời gian thực.</p>
      </header>
      <main>
        <section>
          <h2>Tính năng nổi bật</h2>
          <p>Trải nghiệm mô hình 3D tương tác trực quan, quản lý dự án thiết kế, phân tích chi phí và số hoá phong cách thời trang.</p>
        </section>
        <section>
          <h2>Khám phá các trang</h2>
          <ul>
            <li><a href="/products">Sản phẩm &amp; Giải pháp</a></li>
            <li><a href="/pricing">Bảng giá dịch vụ</a></li>
            <li><a href="/login">Đăng nhập tài khoản</a></li>
          </ul>
        </section>
      </main>
    </noscript>
  </div>
  <script type="module" src="/src/main.tsx"></script>
</body>

</html>
```

---

## 4. Hướng dẫn từng bước kích hoạt với Google Search Console

Sau khi hoàn thành cập nhật code và deploy lên Vercel:

### Bước 4.1: Thêm tài sản (Property) vào Google Search Console
1. Truy cập [Google Search Console](https://search.google.com/search-console).
2. Đăng nhập bằng tài khoản Google quản trị dự án.
3. Chọn mục **Thêm tài sản (Add Property)**.
4. Chọn loại: **Tiền tố URL (URL prefix)**:
   - Nhập chính xác: `https://kusshoes.vercel.app`
   - Bấm **Tiếp tục**.

### Bước 4.2: Xác minh quyền sở hữu
1. Tại danh sách phương thức xác minh, chọn **Thẻ HTML (HTML tag)**.
2. Sao chép đoạn mã meta được cấp, ví dụ:
   ```html
   <meta name="google-site-verification" content="xxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
   ```
3. Mở file `FE/index.html`, dán đoạn mã này vào trong thẻ `<head>`.
4. Commit & Push code lên Git (`git commit -am "chore: add google site verification tag" && git push`).
5. Đợi Vercel deploy hoàn tất (~30-60 giây).
6. Quay lại Google Search Console và bấm nút **Xác minh (Verify)**. Thông báo thành công sẽ hiển thị màu xanh.

### Bước 4.3: Gửi Sơ đồ trang web (Submit Sitemap)
1. Trong menu bên trái của Google Search Console, chọn mục **Sơ đồ trang web (Sitemaps)**.
2. Tại ô "Thêm sơ đồ trang web mới", nhập: `sitemap.xml`
3. Bấm **Gửi (Submit)**.
4. Đảm bảo trạng thái hiện **Thành công (Success)**.

### Bước 4.4: Yêu cầu lập chỉ mục thủ công (Request Indexing)
1. Nhấp vào thanh tìm kiếm **Kiểm tra bất kỳ URL nào (URL Inspection)** ở thanh trên cùng.
2. Nhập URL trang chủ: `https://kusshoes.vercel.app/` và bấm Enter.
3. Bấm nút **Kiểm tra URL trực tiếp (Test Live URL)** (mất khoảng 1-2 phút để Googlebot render trang thực tế).
4. Xem ảnh chụp màn hình kiểm tra (Screenshot) để đảm bảo Googlebot render thấy rõ tiêu đề và giao diện KusShoes.
5. Bấm nút **Yêu cầu lập chỉ mục (Request Indexing)**.
6. Lặp lại thao tác này cho 2 trang con quan trọng:
   - `https://kusshoes.vercel.app/pricing`
   - `https://kusshoes.vercel.app/products`

---

## 5. Kịch bản kiểm thử sau khi deploy (Verification Commands)

Bạn có thể chạy các lệnh sau từ terminal máy phát triển để kiểm tra xem hệ thống đã sẵn sàng cho bot cào hay chưa:

```bash
# 1. Kiểm tra robots.txt đã hoạt động chưa (phải trả về HTTP 200)
curl -I https://kusshoes.vercel.app/robots.txt

# 2. Kiểm tra sitemap.xml đã hoạt động chưa (phải trả về HTTP 200 và XML format)
curl -I https://kusshoes.vercel.app/sitemap.xml
curl -s https://kusshoes.vercel.app/sitemap.xml | head -n 10

# 3. Kiểm tra SPA Rewrite của Vercel trên các subroute (phải trả về HTTP 200 thay vì 404)
curl -I https://kusshoes.vercel.app/pricing
curl -I https://kusshoes.vercel.app/products

# 4. Kiểm tra thẻ Canonical và Meta Description trên trang chủ
curl -s https://kusshoes.vercel.app/ | grep -E "canonical|description|google-site-verification"
```

---

## 6. Lộ trình tăng tốc & Đề xuất dài hạn

1. **Tạo tín hiệu liên kết ngoài (External Backlinks):**
   - Cập nhật URL `https://kusshoes.vercel.app` vào mục **Website** của GitHub Repository `EXE-CAPSTONE-TEAM/KusShoes`.
   - Chia sẻ liên kết website lên các trang mạng xã hội (Facebook, LinkedIn cá nhân) để bot Google đi theo liên kết ngoài vào thu thập thông tin nhanh hơn (thời gian index rút ngắn từ 1 tuần xuống còn 1-3 ngày).
2. **Khuyến nghị gắn Custom Domain (Tên miền riêng):**
   - Về lâu dài, tên miền `kusshoes.vercel.app` là subdomain công cộng của Vercel nên độ uy tín (Domain Authority) thấp hơn.
   - Để làm sản phẩm thương mại hoặc capstone project chuyên nghiệp, nên gắn tên miền riêng (ví dụ: `kusshoes.com` hoặc `kusshoes.vn`) trong mục Vercel Project Settings -> Domains.
