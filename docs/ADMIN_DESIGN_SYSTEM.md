# KusShoes Admin Design System & UI/UX Standards
> **Tài liệu đặc tả thiết kế giao diện chuẩn mực cho toàn bộ hệ thống quản trị (Admin Portal)**  
> **Phiên bản:** 1.0.0 | **Ngày ban hành:** 25/09/2026 | **Dự án:** KusShoes (EXE201)

---

## 1. Triết lý Thiết kế (Design Philosophy)

Hệ thống quản trị Admin của KusShoes là nơi làm việc chuyên sâu với dữ liệu vận hành, dòng tiền, giao dịch và hạ tầng kỹ thuật. Mọi màn hình thuộc phân hệ Admin phải tuân thủ nghiêm ngặt 4 nguyên tắc cốt lõi:

1. **Trang nghiêm & Dữ liệu là trung tâm (Solemn & Data-First):**
   - Màu sắc trung tính, tinh tế, loại bỏ hoàn toàn các hiệu ứng trang trí thừa thãi như glow neon, gradient bóng bẩy hoặc hiệu ứng đồ họa giải trí.
   - Ưu tiên tính minh bạch, hiển thị số liệu chính xác theo quy chuẩn kiểm toán kế toán (BR-105 ~ BR-108, SF-14).
2. **Hạn chế tối đa Icon (Icon Minimalist):**
   - Không dùng icon cho mục đích trang trí thuần túy hoặc đặt cạnh mọi dòng chữ.
   - Chỉ dùng icon ở những nơi thực sự thiết yếu: điều hướng chính của Sidebar, thao tác bảng (Sửa/Xóa), hoặc mũi tên tăng/giảm xu hướng (▲ / ▼).
   - Thay thế icon bằng các nhãn (labels), thẻ badge phân loại rõ ràng, và typography có thứ bậc.
3. **Minh bạch & Giải trình số liệu (Data Transparency & Auditability):**
   - Mọi số liệu tổng hợp (KPI, Hero Cards, Metric Cards, Charts) phải cho phép người dùng click để mở modal giải trình (Audit Modal): giải thích công thức tính, nguồn bảng cơ sở dữ liệu và căn cứ quy chuẩn.
4. **Chuẩn mực biểu đồ tài chính (Financial Chart Rigor):**
   - Biểu đồ phải có hệ trục tọa độ (X/Y) rõ ràng, vạch chia nhỏ (*tick marks*), lưới ngang (*gridlines*), nhãn đơn vị tính và đường dóng tham chiếu (*benchmark*).
   - Kích thước vừa vặn (*compact*), không kéo dãn khổng lồ gây cảm giác rỗng và loãng thông tin.

---

## 2. Quy chuẩn Typography (Typography Standard)

Toàn bộ phân hệ Admin sử dụng họ phông chữ **Roboto** làm font chữ tiêu chuẩn, kết hợp font **Monospace** cho các trường mã định danh và số liệu tài chính.

### 2.1. Font Families
```css
/* Biến định nghĩa trong variables.css */
--font-admin: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
--font-mono: 'JetBrains Mono', 'Roboto Mono', Menlo, Consolas, monospace;
```

### 2.2. Phân cấp cỡ chữ & Độ đậm (Scale & Weights)
- **Tiêu đề trang (Page Title):** `1.50rem` (24px) | `font-weight: 800` | Roboto
- **Tiêu đề phân mục (Section Title):** `0.92rem` (14.7px) | `font-weight: 700` | Chữ in hoa (*uppercase*) | Letter-spacing: `0.7px`
- **Tiêu đề thẻ/Biểu đồ (Card Title):** `0.94rem` (15px) | `font-weight: 700` | Roboto
- **Số liệu Hero KPI:** `1.55rem` (25px) | `font-weight: 800` | `font-variant-numeric: tabular-nums`
- **Số liệu Metric Card:** `1.25rem` (20px) | `font-weight: 800` | `font-variant-numeric: tabular-nums`
- **Body / Label:** `0.80rem` ~ `0.85rem` | `font-weight: 500` - `600`
- **Nhãn phụ / Chú thích (Caption/Subtext):** `0.72rem` ~ `0.76rem` | `font-weight: 500` | Text secondary

