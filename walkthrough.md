# Walkthrough: Cập nhật & Thiết kế lại giao diện dự án

Tài liệu này ghi lại các chỉnh sửa giao diện và tính năng mới được triển khai trong hai trang: **Billing & Subscription** và **Project Directory**.

---

## 📅 Trang 1: Billing & Subscription (Cập nhật ở Iteration 2)

### 1. Bố cục Lưới đối xứng 2x2
- **Mô tả:** Chuyển đổi sang lưới 2 cột, 2 hàng đối xứng hoàn hảo (`display: grid` với `grid-template-columns: 1fr 1fr`).
- **Gutter:** Khoảng cách giữa các thẻ (`gap`) được căn chỉnh đồng bộ ở mức **32px** cả chiều ngang lẫn chiều dọc.
- **Sắp xếp các thẻ:**
  - **Top-Left (Hàng 1, Cột 1):** Active Plan Card
  - **Top-Right (Hàng 1, Cột 2):** Invoice History Table Card
  - **Bottom-Left (Hàng 2, Cột 1):** Billing Details Card
  - **Bottom-Right (Hàng 2, Cột 2):** Cloud Quota Usage Card
- **Sự cân bằng:** Bỏ thuộc tính `align-items: start` để các thẻ trong cùng một hàng tự động kéo dài (`stretch`) bằng nhau, tạo ra các đường phân tách cực kỳ gọn gàng và chuyên nghiệp.

### 2. Top-Left Card (Active Plan) & Cancellation UX
- **Micro-copy:** Dòng chữ cảnh báo hủy gói *"Access remains active until the next billing date."* đã được thiết lập thuộc tính `white-space: nowrap` để hiển thị trên **một hàng ngang duy nhất**.

### 3. Top-Right Card (Invoice History) Action Gap
- **Action Column:** Căn chỉnh nút xem hóa đơn nhanh (Chỉ hiển thị icon con mắt `Eye` thay vì chữ) và nút văn bản `Download`.
- **Khoảng cách:** Đặt khoảng cách chiều ngang chính xác **12px** (`gap: 12px`) giữa icon xem nhanh và chữ "Download".

### 4. Bottom-Left Card (Billing Details) Label Styling
- **Labels:** Các thẻ nhãn được chuyển sang dạng in hoa hoàn toàn: `COMPANY NAME`, `BILLING ADDRESS`, và `TAX ID`.
- **Styling:** Tăng độ đậm (`font-weight: 700`) và độ tương phản màu (`color: var(--text-primary)`) để đồng nhất độ nổi bật với tiêu đề các thẻ khác.

### 5. Bottom-Right Card (Cloud Quota Usage)
- **Đơn vị & Dữ liệu:**
  - **Cloud Storage:** Hiển thị đúng đơn vị dung lượng: `1.4 GB of 5.0 GB used (28%)`.
  - **High-def Shoe Scans:** Hiển thị `25 / 50 used (50%)`.
  - **3D Web Previews:** Hiển thị `8 / 20 used (40%)`.
- **Bottom rows:** Hai dòng thông số dưới cùng ("Active Scans Sync Limit" và "Monthly Scan Processings") có chung thiết kế in đậm nhất quán (`font-weight: 700` và `color: var(--text-primary)`).

---

## 📂 Trang 2: Project Directory (Danh sách dự án 3D)

