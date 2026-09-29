# Lập chỉ mục Google (SEO) cho KusShoes

**Domain chính:** `https://kusshoes.kietta.me`
**Cập nhật:** 29/09/2026

## 1. Vì sao `site:kusshoes.kietta.me` chưa ra kết quả

Google chỉ index một trang sau khi **biết URL đó tồn tại**, **cào được** và **thấy đáng index**. Domain `kusshoes.kietta.me` mới dùng, nên cả ba điều này đều chưa có:

| Vấn đề | Trước | Sau khi sửa |
| :--- | :--- | :--- |
| Google không biết domain | Không có link trỏ về, chưa khai báo trong Search Console | **Việc bạn phải làm:** mục 3 |
| `robots.txt` | Không có. Rewrite SPA trả `index.html` (HTML) cho `/robots.txt` | Sinh lúc build, chặn các trang portal/admin, trỏ tới sitemap |
| `sitemap.xml` | Không có | Sinh lúc build: `/`, `/products`, `/pricing`, `/privacy`, `/terms` |
| Thẻ meta | Chỉ có `<title>` dùng chung cho mọi URL | Mỗi trang public có title, description, canonical, Open Graph và Twitter card riêng. Trang chủ có thêm JSON-LD (Organization + WebSite) |
| HTML ban đầu | `<div id="root"></div>` rỗng | Mỗi route có sẵn h1, mô tả và link tới các trang public (React thay thế khi chạy) |
| Trùng lặp nội dung | `kusshoes.vercel.app` và các URL preview có cùng nội dung | Canonical luôn trỏ về `https://kusshoes.kietta.me` |

## 2. Cách hoạt động (cho dev)

- **`FE/src/seo/pages.ts`** là nơi duy nhất khai báo các trang public (title/description tiếng Việt và tiếng Anh) và các đường dẫn private bị chặn cào.
- **`FE/vite-plugin-seo.ts`** chạy lúc `npm run build`:
  - Điền thẻ SEO vào `index.html` (trang chủ).
  - Sinh `dist/<route>.html` cho từng trang public khác (`products.html`, `pricing.html`, ...).
  - Sinh `dist/sitemap.xml` và `dist/robots.txt`.
- **`FE/vercel.json`** rewrite `/pricing` → `/pricing.html` (và các trang khác) trước rule SPA catch-all. `FE/nginx.conf` làm tương tự bằng `try_files $uri.html`.
- **`FE/src/seo/useDocumentMeta.ts`** cập nhật title/description/canonical/`<html lang>` khi chuyển trang trong app hoặc đổi ngôn ngữ.

**Thêm một trang public mới:**
1. Thêm entry vào `SEO_PAGES`.
2. Thêm rewrite tương ứng vào `vercel.json`.

Test `src/seo/seo.test.ts` sẽ fail nếu thiếu rewrite hoặc description dài quá 160 ký tự.

## 3. Việc cần làm thủ công sau khi deploy

### 3.1 Kiểm tra sau deploy
```bash
curl -s https://kusshoes.kietta.me/robots.txt                 # phải là text, có dòng "Sitemap:"
curl -s https://kusshoes.kietta.me/sitemap.xml | head          # phải là XML
curl -s https://kusshoes.kietta.me/pricing | grep -E "<title>|canonical"   # title riêng của trang Bảng giá
```

### 3.2 Xác minh domain trong Google Search Console
Nên dùng loại **Domain** (bao trùm mọi subdomain và cả http/https).
1. Vào <https://search.google.com/search-console> → **Thêm tài sản** → **Miền (Domain)** → nhập `kietta.me` (hoặc `kusshoes.kietta.me`).
2. Google cấp một bản ghi TXT `google-site-verification=...`.
3. Namecheap → `kietta.me` → **Advanced DNS** → **Add new record** → loại **TXT**, Host `@` (hoặc `kusshoes` nếu xác minh subdomain), Value là chuỗi Google cấp.
4. Đợi vài phút rồi bấm **Xác minh**.

**Cách khác (loại URL prefix `https://kusshoes.kietta.me/`, xác minh bằng thẻ HTML):**
1. Chép giá trị `content` của thẻ meta mà Google cấp.
2. Vercel → Project → **Settings → Environment Variables**, thêm `VITE_GOOGLE_SITE_VERIFICATION=<giá trị>` cho Production.
3. Redeploy. Plugin build sẽ tự chèn thẻ `google-site-verification`.

### 3.3 Gửi sitemap và yêu cầu index
1. Search Console → **Sơ đồ trang web** → nhập `https://kusshoes.kietta.me/sitemap.xml` → **Gửi**.
2. **Kiểm tra URL** → nhập `https://kusshoes.kietta.me/` → **Kiểm tra URL trực tiếp**. Xem ảnh chụp để chắc Googlebot render ra trang chủ.
3. Bấm **Yêu cầu lập chỉ mục**.
4. Lặp lại bước 2–3 cho `/products` và `/pricing`.

### 3.4 Chuyển hướng domain cũ
Vercel → Project → **Settings → Domains**: với `kusshoes.vercel.app` (và mọi domain phụ khác), chọn **Redirect to** `kusshoes.kietta.me` (308). Canonical đã xử lý trùng lặp nội dung, nhưng redirect gom tín hiệu nhanh và dứt khoát hơn.

Kiểm tra backend có `PUBLIC_WEB_URL=https://kusshoes.kietta.me` (CORS và Google login dùng biến này).

### 3.5 Tạo link trỏ về (giúp Google phát hiện nhanh hơn)
- Điền `https://kusshoes.kietta.me` vào mục **Website** của repo GitHub.
- Thêm link vào trang Google Play của ứng dụng KusShoes.
- Chia sẻ trên Facebook/LinkedIn.

## 4. Thời gian dự kiến

Sau khi gửi sitemap và yêu cầu index, trang chủ thường xuất hiện với `site:kusshoes.kietta.me` trong **vài ngày đến 1–2 tuần**. Theo dõi tại Search Console → **Trang (Pages)**.

Trạng thái "Đã phát hiện – hiện chưa được lập chỉ mục" là bình thường với domain mới, chỉ cần chờ thêm.

## 5. Giới hạn hiện tại

- Nội dung tiếng Việt và tiếng Anh dùng chung một URL. Ngôn ngữ được chọn theo trình duyệt, nên Googlebot (tiếng Anh) sẽ index bản tiếng Anh. HTML tĩnh ban đầu là tiếng Việt.
- Muốn xếp hạng tốt cho truy vấn tiếng Việt thì về sau cần URL riêng cho mỗi ngôn ngữ (ví dụ `/en/...`) kèm `hreflang`.