> [!IMPORTANT]
> **Định dạng số liệu bảng tính:** Mọi con số tài chính, số lượng và phần trăm bắt buộc phải áp dụng thuộc tính `font-variant-numeric: tabular-nums;` để các chữ số có độ rộng đồng đều, không bị thụt thò khi cập nhật dữ liệu.

---

## 3. Hệ thống Màu sắc & Theme (Color Tokens & Theming)

Hệ thống hỗ trợ 2 chế độ **Dark Mode (mặc định)** và **Light Mode** với độ tương phản cao, bảo vệ mắt và hiển thị sắc nét các viền chia khối.

### 3.1. Bảng màu Semantic Tokens

| Vai trò Token | Dark Mode | Light Mode | Ứng dụng thực tế |
| :--- | :--- | :--- | :--- |
| `--bg-primary` | `#0B0F19` | `#F8FAFC` | Nền tổng thể của trang Admin |
| `--bg-secondary` | `#111827` | `#FFFFFF` | Nền của các thẻ (Card, Modal, Chart box) |
| `--bg-tertiary` | `#1E293B` | `#F1F5F9` | Nền input, dải thống kê, thanh track tỷ trọng |
| `--glass-border` | `rgba(255,255,255,0.08)` | `rgba(0,0,0,0.10)` | Đường viền ngăn cách khối, trục biểu đồ, vạch lưới |
| `--text-primary` | `#F8FAFC` | `#0F172A` | Tiêu đề, số liệu chính, nhãn quan trọng |
| `--text-secondary`| `#94A3B8` | `#475569` | Nhãn phụ, tiêu đề cột, chỉ số tham chiếu |
| `--text-muted` | `#64748B` | `#64748B` | Đơn vị tiền tệ, chú thích điều khoản |
| **Xanh tài chính** | `#3B82F6` | `#2563EB` | Cột doanh thu, nút hành động chính, tỷ trọng gói |
| **Xanh lá tăng trưởng**| `#10B981` | `#16A34A` | Dòng tiền vào (+), xu hướng tăng (▲), Net New dương |
| **Đỏ chi phí/giảm** | `#EF4444` | `#DC2626` | Dòng tiền ra (-), xu hướng giảm (▼), thanh toán lỗi |
| **Hổ phách chuẩn** | `#F59E0B` | `#D97706` | Đường tham chiếu trung bình (Benchmark Line), cảnh báo |

### 3.2. Cấu hình Color Scheme Trình duyệt
Bắt buộc khai báo `color-scheme` để các popup lịch (`<input type="date">`) và dropdown hệ thống hiển thị đúng theme:
```css
:root {
  color-scheme: dark;
}
[data-theme="light"] {
  color-scheme: light;
}
```

---

## 4. Đặc tả Khối Điều khiển & Chọn Ngày (Header Date Range & Controls)

Mọi trang có dữ liệu theo kỳ đối soát (Analytics, Transactions, Invoices) phải áp dụng mẫu điều khiển chuẩn ở góc trên bên phải header:

```
[ Kỳ đối soát: | YYYY-MM-DD | — | YYYY-MM-DD | [ 30 ngày ] ]  [ Nút Preset: 7N | 30N | Quý | Năm ]  [ [Làm mới] ]
```

### 4.1. Quy tắc Xác thực & Đồng bộ (Validation & Sync Rules)
1. **Ràng buộc ngày:**
   - Ngày bắt đầu (`startDate`) không được lớn hơn ngày kết thúc (`endDate`).
   - Ngày kết thúc (`endDate`) không được vượt quá ngày hiện tại (`today`).
2. **Tag đếm ngày:** Tự động tính toán `days = (endDate - startDate) + 1` và hiển thị nhãn `{days} ngày`.
3. **Đồng bộ Preset:** Khi người dùng bấm các nút preset (`7 ngày`, `30 ngày`, `Quý này`, `Năm nay`), 2 ô date input phải tự động nhảy đến mốc tương ứng và highlight preset đang chọn.
4. **Phụ đề báo cáo:** Khi xuất file Excel/CSV/PDF, phụ đề báo cáo phải ghi rõ khoảng ngày đối soát thực tế đã chọn.

---

## 5. Quy chuẩn Biểu đồ Tài chính (Financial Chart Standards)

Biểu đồ trên trang Admin KusShoes tuân theo quy chuẩn biểu đồ phân tích tài chính/kiểm toán (tương tự tiêu chuẩn Stripe Dashboard & Bloomberg Terminal):