### 1. Contrast & Visibility (Độ tương phản ảnh thu nhỏ)
- **Mô tả:** Thêm một lớp phủ gradient tối (`topOverlay`) ở mép trên cùng của thumbnail hình ảnh giày.
- **Mục đích:** Đảm bảo checkbox màu trắng và các nút công cụ luôn hiển thị rõ ràng trên cả nền ảnh sáng nhất lẫn tối nhất.
- **Tệp chỉnh sửa:**
  - Component: [Projects.tsx](file:///E:/FPTU/Semester-7/EXE/FE_Refactor/src/pages/Projects/Projects.tsx)
  - Styles: [Projects.module.css](file:///E:/FPTU/Semester-7/EXE/FE_Refactor/src/pages/Projects/Projects.module.css)

### 2. Typography Clamping (Tên dự án dài)
- **Mô tả:** Cho phép tên dự án dài tự động xuống dòng và hiển thị tối đa 2 dòng trước khi cắt bằng dấu ba chấm (`...`). Chiều cao tiêu đề được cố định (`height: 2.86rem`) để các thẻ trong lưới luôn thẳng hàng.
- **Tệp chỉnh sửa:**
  - Styles: [Projects.module.css](file:///E:/FPTU/Semester-7/EXE/FE_Refactor/src/pages/Projects/Projects.module.css)

### 3. Interactive Cards (Tương tác toàn thẻ)
- **Clickable:** Toàn bộ thẻ dự án hiện có thể nhấp vào được để kích hoạt chi tiết dự án.
- **Inspect Drawer:** Loại bỏ nút liên kết cam "Inspect Drawer >" thống trị trước đây để đơn giản hóa giao diện.
- **Hover State:** Thêm hiệu ứng nâng thẻ theo trục Y (`transform: translateY(-8px)`) và đổ bóng sâu mờ ảo đi kèm viền phát sáng cam thương hiệu (`var(--border-glow)`). Loại bỏ các hiệu ứng đẩy thẻ lân cận gây méo lưới.
- **Tệp chỉnh sửa:**
  - Component: [Projects.tsx](file:///E:/FPTU/Semester-7/EXE/FE_Refactor/src/pages/Projects/Projects.tsx)
  - Styles: [Projects.module.css](file:///E:/FPTU/Semester-7/EXE/FE_Refactor/src/pages/Projects/Projects.module.css)

### 4. Bulk Actions Floating Action Bar (Thanh FAB thao tác hàng loạt)
- **Mô tả:** Thiết kế thanh công cụ nổi (FAB) cố định ở giữa dưới cùng màn hình (`position: fixed`). FAB chỉ xuất hiện khi có ít nhất một checkbox dự án được chọn.
- **Tính năng & Giao diện:**
  - Hiển thị số lượng dự án đang chọn (Ví dụ: `3 selected`).
  - Nút **Change Status** mở ra menu lựa chọn trạng thái: *Scanned*, *Designing*, *Completed* trực tiếp cho các dự án đã chọn.
  - Nút **Delete** để xóa hàng loạt dự án được chọn.
  - Nút **Cancel** hình chữ `X` để bỏ chọn tất cả.
  - **Giao diện Light Mode:** Nền kính mờ trắng đục (`rgba(255, 255, 255, 0.9)`), đổ bóng lơ lửng (`box-shadow: 0px 8px 24px rgba(0,0,0,0.12)`), chữ và biểu tượng màu xám đậm tương phản cao (`#1F2937`).
  - **Chỉ báo nổi bật:** Biểu tượng checkbox và text số lượng chọn sử dụng màu cam thương hiệu (`var(--color-orange)`).
  - **Trạng thái nút:** Nút "Change Status" và "Delete" dạng ghost button. Nút "Delete" có màu đỏ dịu phá hủy (`var(--color-crimson)`).
  - **Khung viền:** Viền mảnh xám nhạt (`1px solid rgba(18, 18, 21, 0.08)`) giúp tách biệt rõ ràng trên nền sáng.
  - **Tương thích chủ đề:** Tự động phản hồi sang giao diện tối qua bộ chọn CSS `[data-theme="dark"]`.
- **Tệp chỉnh sửa:**
  - Component: [Projects.tsx](file:///E:/FPTU/Semester-7/EXE/FE_Refactor/src/pages/Projects/Projects.tsx)
  - Styles: [Projects.module.css](file:///E:/FPTU/Semester-7/EXE/FE_Refactor/src/pages/Projects/Projects.module.css)

### 5. Kebab Menu Decluttering (Thu gọn menu ba chấm)
- **Mô tả:** Loại bỏ thẻ hiển thị trạng thái riêng tư trực tiếp trên ảnh (Public/Private/Link) để giảm tải nhiễu thị giác.
- **Giải pháp:** Chuyển đổi các cấu hình quyền riêng tư này vào bên trong menu Kebab (3 dấu chấm) với các nút chọn: *Private*, *Link Share*, *Public Showcase*.
- **Tệp chỉnh sửa:**
  - Component: [Projects.tsx](file:///E:/FPTU/Semester-7/EXE/FE_Refactor/src/pages/Projects/Projects.tsx)
  - Styles: [Projects.module.css](file:///E:/FPTU/Semester-7/EXE/FE_Refactor/src/pages/Projects/Projects.module.css)

### 6. Minimalist Pagination (Phân trang tối giản)
- **Mô tả:** Thêm thanh phân trang tối giản (Previous, 1, 2, 3, Next) ở dưới cùng của lưới dự án để phân chia dữ liệu hợp lý.
- **Tệp chỉnh sửa:**
  - Component: [Projects.tsx](file:///E:/FPTU/Semester-7/EXE/FE_Refactor/src/pages/Projects/Projects.tsx)
  - Styles: [Projects.module.css](file:///E:/FPTU/Semester-7/EXE/FE_Refactor/src/pages/Projects/Projects.module.css)

---

## 🧭 Trang 3: Sidebar UI Optimization (Tối ưu hóa Thanh điều hướng bên)

### 1. Information Architecture (Cấu trúc thông tin)
- **Mô tả:** Mở rộng danh mục điều hướng chính bằng cách thêm tab **Archives** trực tiếp bên dưới tab **Projects**.
- **Chức năng:** Tab này dẫn đến danh sách các dự án đã hoàn thành (tự động áp dụng bộ lọc status là `Completed`).
- **Tệp chỉnh sửa:**
  - Component: [Sidebar.tsx](file:///E:/FPTU/Semester-7/EXE/FE_Refactor/src/components/Sidebar/Sidebar.tsx)
  - Routing: [App.tsx](file:///E:/FPTU/Semester-7/EXE/FE_Refactor/src/App.tsx)

### 2. Quick Actions (Thao tác nhanh)
- **Mô tả:** Thêm một biểu tượng `+` nhỏ, tinh tế bên phải nhãn tiêu đề "RECENT PROJECTS" (nằm trên cùng một dòng).
- **Chức năng:** Nhấp vào nút này sẽ tự động chuyển hướng người dùng sang trang Projects và kích hoạt modal Wizard khởi tạo dự án mới (`?new=true` trong query string).
- **Tệp chỉnh sửa:**
  - Component: [Sidebar.tsx](file:///E:/FPTU/Semester-7/EXE/FE_Refactor/src/components/Sidebar/Sidebar.tsx)
  - Styles: [Sidebar.module.css](file:///E:/FPTU/Semester-7/EXE/FE_Refactor/src/components/Sidebar/Sidebar.module.css)

### 3. List Spacing & View All (Khoảng cách & Xem tất cả)
- **Mô tả:** Tăng khoảng cách chiều dọc giữa các dự án gần đây (`gap: 8px`) giúp danh sách thoáng đãng và dễ đọc hơn.
- **View all:** Thêm liên kết văn bản "View all" tinh tế ở cuối danh sách để người dùng có thể nhấp nhanh đến danh mục toàn bộ dự án.
- **Tệp chỉnh sửa:**
  - Component: [Sidebar.tsx](file:///E:/FPTU/Semester-7/EXE/FE_Refactor/src/components/Sidebar/Sidebar.tsx)
  - Styles: [Sidebar.module.css](file:///E:/FPTU/Semester-7/EXE/FE_Refactor/src/components/Sidebar/Sidebar.module.css)

### 4. Storage Mini-Widget (Tiện ích lưu trữ)
- **Mô tả:** Thêm một widget lưu trữ tối giản ngay phía trên thông tin tài khoản người dùng ở góc dưới cùng sidebar.
- **Giao diện:** Hiển thị thanh tiến trình mỏng và thông tin văn bản dạng chữ xám nhỏ, độ tương phản dịu mắt: "Storage: 1.4 GB / 5.0 GB" (28%).
- **Tệp chỉnh sửa:**
  - Component: [Sidebar.tsx](file:///E:/FPTU/Semester-7/EXE/FE_Refactor/src/components/Sidebar/Sidebar.tsx)
  - Styles: [Sidebar.module.css](file:///E:/FPTU/Semester-7/EXE/FE_Refactor/src/components/Sidebar/Sidebar.module.css)

---

## 🎨 Phong cách thiết kế & Styling
- Các trang đều tuân thủ nguyên tắc thiết kế **Anti-slop** / **Streetwear Dark/Light System** hiện đại với các thành phần kính mờ (`glass-panel`), hiệu ứng chuyển động Spring mượt mà.
- Đã được kiểm tra qua `oxlint` và biên dịch thành công 100% không lỗi.
