# Hướng Dẫn Thiết Lập & Kết Nối Local (FE - BE)

Tài liệu này hướng dẫn cách kết nối dự án Frontend (FE) hiện tại với hệ thống Backend (BE) bao gồm cả Web Editor (Studio) khi chạy ở môi trường local, giúp tránh lỗi vòng lặp đăng nhập (Infinite Redirect Loop) hoặc lỗi Cookie (CORS).

## 1. Cấu hình phía Frontend (FE)

Mặc định, code FE đã được thiết lập để tự động kết nối đến:
- **Backend API:** `http://localhost:8000`
- **Web Editor (Studio):** `http://localhost:5180`

Bạn **không cần** phải tạo file `.env` nếu BE chạy đúng các port mặc định này. 
*Lưu ý:* Nếu BE chạy ở port khác, bạn cần tạo file `.env` ở thư mục gốc của FE (`/KusShoes/FE/.env`):
```env
VITE_API_BASE_URL=http://localhost:8000
VITE_EDITOR_BASE_URL=http://localhost:5180
```

## 2. Cấu hình phía Backend (BE)

Khi một thành viên khác pull repository BE (`ar-ai-exe`) về máy, họ **BẮT BUỘC** phải làm các bước sau để môi trường local chạy được trơn tru, không bị lỗi chắp vá:

### Bước 2.1: Cấu hình biến môi trường `.env`
Nếu họ chưa có, hãy copy file `deploy/backend.dev.env.example` thành `deploy/backend.dev.env`.

**SỬA LỖI CORS (Nguyên nhân gây vòng lặp đăng nhập):**
Mở file `BE/ar-ai-exe/deploy/backend.dev.env` và tìm biến `CORS_ORIGINS`. Bắt buộc phải bổ sung port `5180` vào danh sách để Web Editor không bị chặn khi xác thực danh tính:
```env
CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173","http://localhost:5180","http://127.0.0.1:5180","http://localhost:3000","http://127.0.0.1:3000","http://localhost:80"]
```
*(Giải thích lỗi: Nếu không có `5180`, Web Editor sẽ bị lỗi CORS không đọc được tài khoản người dùng -> đá ngược về trang Login của FE -> FE thấy đã đăng nhập lại đẩy sang Web Editor -> tạo thành vòng lặp vô tận).*

**Sau khi sửa biến môi trường, nhớ chạy lệnh:**
```bash
docker compose -f docker-compose.dev.yml up -d backend
```

### Bước 2.2: Sửa Code Web Editor để nhận diện FE
Web Editor (nằm trong thư mục `BE/ar-ai-exe/frontend`) cần biết đường link của FE để trả người dùng về trang đăng nhập nếu phiên bản bị lỗi hoặc hết hạn.
Mở file `BE/ar-ai-exe/frontend/src/App.tsx`, đảm bảo URL chuyển hướng là `localhost:5173`:
```typescript
const MARKETING_LOGIN_URL = import.meta.env.VITE_MARKETING_LOGIN_URL ?? "http://localhost:5173/login";
```

### Bước 2.3: Đồng nhất Hostname để tránh lỗi Cookie chéo
Trong file `BE/ar-ai-exe/frontend/src/api/runtimeConfig.ts`, để tránh việc FE dùng `localhost` mà BE lại gọi API bằng `127.0.0.1` (gây mất cookie đăng nhập), hãy sửa biến `DEFAULT_API_BASE_URL` để nó linh hoạt lấy theo hostname trình duyệt hiện tại:
```typescript
let envBaseUrl = import.meta.env.VITE_API_BASE_URL;
if (!envBaseUrl || envBaseUrl.includes("localhost") || envBaseUrl.includes("127.0.0.1")) {
  envBaseUrl = `http://${window.location.hostname}:8000`;
}
const DEFAULT_API_BASE_URL = envBaseUrl;
```

## 3. Lưu ý sống còn khi truy cập trên Trình Duyệt

Để cơ chế Cookie (`SameSite=Lax`) hoạt động trơn tru chia sẻ giữa các port (5173 của FE, 5180 của Studio FE, 8000 của BE API), bạn **PHẢI LUÔN LUÔN DÙNG `localhost`** thay vì `127.0.0.1` khi mở trình duyệt.

- ✅ **ĐÚNG:** Gõ `http://localhost:5173/login` vào thanh địa chỉ.
- ❌ **SAI:** Gõ `http://127.0.0.1:5173/login` (Trình duyệt sẽ chặn không gửi Cookie đăng nhập chéo sang `localhost:5180` và `localhost:8000`).