### 5.1. Biểu đồ Doanh thu chu kỳ tháng (`MrrAreaChart.tsx`)
- **Dạng thức mặc định:** **Cột tài chính (Column Chart)** vì doanh thu theo chu kỳ tháng là biến số rời rạc của từng kỳ kế toán độc lập.
- **Tùy chọn chế độ xem:** Cung cấp toggle chuyển đổi nhanh giữa `[ Cột tài chính ]` và `[ Đường xu hướng ]`.
- **Trục Y bên trái (Left Value Axis):**
  - Có đường trục tung dọc 1.5px và các vạch chia nhỏ (*tick marks*) 4px.
  - Sử dụng thuật toán chia bước số tròn đẹp (*Wilkinson Nice Numbers*): tạo ra 4-5 mốc tròn số dễ đọc (ví dụ: `0 đ`, `5 tr`, `10 tr`, `15 tr` hoặc `2M`, `4M`...).
  - Đơn vị tính: Nhãn `(Đơn vị: VNĐ)` đặt ở góc trên bên trái trục Y.
  - Đường lưới ngang nét đứt mỏng (`strokeDasharray="3 3"`).
- **Trục X ở đáy (Bottom Time Axis):**
  - Đường baseline 1.5px, vạch tick mark dưới mỗi tháng, nhãn tháng căn giữa chính xác (`T05`, `T06`...).
- **Độ rộng cột:** Cân đối, tối đa `38px`, không bị kéo dãn khổng lồ trên màn hình rộng.
- **Đường tham chiếu trung bình (Benchmark Line):**
  - Đường nét đứt màu hổ phách (`#F59E0B`) cắt ngang các cột với nhãn `TB: [giá trị]`.
- **Thanh tóm tắt nhanh trên đầu biểu đồ:**
  - 4 ô chỉ số tài chính gọn gàng: `Tổng kỳ`, `Bình quân tháng`, `Đạt đỉnh (Max)`, `Thấp nhất (Min)`.

### 5.2. Biểu đồ Thác nước Biến động MRR (`MrrWaterfallChart.tsx`)
- **Hệ trục tọa độ:**
  - **Trục Y (VNĐ):** Có vạch chia mốc, đường baseline `0 VNĐ` rõ ràng phân tách miền giá trị dương và âm.
  - **Trục X:** 6 bước chuyển dịch dòng tiền:
    1. `Khách mới (+)`: Cột tăng từ 0 lên `+new`
    2. `Nâng gói (+)`: Cột tăng tiếp từ đỉnh bước 1 lên `+expansion`
    3. `Kích hoạt (+)`: Cột tăng tiếp từ đỉnh bước 2 lên `+reactivation`
    4. `Hạ gói (-)`: Cột giảm từ đỉnh bước 3 xuống `-contraction`
    5. `Rời bỏ (-)`: Cột giảm từ đỉnh bước 4 xuống `-churn`
    6. `Net New (Ròng)`: Cột tổng kết ròng từ mức 0 đến kết quả cuối cùng
- **Đường dóng nối (Waterfall Connectors):** Nét đứt nối từ đỉnh/đáy của bước trước sang chân của bước kế tiếp.
- **Dải tóm tắt đối soát 1 dòng:** `Dòng tiền vào (+)` | `Dòng tiền ra (-)` | `Net New MRR` | `Khả năng bù đắp (%)`.

### 5.3. Biểu đồ Phân bổ tỷ trọng (`HorizontalBarList.tsx`)
- Dùng cho *Cơ cấu doanh thu theo gói* và *Theo phương thức thanh toán*.
- Bố cục từng hàng:
  - Tên danh mục bên trái.
  - Số tiền định dạng `tabular-nums` + Thẻ badge phần trăm (`xx.x%`) ở bên phải.
  - Thanh đo tỷ trọng chắc chắn (`height: 7px`), có viền `1px solid var(--glass-border)`.

---

## 6. Quy chuẩn Hiệu ứng Tải dữ liệu (Loading State Standard)

Không để khoảng trống rỗng hoặc dấu gạch tĩnh `—` khi hệ thống đang xử lý hoặc tải API. Toàn bộ ô và khung dữ liệu phải sử dụng **Hiệu ứng Ba chấm lên xuống (3-Dot Bouncing Animation)**.

