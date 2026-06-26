# Quy tắc phát triển Dự án FE_Refactor (React + Vite + TypeScript)

Chào Antigravity! Dưới đây là các quy tắc và nguyên tắc phát triển cho dự án này. Hãy luôn tuân thủ để đảm bảo code sạch, chất lượng cao và giao diện ấn tượng.

## 1. Kiến trúc dự án
- Sử dụng cấu trúc thư mục React tiêu chuẩn:
  - `src/components/`: Các UI component có thể tái sử dụng (Buttons, Input, Card, Modal, v.v.).
  - `src/pages/` hoặc `src/views/`: Các trang chính tương ứng với các route.
  - `src/styles/`: Các file style chung, chứa CSS variables cho Design System (`variables.css`, `index.css`).
  - `src/hooks/`: Các custom React hooks.
  - `src/utils/`: Các hàm tiện ích dùng chung.
  - `src/assets/`: Hình ảnh, icons, font chữ.

## 2. Tiêu chuẩn UI/UX & Styling
- **Aesthetics First**: Ưu tiên tính thẩm mỹ sang trọng, hiện đại, sử dụng bảng màu HSL hài hòa, chế độ Dark Mode tinh tế nếu cần thiết.
- **Micro-animations**: Thêm các tương tác nhỏ khi hover, active, transition mượt mà để giao diện "sống động".
- **Styling**: Sử dụng **Vanilla CSS** kết hợp với **CSS Modules** (`[component].module.css`) để tránh xung đột tên class.
  - Định nghĩa màu sắc, font size, khoảng cách (spacing) trong `src/styles/variables.css` dưới dạng CSS custom properties (`--color-primary`, `--border-radius-lg`, v.v.).
- **Không dùng placeholder**: Sử dụng hình ảnh chất lượng cao hoặc mô phỏng SVG chuyên nghiệp, không để trống hoặc dùng text tạm bợ.

## 3. Quy chuẩn TypeScript & React
- Định nghĩa kiểu (types hoặc interfaces) rõ ràng cho props và dữ liệu API. Tránh sử dụng `any`.
- Sử dụng Functional Components với Arrow Functions.
- Quản lý state cục bộ hiệu quả bằng `useState`, `useReducer`. Đối với state toàn cục, hãy sử dụng **Zustand** (nếu dự án mở rộng).

## 4. Quy trình làm việc với User
- Đi qua từng bước rõ ràng: Luồng người dùng -> Thiết kế UI/UX -> Phát triển cấu trúc -> Code chi tiết -> Kiểm thử/Refactor.
- Tạo hoặc cập nhật `walkthrough.md` sau khi hoàn thành mỗi tính năng lớn.