### 6.1. Component Tiêu chuẩn: `ThreeDotsLoader`
Được đặt tại: `src/components/Admin/ThreeDotsLoader.tsx`.

#### Cách sử dụng cho ô số liệu (Inline Loader):
```tsx
import { ThreeDotsLoader } from '../../../components/Admin/ThreeDotsLoader';

/* 1. Dành cho số liệu chính cỡ lớn (MRR, Doanh thu, AR...) */
<div className={styles.heroValue}>
  {loading ? <ThreeDotsLoader size="md" /> : formatVnd(data.amount)}
</div>

/* 2. Dành cho số liệu phụ / footer nhỏ (ARR, ARPU, Tỷ lệ...) */
<span>ARR: {loading ? <ThreeDotsLoader size="sm" /> : formatVnd(data.arr)}</span>
```

#### Cách sử dụng cho khung Biểu đồ / Bảng dữ liệu (Block Loader):
```tsx
import { ThreeDotsBlockLoader } from '../../../components/Admin/ThreeDotsLoader';

{loading ? (
  <ThreeDotsBlockLoader text="Đang tải dữ liệu chuỗi doanh thu..." minHeight={200} />
) : (
  <MrrAreaChart points={...} />
)}
```

### 6.2. Thông số Kỹ thuật CSS Animation
```css
@keyframes threeDotsBounce {
  0%, 80%, 100% {
    transform: translateY(0);
    opacity: 0.3;
  }
  40% {
    transform: translateY(-6px);
    opacity: 1;
  }
}

.dot {
  border-radius: 50%;
  background-color: currentColor;
  animation: threeDotsBounce 1.2s infinite ease-in-out both;
}
.dot:nth-child(1) { animation-delay: -0.32s; }
.dot:nth-child(2) { animation-delay: -0.16s; }
.dot:nth-child(3) { animation-delay: 0s; }
```

---

## 7. Cửa sổ Giải trình & Kiểm toán Số liệu (Audit Detail Modal)

Khi người dùng nhấn vào bất kỳ thẻ chỉ số hoặc biểu đồ nào, hệ thống phải kích hoạt modal giải trình chi tiết:

### 7.1. Cấu trúc Modal tiêu chuẩn
1. **Header Modal:**
   - Mã nghiệp vụ / Quy chuẩn kiểm toán (ví dụ: `REV-01`, `BR-105`, `SF-14`).
   - Tiêu đề chỉ số và giá trị hiện tại của kỳ đối soát.
2. **Thân Modal (Body):**
   - **Nguồn dữ liệu đối soát (Data Source):** Liệt kê các bảng Database, điều kiện lọc SQL (loại trừ tài khoản nội bộ, trừ gói COMP).
   - **Công thức tính toán (Formula):** Trình bày công thức toán học tường minh.
   - **Bảng đối chiếu / Chi tiết giao dịch (Breakdown):** Bảng số liệu con cấu thành con số tổng.
3. **Thẻ Badge trên Card:**
   - Mọi card có thể click mở modal phải có badge: `<span className={styles.cardClickBadge}>Chi tiết đối soát</span>`.

---

## 8. Danh mục Checklist Kiểm tra khi Tạo Trang Admin Mới

Trước khi nghiệm thu bất kỳ trang Admin mới nào (Quản lý User, Quản lý Đơn hàng, Quản lý Phôi giày, Cấu hình Hệ thống...), lập trình viên phải đối chiếu checklist:

- [ ] Phông chữ hiển thị là **Roboto**, số liệu tiền tệ/đếm sử dụng `tabular-nums`.
- [ ] Không có icon trang trí không cần thiết; các nút hành động sử dụng nhãn chữ rõ nghĩa.
- [ ] Mọi số liệu có trạng thái loading đều dùng `ThreeDotsLoader` hoặc `ThreeDotsBlockLoader`.
- [ ] Bộ lọc ngày tuân thủ cấu trúc header controls với preset và nhãn `{days} ngày`.
- [ ] Biểu đồ (nếu có) phải có trục tung Y bên trái, trục hoành X ở đáy, mốc số tròn, và chiều cao chuẩn (~200px).
- [ ] Đã kiểm tra độ tương phản và hiển thị hoàn hảo ở cả **Dark Mode** và **Light Mode**.
- [ ] Số liệu quan trọng có hỗ trợ click xem giải trình công thức và nguồn dữ liệu.
