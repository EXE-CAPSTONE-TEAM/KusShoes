# KusShoes Design System

> **Phiên bản:** 1.1 · **Cập nhật:** 2026-09-26
> **Phạm vi:** Web app (Overview, Projects, Archives, Billing, Settings…) và Landing page.
> **Nguồn sự thật:** File này. Khi thiết kế (Stitch, Figma) hoặc code lệch với file này, file này thắng — hoặc cập nhật file này trước rồi mới làm.

---

## Mục lục

1. [Triết lý thiết kế](#1-triết-lý-thiết-kế)
2. [Anti-patterns — những thứ bị cấm](#2-anti-patterns--những-thứ-bị-cấm)
3. [Design tokens](#3-design-tokens)
4. [Layout & lưới](#4-layout--lưới)
5. [Components](#5-components)
6. [Page patterns](#6-page-patterns)
7. [Nội dung & dữ liệu hiển thị](#7-nội-dung--dữ-liệu-hiển-thị)
8. [Trạng thái: loading, empty, error](#8-trạng-thái-loading-empty-error)
9. [Accessibility](#9-accessibility)
10. [Responsive](#10-responsive)
11. [Triển khai trong code](#11-triển-khai-trong-code)
12. [Prompt preamble cho AI design tools](#12-prompt-preamble-cho-ai-design-tools)
13. [Checklist review](#13-checklist-review)
14. [Quyết định còn mở](#14-quyết-định-còn-mở)

---

## 1. Triết lý thiết kế

KusShoes là **công cụ thiết kế giày**, không phải trang marketing và không phải app quản lý dự án. Giao diện phải có cảm giác của một tool chuyên nghiệp — tham chiếu: Figma file browser, Linear, Vercel dashboard.

| Nguyên tắc | Nghĩa là |
|---|---|
| **Phẳng** | Chiều sâu tạo bằng viền 1px và bậc tông nền, không bằng bóng đổ. |
| **Dày thông tin, không chật** | Chữ nhỏ (13px/12px), khoảng cách chặt theo lưới 4px, nhưng mỗi thứ có chỗ của nó. |
| **Nội dung là nhân vật chính** | Hình giày của người dùng là thứ nổi bật nhất trên màn hình. UI lùi lại phía sau. |
| **Một điểm nhấn** | Chỉ một màu accent (cam). Mỗi view tối đa **một** nút primary. |
| **Phân cấp bằng chữ** | Dùng weight và màu chữ để phân cấp, hạn chế tăng cỡ chữ. |
| **Trung thực với dữ liệu** | Chỉ thiết kế những gì backend thật sự có. Không hiển thị enum thô, không bịa số. |

---

## 2. Anti-patterns — những thứ bị cấm

Danh sách này đúc kết từ các vòng thiết kế trước. Gặp một trong những thứ dưới đây trong design hoặc code → sửa.

**Hiệu ứng thị giác**
- ❌ `box-shadow` trên phần tử nằm trong luồng trang (card, button, input, sidebar item). Ngoại lệ duy nhất: lớp nổi — xem [3.6](#36-elevation).
- ❌ Hover nhấc card lên (`translate`, `scale`).
- ❌ Gradient, glow, glassmorphism, `backdrop-filter: blur`.
- ❌ Icon đặt trong ô vuông tô màu (tinted icon box).
- ❌ Badge dạng pill lớn, nhiều màu.
- ❌ Tô màu một chữ trong tiêu đề ("The Creation **Workflow**", "Keep Creating, **Linh**").
- ❌ Font mono dùng để trang trí (tag, badge, timestamp).
- ❌ Bo góc > 8px cho card/control.

**Cấu trúc**
- ❌ Hộp lồng hộp: card có viền chứa các dòng cũng có viền riêng.
- ❌ Vùng cuộn lồng bên trong card (inner scrollbar). Giới hạn số dòng + link "View all".
- ❌ Tiêu đề trang cỡ display (≥ 32px) trong web app.
- ❌ Câu mô tả độn dưới tiêu đề ("Manage, share, and review details of…").
- ❌ Nhiều nút làm cùng một việc trên một màn hình (vd: "Sync Cloud Scan" + "Sync Now").
- ❌ Card chỉ chứa một nút bấm.

**Nội dung**
- ❌ Timestamp ISO thô (`2026-09-24T08:21:58Z`) hoặc có giây.
- ❌ Enum thô (`pro_monthly`, `in_progress`, `baking`).
- ❌ Trạng thái workflow kiểu quản lý dự án (Designing / In Review / Completed) trên **Project**.
- ❌ Thuật ngữ kỹ thuật trên UI người dùng (Photogrammetry Pipeline, AES-256, Retopology) — chuyển vào tài liệu.
- ❌ Số phiên bản/số liệu bịa cho đẹp ("Pipeline 3.0").

**Asset**
- ❌ Ảnh "PNG trong suốt giả" có ô caro in sẵn.
- ❌ Ảnh có nền riêng đặt trong canvas khác màu (tạo ô vuông lồng).

---

## 3. Design tokens

Mọi giá trị trong UI phải lấy từ token. Không hard-code mã màu trong component.

### 3.1 Màu — Light mode

**Nền & bề mặt**

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--bg-page` | `#FAFAFA` | Nền trang |
| `--bg-surface` | `#FFFFFF` | Card, input, control, sidebar |
| `--bg-subtle` | `#F2F2F2` | Canvas thumbnail, item đang chọn, segment active |
| `--bg-hover` | `#F8F8F8` | Hover của item/nút ghost |
| `--bg-subtle-hover` | `#EBEBEB` | Canvas thumbnail khi hover card |

**Viền**

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--border` | `#E5E5E5` | Viền mặc định, divider |
| `--border-strong` | `#CCCCCC` | Viền khi hover card/control |

**Chữ**

| Token | Giá trị | Contrast trên `#FFF` | Dùng cho |
|---|---|---|---|
| `--text-primary` | `#1A1A1A` | 17.4:1 | Tiêu đề, tên, nội dung chính |
| `--text-secondary` | `#6B6B6B` | 5.3:1 | Meta, mô tả, tab inactive |
| `--text-tertiary` | `#737373` | 4.7:1 | Placeholder, count, nhãn phụ |
| `--icon-muted` | `#8A8A8A` | 3.5:1 | **Chỉ icon**, không dùng cho chữ |

**Accent**

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--accent` | `#FF6B35` | Nút primary, outline selected, focus ring, checkbox checked |
| `--accent-hover` | `#F05F2B` | Hover nút primary |
| `--accent-active` | `#DE5523` | Nhấn nút primary |
| `--accent-subtle` | `rgba(255,107,53,0.08)` | Nền filter đang áp dụng |

> ⚠️ Chữ trắng trên `#FF6B35` chỉ đạt **2.8:1** — xem [Quyết định còn mở #1](#14-quyết-định-còn-mở). Không dùng `--accent` làm **màu chữ** cho text dưới 18px.

**Trạng thái (semantic)**

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--success` | `#16A34A` | Ready, Connected |
| `--warning` | `#F59E0B` | Processing, quota 80–95% |
| `--danger` | `#DC2626` | Failed, lỗi, quota > 95% |
| `--info` | `#2563EB` | Thông tin trung tính (hiếm dùng) |
| `--neutral` | `#8A8A8A` | Uploading, Unknown |

Màu trạng thái chỉ xuất hiện dưới dạng **chấm 6px** kèm nhãn chữ, hoặc chữ lỗi 12px. Không làm nền lớn.

### 3.2 Màu — Dark mode

Kích hoạt bằng `data-theme="dark"` trên `<html>` (hoặc bất kỳ thẻ cha nào).

| Token | Light | Dark |
|---|---|---|
| `--bg-page` | `#FAFAFA` | `#0F0F0F` |
| `--bg-surface` | `#FFFFFF` | `#1A1A1A` |
| `--bg-subtle` | `#F2F2F2` | `#222222` |
| `--bg-hover` | `#F8F8F8` | `#222222` |
| `--bg-subtle-hover` | `#EBEBEB` | `#2A2A2A` |
| `--border` | `#E5E5E5` | `#2A2A2A` |
| `--border-strong` | `#CCCCCC` | `#3E3E3E` |
| `--text-primary` | `#1A1A1A` | `#EDEDED` |
| `--text-secondary` | `#6B6B6B` | `#A3A3A3` |
| `--text-tertiary` | `#737373` | `#8A8A8A` |
| `--icon-muted` | `#8A8A8A` | `#737373` |
| `--accent*` | giữ nguyên | giữ nguyên |

Quy tắc dark mode: **không đảo ngược ảnh**, canvas thumbnail dùng `--bg-subtle` (`#222222`), không để mảng trắng lớn giữa nền tối.

### 3.3 Typography

**Font:** `Inter`, fallback `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. Bật `-webkit-font-smoothing: antialiased`. Toàn bộ app một font — không có phần tử nào rơi về font fallback.

**Weight:** chỉ `400` (regular), `500` (medium), `600` (semibold). Không dùng 700+ trong app.

**Thang cỡ chữ — Web app**

| Token | Size / Line-height | Weight | Letter-spacing | Dùng cho |
|---|---|---|---|---|
| `--text-overline` | 11 / 16 | 500 | `0.04em`, uppercase | Nhãn section sidebar ("RECENT PROJECTS") |
| `--text-caption` | 11 / 16 | 400 | 0 | Chip trên thumbnail, "+2" |
| `--text-meta` | 12 / 16 | 400 | 0 | Meta, timestamp, trạng thái, link phụ |
| `--text-body` | 13 / 20 | 400 / 500 | 0 | Nội dung UI mặc định, nút, tab, tên card |
| `--text-title-sm` | 14 / 20 | 600 | 0 | Tiêu đề section, tiêu đề card lớn |
| `--text-title` | 20 / 28 | 600 | `-0.015em` | Tiêu đề trang ("Projects") |
| `--text-title-lg` | 24 / 32 | 600 | `-0.02em` | Lời chào hero Overview |

**Thang bổ sung — Landing page** (chỉ dùng ngoài app)

| Token | Size / Line-height | Weight | Letter-spacing |
|---|---|---|---|
| `--text-lead` | 16 / 24 | 400 | 0 |
| `--text-heading-3` | 18 / 26 | 600 | `-0.01em` |
| `--text-heading-2` | 32 / 40 | 600 | `-0.02em` |
| `--text-heading-1` | 40 / 48 | 600 | `-0.02em` |
| `--text-display` | 48 / 56 | 600 | `-0.025em` |

**Quy tắc**
- Số liệu (dung lượng, quota, count, phần trăm) dùng `font-variant-numeric: tabular-nums`.
- Tên dài: 1 dòng + `text-overflow: ellipsis`, tên đầy đủ trong `title`.
- Sentence case cho mọi nhãn ("New project", không phải "New Project"). Uppercase chỉ cho `--text-overline`.

### 3.4 Spacing

Lưới cơ sở **4px**. Chỉ dùng các giá trị sau:

| Token | px | Dùng điển hình |
|---|---|---|
| `--space-1` | 4 | Khoảng cách swatch, icon–chữ nhỏ |
| `--space-2` | 8 | Gap giữa control, padding item sidebar |
| `--space-3` | 12 | Padding info card, gap nội dung card |
| `--space-4` | 16 | Gap lưới card, padding card vừa |
| `--space-5` | 20 | Padding card lớn |
| `--space-6` | 24 | Khoảng cách giữa section, gap cột |
| `--space-8` | 32 | Padding ngang trang |
| `--space-10` | 40 | Khoảng cách section landing |
| `--space-12` | 48 | — |
| `--space-16` | 64 | Khoảng cách section lớn landing |

### 3.5 Bo góc & viền

| Token | px | Dùng cho |
|---|---|---|
| `--radius-xs` | 3 | Checkbox |
| `--radius-sm` | 4 | Chip, `kbd`, segment bên trong segmented control |
| `--radius-md` | 6 | Button, input, dropdown, sidebar item |
| `--radius-lg` | 8 | Card, container, dialog |
| `--radius-full` | 9999 | Avatar, swatch, status dot |

Viền luôn **1px solid** (`--border`). Ngoại lệ: outline selected **2px** `--accent`, focus ring **2px**, gạch chân tab active **2px**.

### 3.6 Elevation

**Mặc định: không có bóng.** Phân lớp bằng tông nền (`--bg-page` → `--bg-surface` → `--bg-subtle`) và viền.

Ngoại lệ duy nhất — **lớp nổi đè lên nội dung** (dropdown menu, popover, context menu, toast, dialog) cần tách khỏi nội dung phía dưới:

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--shadow-overlay` | `0 4px 16px rgba(0,0,0,0.08)` (dark: `rgba(0,0,0,0.4)`) | Menu, popover, toast, dialog |
| `--overlay-scrim` | `rgba(0,0,0,0.4)` | Nền mờ phía sau dialog |

Lớp nổi vẫn có viền 1px `--border`. Không phần tử nào khác được dùng `box-shadow`.

### 3.7 Motion

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--duration-fast` | `120ms` | Hover màu, viền |
| `--duration-base` | `150ms` | Mở menu, đổi tab |
| `--ease` | `cubic-bezier(0.2, 0, 0, 1)` | Mọi transition |

- Chỉ animate `color`, `background-color`, `border-color`, `opacity`. Không animate `transform` cho hover.
- Menu/popover: fade + dịch 4px khi mở là chấp nhận được.
- Tôn trọng `prefers-reduced-motion: reduce` → tắt mọi transition không thiết yếu.

### 3.8 Icon

- Bộ icon: **Lucide** (stroke 1.5px). Không trộn bộ icon khác.
- Kích thước: **14px** trong control 32px và dòng meta; **16px** trong sidebar và nút icon-only.
- Màu: `--icon-muted` mặc định; `--text-primary` khi active/hover.
- Nút chỉ có icon luôn có `aria-label`.

---

## 4. Layout & lưới

### 4.1 Khung ứng dụng

```
┌──────────────┬──────────────────────────────────────────────┐
│  Sidebar     │  Main content                                │
│  240px       │  max-width 1152px, căn giữa, padding 0 32px  │
│  (collapse   │                                              │
│   → 56px)    │  [Page header 56px]                          │
│              │  [Toolbar 40px]        (nếu có)              │
│              │  24px                                        │
│              │  [Nội dung]                                  │
└──────────────┴──────────────────────────────────────────────┘
```

- Header, toolbar, lưới card **chung mép trái/phải**.
- Khoảng cách dọc giữa các section: `24px`.

### 4.2 Lưới card

| Viewport | Cột | Gap |
|---|---|---|
| ≥ 1280px | 4 | 16px |
| 1024–1279px | 3 | 16px |
| 768–1023px | 2 | 16px |
| < 768px | 1 (hoặc 2 nếu card ≥ 160px) | 12px |

Dùng `grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))` nếu muốn tự co giãn.

### 4.3 Bố cục hai cột trong trang

Tỉ lệ chuẩn **2/3 + 1/3**, gap 24px. Cột phụ (1/3) cho thông tin hạng hai (Usage, chi tiết). Dưới 1024px xếp dọc, cột chính lên trước.

---

## 5. Components

Mỗi component ghi: kích thước, cấu trúc, trạng thái. Kích thước là **bắt buộc**, không phải gợi ý.

### 5.1 Button

| Variant | Nền | Chữ | Viền | Dùng khi |
|---|---|---|---|---|
| **Primary** | `--accent` | `#FFFFFF` | không | Hành động chính của view. **Tối đa 1 / view.** |
| **Secondary** | `--bg-surface` | `--text-primary` | 1px `--border` | Hành động phụ, hành động trong dòng |
| **Ghost** | trong suốt | `--text-secondary` | không | Nút icon, hành động ít quan trọng |
| **Text** | trong suốt | `--text-secondary` | không | Link dạng nút ("Retry", "View all") |
| **Danger** | `--bg-surface` | `--danger` | 1px `--border` | Xóa vĩnh viễn (chỉ trong dialog xác nhận) |

**Kích thước**

| Size | Cao | Padding ngang | Chữ | Icon |
|---|---|---|---|---|
| `md` (mặc định) | 32px | 12–14px | 13px / 500 | 14px, gap 6px |
| `sm` | 28px | 10px | 12px / 500 | 14px, gap 4px |
| Icon-only | 24 × 24 hoặc 32 × 32 | — | — | 14–16px |

**Trạng thái**

| State | Primary | Secondary | Ghost / Text |
|---|---|---|---|
| Hover | `--accent-hover` | viền `--border-strong` | nền `--bg-hover`, chữ `--text-primary` |
| Active | `--accent-active` | nền `--bg-subtle` | nền `--bg-subtle` |
| Focus-visible | ring 2px `--accent`, offset 2px | như primary | như primary |
| Disabled | opacity 0.4, `cursor: not-allowed` | như primary | như primary |
| Loading | spinner 14px thay icon, giữ nguyên chiều rộng | như primary | — |

**Quy tắc:** `white-space: nowrap`. Không bao giờ có shadow. Nút trong từng dòng danh sách luôn là Secondary/Text, không Primary.

### 5.2 Input & Search

- Cao **32px**, padding `0 10px`, nền `--bg-surface`, viền 1px `--border`, bo `--radius-md`, chữ 13px.
- Placeholder: `--text-tertiary`.
- Focus: viền `--text-primary` (light) / `#888888` (dark). Không glow.
- Error: viền `--danger` + thông báo 12px `--danger` bên dưới, cách 4px.
- Label (form): 12px / 500, `--text-primary`, cách input 6px.
- **Search:** icon kính lúp 14px bên trái (gap 8px), rộng mặc định 240px. Chip phím tắt (`⌘K` / `Ctrl K`) **chỉ hiển thị khi app thật sự có command palette**, và hiển thị theo hệ điều hành.

### 5.3 Dropdown / Select trigger

- Giống Secondary button 32px: nhãn trái, chevron 14px phải, gap 6px, rộng theo nội dung.
- Khi đã áp dụng filter: nền `--accent-subtle`, nhãn là giá trị đã chọn + nút `✕` xóa filter ("Puma Palermo ✕").
- Menu mở ra: lớp nổi (`--shadow-overlay`, viền 1px, bo 8px), item cao 32px, padding `0 8px`, hover `--bg-hover`, item đang chọn có dấu ✓ 14px bên phải.

### 5.4 Tabs (underline)

- Cao **40px**, gap giữa tab 24px, chữ 13px.
- Inactive: `--text-secondary`; hover: `--text-primary`.
- Active: `--text-primary` weight 500 + gạch chân 2px `--text-primary` **nằm đè lên** border-bottom của toolbar (`bottom: -1px`).
- Tab khác loại (vd: Trash) tách bằng vạch dọc 1px × 16px `--border` và có icon 14px.
- ARIA: `role="tablist"` / `role="tab"` / `aria-selected`.

### 5.5 Segmented control

- Khung 32px, padding 2px, viền 1px `--border`, bo 6px.
- Segment 26 × 26px, bo 4px. Active: nền `--bg-subtle`, icon `--text-primary`. Inactive: icon `--icon-muted`.
- ARIA: `role="group"` + `aria-pressed` trên từng nút.

### 5.6 Checkbox

- 16 × 16px, bo 3px, viền 1px `--border-strong`, nền `--bg-surface`.
- Checked: nền `--accent`, dấu ✓ trắng 10px, không viền.
- Trên thumbnail: đặt cách góc trên-trái 8px.

### 5.7 Status indicator

Luôn là **chấm 6px + nhãn chữ 12px**. Không dùng pill, không chỉ dùng màu (người mù màu phải đọc được qua chữ).

```
● Ready        ← chấm --success, chữ --text-secondary
● Processing · 64%
```

Tiến trình có phần trăm: thêm thanh 2px ngay dưới nhãn (track `--border`, fill `--warning`).

### 5.8 Color swatch

- Hình tròn **12px**, gap **4px**, **không bao giờ chồng lên nhau**.
- Viền inset bắt buộc: `box-shadow: inset 0 0 0 1px rgba(0,0,0,0.12)` (dark: `rgba(255,255,255,0.16)`) — để swatch trắng thấy được trên nền trắng và swatch đen thấy được trên nền tối. *(Đây là viền vẽ bằng inset shadow, không phải bóng đổ — được phép.)*
- Tối đa 5 swatch, phần dư hiển thị "+N" 11px `--text-tertiary`.

### 5.9 Avatar & avatar stack

- Tròn **20px** (trong card/list), **28px** (sidebar user). Chữ viết tắt 9px / 600, trắng, luôn đọc được đủ.
- Stack: ring 2px màu nền của card (`--bg-surface`), chồng 5px, tối đa 3, phần dư là avatar xám "+N" cùng kích thước.
- Màu nền avatar sinh ổn định từ user id (không random mỗi lần render).

### 5.10 Chip (trên thumbnail)

- 11px, padding `2px 6px`, bo 4px, nền `--bg-surface`, viền 1px `--border`.
- Vị trí: góc dưới-phải thumbnail, cách 8px. Tối đa **1 chip / thumbnail**.
- Nội dung là thông tin thiết kế ("4 colorways"), không phải thông tin kỹ thuật (dung lượng file).

### 5.11 Project card

Component **dùng chung** cho Projects, Overview ("Continue designing") và mọi nơi hiển thị project. Không tạo biến thể riêng cho từng trang.

**Cấu trúc**

```
┌─────────────────────────────┐  bo 8px, viền 1px --border, nền --bg-surface
│ ☐                           │  checkbox (hover/selected)
│        [ ảnh giày ]         │  thumbnail 4:3, TRÀN VIỀN, canvas --bg-subtle
│                 4 colorways │  chip
├─────────────────────────────┤  divider 1px
│ Palermo Neon Sole        ⋯  │  13px/500 + nút ghost 24px
│ 👟 Puma Palermo · v3 · 2h ago│  12px --text-secondary, icon 14px
│ ●●●●  +2          (SK)(ML)  │  swatch + avatar stack
└─────────────────────────────┘  padding 12px, gap dọc 6px
```

**Props (tham chiếu)**

```ts
interface ProjectCardProps {
  id: string;
  name: string;
  thumbnailUrl: string;        // PNG nền trong suốt hoặc nền = --bg-subtle
  baseModel: string;           // "Puma Palermo"
  version?: number;            // hiển thị "v3"
  updatedAt: string;           // ISO → format bằng formatRelativeTime()
  colorwayCount?: number;      // chip "4 colorways"
  swatches: string[];          // mã màu, tối đa hiển thị 5
  collaborators?: { id: string; initials: string }[];
  selected?: boolean;
  onSelect?: (id: string) => void;
  onOpen?: (id: string) => void;
}
```

Trường nào backend chưa có → **ẩn phần tử đó**, không hiển thị placeholder giả.

**Trạng thái**

| State | Thay đổi |
|---|---|
| Default | Như trên, không checkbox |
| Hover | Viền `--border-strong`, canvas `--bg-subtle-hover`, checkbox xuất hiện. **Không di chuyển.** |
| Selected | Outline 2px `--accent` sát card, checkbox checked, hiển thị cố định |
| Focus-visible | Ring 2px `--accent` **cách card 2px** (offset), không checkbox |
| Loading | Skeleton: canvas `--bg-subtle`, 2 thanh chữ xám |

**Thumbnail:** `object-fit: contain` với PNG trong suốt (giày ~75% chiều rộng), hoặc `cover` nếu ảnh render đã có nền trùng `--bg-subtle`. Pipeline render của KusStudio **phải** xuất ảnh theo một trong hai chuẩn này.

### 5.12 List row (bảng nhẹ)

Dùng cho Scans, Archives, lịch sử billing… Không dùng thẻ lồng.

- Dòng cao **48px** (có thumbnail) hoặc **40px** (chỉ chữ), phân cách bằng divider 1px `--border`. Không viền riêng từng dòng.
- Cột: `[thumbnail 40px] [tên 13px/500 + meta 12px] [trạng thái] [hành động]`.
- Hover dòng: nền `--bg-hover`.
- Tối đa 5–8 dòng trong card; phần còn lại qua link "View all".

**Ánh xạ trạng thái Scan** (backend enum → UI)

| Backend | Nhãn UI | Chấm | Hành động |
|---|---|---|---|
| `uploading` | Uploading | `--neutral` | — |
| `processing` / `baking` | Processing · {n}% | `--warning` + thanh 2px | — (hoặc "Cancel" nếu hỗ trợ) |
| `ready` | Ready | `--success` | Secondary "Import" |
| `failed` | Failed | `--danger` | Text "Retry"; dòng meta = lý do lỗi (12px `--danger`) |
| khác / không rõ | Unknown | `--neutral` | — (log lỗi phía client) |

> Trạng thái của **Project** (draft/completed…) **không** được trộn vào danh sách Scan.

### 5.13 Usage meter

- Nhãn trái 13px, giá trị phải 12px tabular ("7 of 50"), thanh 4px bên dưới cách 6px.
- Track `--border`, fill theo ngưỡng:

| Mức dùng | Fill |
|---|---|
| < 80% | `--text-primary` |
| 80–95% | `--accent` |
| > 95% | `--danger` |

### 5.14 Sidebar navigation

- Rộng 240px, nền `--bg-surface`, viền phải 1px `--border`.
- Item: cao **32px**, padding `0 8px`, icon 16px + gap 8px, chữ 13px, bo 6px.
- Hover: nền `--bg-hover`. Active: nền `--bg-subtle`, chữ `--text-primary` weight 500. **Không** shadow, viền hay thanh màu bên trái.
- Nhãn section: `--text-overline`, cách nhóm trên 24px.
- Recent projects: thumbnail 20 × 20px (bo 4px) + tên 13px, dòng 28px. Không chấm trạng thái.
- Khối storage: tách riêng, cách 16px; dùng Usage meter (5.13).
- Khối user: avatar 28px, tên 13px/500, vai trò 12px `--text-secondary` (cùng font Inter).

### 5.15 Dialog

- Rộng 400px (xác nhận) / 560px (form), bo 8px, viền 1px, `--shadow-overlay`, scrim `--overlay-scrim`.
- Header: tiêu đề 14px/600, padding 16px 20px. Body 13px, padding 0 20px. Footer: nút căn phải, gap 8px, padding 16px 20px.
- Hành động xóa: nút Danger, tiêu đề nói rõ hậu quả ("Delete 'Palermo Neon Sole'? This can't be undone.").
- Đóng bằng Esc, focus trap, trả focus về nút mở.

### 5.16 Toast

- Góc dưới-phải, cách mép 16px, rộng tối đa 360px, bo 8px, viền 1px, `--shadow-overlay`.
- Chữ 13px + tối đa 1 hành động text ("Undo"). Tự ẩn sau 5s (lỗi: không tự ẩn).
- Dùng `role="status"` (thông tin) / `role="alert"` (lỗi).

---

## 6. Page patterns

### 6.1 App page header (mọi trang trong app)

```
Row 1 · 56px   [Title 20px/600  count 13px]        [Search 240px] [Primary 32px]
Row 2 · 40px   [Tabs ...  | Trash]          [Filter] [Sort] [View toggle]
               ─────────────────────────────────────────────────── 1px border
24px
Nội dung
```

- Không tiêu đề display, không câu mô tả.
- Count phản ánh tab/filter đang áp dụng.
- Row 2 chỉ có khi trang có lọc/sắp xếp.

### 6.2 Overview

Thứ tự theo mức độ người dùng cần:

1. **Hero card** (~300px cao): trái = lời chào 24px + câu tóm tắt trạng thái sinh từ dữ liệu + nút theo ngữ cảnh + trạng thái kết nối KusStudio; phải = project sửa gần nhất (ảnh 2:1, tối đa 240px) + "Open in KusStudio".
2. **Continue designing:** 4 project tiếp theo (không lặp project đã ở hero), dùng Project card 5.11.
3. **Hai cột 2/3 + 1/3:** Scans (list row 5.12) | Usage (5.13 + gói cước + ngày gia hạn).

Câu tóm tắt và nút primary của hero được tính bởi **một hàm duy nhất**:

```ts
getOverviewSummary(scans, projects) => { text: string; primaryAction: Action; secondaryAction: Action }
```

| Điều kiện | Tóm tắt | Primary | Secondary |
|---|---|---|---|
| Có scan `ready` | "2 scans ready to import · 1 processing" | "Import 2 scans" | "New project" |
| Chỉ có scan đang xử lý | "1 scan processing" | "New project" | "Scan with phone" |
| Không có scan chờ | "All scans processed · 7 projects" | "New project" | "Scan with phone" |
| Chưa có project nào | "Scan your first sneaker to get started" | "Scan with phone" | "New project" |

"Open in KusStudio" dùng deep link (`kusstudio://open?project={id}`); nếu app chưa cài → hiển thị gợi ý tải app, không im lặng.

### 6.3 Projects

Page header 6.1 + lưới Project card 4.2. Tabs: All · Private · Shared with me | Trash (chỉ giữ tab mà backend hỗ trợ).

### 6.4 Landing page

Landing được phép **cỡ chữ lớn hơn** (thang 3.3 bổ sung) và **khoảng thở rộng hơn** (section cách 64px), nhưng giữ nguyên mọi quy tắc khác: phẳng, một accent, không gradient, không tô màu chữ trong tiêu đề, không tinted icon box.

- **Show, don't tell:** mỗi bước/tính năng đi kèm **hình thật** của sản phẩm (ảnh chụp, wireframe mesh, giày đã phối màu) — không dùng icon chung chung thay cho hình.
- Nội dung viết theo lợi ích người dùng ("Scan with your phone"), không theo công nghệ ("Photogrammetry Pipeline").
- Tên nhà cung cấp bên thứ ba (Kiri Engine…) chỉ xuất hiện ở credits/tài liệu.
- Bước tự động (hệ thống làm) phân biệt với bước người dùng làm — vd viền dashed 1px + meta "Automatic · no action needed".
- Mọi con số (thời gian, nền tảng hỗ trợ) phải kiểm chứng được.

#### Edge art
- **Bố cục & số lượng:** Tối đa một cặp sneaker line art (trái & phải) trên mỗi section; ghim sát mép ngoài của viewport (`left: 50%; width: 100vw; transform: translateX(-50%)`), khu vực trung tâm chừa trọn vẹn cho nội dung.
- **Phong cách:** Monochrome 1px line art. Màu cam (`#FF6B35`) chỉ được dùng duy nhất ở hero section; các section khác dùng monochrome trung tính.
- **Độ mờ (opacity):**
  - Light mode: `0.6` (hero) / `0.14` (sections).
  - Dark mode: `0.5` (hero) / `0.12` (sections).
- **Responsive:** Ẩn hoàn toàn khi chiều rộng viewport ≤ 1100px và trên mobile.
- **Thứ tự lớp (stacking):** Luôn nằm phía sau nội dung (`z-index: -1` trong stacking context `position: relative; z-index: 2` của section), không bao giờ che đè lên heading, body text, nút bấm hay card.
- **Assets:** Ảnh PNG trong suốt với biến thể riêng cho dark mode (hậu tố `-dark.png`), không sử dụng CSS invert filter.

---

## 7. Nội dung & dữ liệu hiển thị

### 7.1 Thời gian

Một utility duy nhất `formatRelativeTime(date)`, timestamp đầy đủ đặt trong `title` (tooltip).

| Khoảng cách | Hiển thị |
|---|---|
| < 1 phút | just now |
| < 1 giờ | 35m ago |
| < 24 giờ | 2h ago |
| hôm qua | yesterday |
| < 7 ngày | 3d ago |
| cùng năm | May 14 |
| khác năm | May 14, 2025 |

### 7.2 Số & đơn vị

- Quota: "7 of 50" (không phải "7 / 50").
- Dung lượng: 1 chữ số thập phân, đơn vị thập phân — "1.4 GB", "52.7 MB".
- Phần trăm: số nguyên — "64%".
- Số đếm: "1 colorway" / "4 colorways" (xử lý số ít/số nhiều).

### 7.3 Enum → nhãn

Mọi enum từ backend đi qua một bảng ánh xạ tập trung (vd `src/lib/labels.ts`). Enum không có trong bảng → hiển thị "Unknown" và log cảnh báo, **không** hiển thị giá trị thô.

| Enum | Nhãn |
|---|---|
| `pro_monthly` | Pro · Monthly |
| `pro_yearly` | Pro · Yearly |
| `free` | Free |

### 7.4 Giọng văn

- Ngắn, trực tiếp, sentence case. Động từ cho nút ("Import", "New project", "Retry").
- Thông báo lỗi nói **chuyện gì xảy ra + làm gì tiếp**: "Not enough photos · add more angles".
- Không hứa hẹn thứ backend chưa làm được.

### 7.5 Đặt tên mặc định

Tên project tự sinh không lộ cấu trúc nội bộ (tránh "Puma Palermo user1 07"). Đề xuất: "{Base model} {số thứ tự}" → "Puma Palermo 07", cho phép đổi tên ngay khi tạo.

---

## 8. Trạng thái: loading, empty, error

| Trạng thái | Quy tắc |
|---|---|
| **Loading** | Skeleton cùng hình dạng với nội dung thật (card, dòng), nền `--bg-subtle`, hiệu ứng opacity 0.6↔1 (1.2s). Không spinner toàn trang. |
| **Empty** | Căn giữa vùng nội dung: icon/hình 32–48px `--icon-muted`, tiêu đề 14px/600, mô tả 13px `--text-secondary` (1 câu), 1 nút hành động. Vd: "Scan your first sneaker" + QR tải app. |
| **No results** | "No projects match "abc"" + Text button "Clear search". |
| **Error (vùng)** | Thông báo 13px + nút "Try again". Không để vùng trống. |
| **Error (thao tác)** | Toast `role="alert"`, không tự ẩn. |
| **Offline / mất kết nối KusStudio** | Dòng trạng thái đổi sang chấm `--neutral` + "KusStudio not connected · Download". |

---

## 9. Accessibility

- **Contrast:** chữ ≥ 4.5:1 (chữ < 18px), ≥ 3:1 (chữ ≥ 18px hoặc ≥ 14px bold, thành phần UI). Kiểm tra bằng token ở 3.1 — không dùng `--icon-muted` cho chữ.
- **Focus:** mọi phần tử tương tác có focus ring rõ (`outline: 2px solid var(--accent); outline-offset: 2px`). **Cấm** `*:focus-visible { outline: none }` toàn cục.
- **Bàn phím:** Tab đi qua được mọi hành động; Enter/Space kích hoạt; Esc đóng menu/dialog; mũi tên di chuyển trong tabs/segmented.
- **Không dựa vào màu:** trạng thái luôn có chữ kèm chấm màu.
- **ARIA:** tabs, segmented, dialog, toast theo mục 5. Nút icon-only có `aria-label`. Ảnh thumbnail có `alt` = tên project.
- **Vùng bấm:** tối thiểu 24 × 24px (khuyến nghị 32 × 32px trên màn hình cảm ứng).

---

## 10. Responsive

| Breakpoint | Thay đổi |
|---|---|
| `≥ 1280px` | Layout đầy đủ, lưới 4 cột |
| `1024–1279px` | Lưới 3 cột, sidebar giữ nguyên |
| `768–1023px` | Sidebar thu gọn còn icon (56px), lưới 2 cột, hai cột nội dung xếp dọc |
| `< 768px` | Sidebar thành drawer; search thu thành nút icon; tabs cuộn ngang; Filter + Sort gộp thành nút "Filters"; landing: bước xếp dọc, mũi tên chỉ xuống |

Không bao giờ có cuộn ngang toàn trang. Padding ngang trang giảm còn 16px dưới 768px.

---

## 11. Triển khai trong code

### 11.1 CSS variables

```css
:root {
  /* Surface */
  --bg-page: #FAFAFA;
  --bg-surface: #FFFFFF;
  --bg-subtle: #F2F2F2;
  --bg-hover: #F8F8F8;
  --bg-subtle-hover: #EBEBEB;
  /* Border */
  --border: #E5E5E5;
  --border-strong: #CCCCCC;
  /* Text */
  --text-primary: #1A1A1A;
  --text-secondary: #6B6B6B;
  --text-tertiary: #737373;
  --icon-muted: #8A8A8A;
  /* Accent */
  --accent: #FF6B35;
  --accent-hover: #F05F2B;
  --accent-active: #DE5523;
  --accent-subtle: rgba(255, 107, 53, 0.08);
  /* Semantic */
  --success: #16A34A;
  --warning: #F59E0B;
  --danger: #DC2626;
  --info: #2563EB;
  --neutral: #8A8A8A;
  /* Radius */
  --radius-xs: 3px;
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  /* Elevation (chỉ lớp nổi) */
  --shadow-overlay: 0 4px 16px rgba(0, 0, 0, 0.08);
  --overlay-scrim: rgba(0, 0, 0, 0.4);
  /* Motion */
  --duration-fast: 120ms;
  --duration-base: 150ms;
  --ease: cubic-bezier(0.2, 0, 0, 1);
  /* Swatch border */
  --swatch-ring: rgba(0, 0, 0, 0.12);

  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  -webkit-font-smoothing: antialiased;
}

[data-theme="dark"] {
  --bg-page: #0F0F0F;
  --bg-surface: #1A1A1A;
  --bg-subtle: #222222;
  --bg-hover: #222222;
  --bg-subtle-hover: #2A2A2A;
  --border: #2A2A2A;
  --border-strong: #3E3E3E;
  --text-primary: #EDEDED;
  --text-secondary: #A3A3A3;
  --text-tertiary: #8A8A8A;
  --icon-muted: #737373;
  --shadow-overlay: 0 4px 16px rgba(0, 0, 0, 0.4);
  --swatch-ring: rgba(255, 255, 255, 0.16);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0ms !important; animation-duration: 0ms !important; }
}
```

### 11.2 Tailwind (nếu dùng)

```js
// tailwind.config.js — map token vào theme, KHÔNG dùng màu mặc định của Tailwind trong component
module.exports = {
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        page: 'var(--bg-page)',
        surface: 'var(--bg-surface)',
        subtle: 'var(--bg-subtle)',
        hover: 'var(--bg-hover)',
        border: { DEFAULT: 'var(--border)', strong: 'var(--border-strong)' },
        fg: { DEFAULT: 'var(--text-primary)', 2: 'var(--text-secondary)', 3: 'var(--text-tertiary)' },
        accent: { DEFAULT: 'var(--accent)', hover: 'var(--accent-hover)', active: 'var(--accent-active)' },
        success: 'var(--success)', warning: 'var(--warning)', danger: 'var(--danger)',
      },
      borderRadius: { xs: '3px', sm: '4px', md: '6px', lg: '8px' },
      fontSize: {
        overline: ['11px', { lineHeight: '16px', letterSpacing: '0.04em' }],
        caption: ['11px', '16px'],
        meta: ['12px', '16px'],
        body: ['13px', '20px'],
        'title-sm': ['14px', '20px'],
        title: ['20px', { lineHeight: '28px', letterSpacing: '-0.015em' }],
        'title-lg': ['24px', { lineHeight: '32px', letterSpacing: '-0.02em' }],
      },
      boxShadow: { overlay: 'var(--shadow-overlay)', none: 'none' },
    },
  },
};
```

### 11.3 Quy tắc code

- Style component **scope theo component** (CSS modules, class prefix, hoặc Tailwind). Không viết style toàn cục cho `button`, `input`, `select` ngoài một reset tối thiểu.
- Không `!important` (ngoại trừ reduced-motion).
- Utility dùng chung: `formatRelativeTime`, `formatBytes`, `pluralize`, `labels.ts` (enum → nhãn), `getOverviewSummary`.
- Component dùng chung tối thiểu: `Button`, `Input`, `Dropdown`, `Tabs`, `SegmentedControl`, `Checkbox`, `StatusDot`, `SwatchList`, `AvatarStack`, `ProjectCard`, `ListRow`, `UsageMeter`, `Dialog`, `Toast`, `Skeleton`, `EmptyState`.

---

## 12. Prompt preamble cho AI design tools

Dán khối này vào đầu mọi prompt gửi Google Stitch (hoặc công cụ tương tự) để giữ đúng phong cách:

```
STYLE SYSTEM — KusShoes (follow strictly)
Flat, dense, professional design-tool aesthetic (Figma file browser, Linear, Vercel dashboard).
- NO shadows on cards, buttons, inputs or any in-flow element. NO hover lift/scale. NO gradients, glows, glassmorphism.
- NO tinted icon boxes, NO large pill badges, NO colored words inside headings, NO monospace decoration.
- Depth only via 1px borders (#E5E5E5) and background tones (page #FAFAFA, surface #FFFFFF, subtle #F2F2F2).
- Font Inter. App sizes: 20px page title, 14px section title, 13px body/UI, 12px meta, 11px chips. Weights 400/500/600.
- Radius: cards 8px, controls 6px, chips 4px. Controls exactly 32px tall. Spacing on a 4px grid.
- One accent color #FF6B35, used only for the single primary button per view, selected outline and focus ring.
- Text colors: #1A1A1A primary, #6B6B6B secondary, #737373 tertiary.
- Status = 6px colored dot + 12px text label (green #16A34A ready, amber #F59E0B processing, red #DC2626 failed).
- Color swatches 12px circles, 4px gap, never overlapping, 1px inset border.
- Use attached real images only; shoe images must have real transparency, no checkerboard.
- Dark mode: page #0F0F0F, surface #1A1A1A, subtle #222222, borders #2A2A2A, text #EDEDED.
```

---

## 13. Checklist review

Dùng trước khi merge UI hoặc chốt một thiết kế.

**Thị giác**
- [ ] Không có `box-shadow` ngoài lớp nổi.
- [ ] Không gradient, glow, blur, hover transform.
- [ ] Chỉ một nút primary trong view.
- [ ] Mọi màu, cỡ chữ, bo góc, khoảng cách lấy từ token.
- [ ] Control 32px, card bo 8px, control bo 6px.
- [ ] Không hộp lồng hộp, không inner scrollbar.

**Nội dung**
- [ ] Không timestamp ISO, không enum thô.
- [ ] Không thuật ngữ kỹ thuật/nhà cung cấp trên UI người dùng.
- [ ] Mọi trường hiển thị có dữ liệu thật từ backend.
- [ ] Lỗi có lý do + hướng xử lý.

**Asset**
- [ ] Thumbnail không có ô vuông lồng, không ô caro giả.
- [ ] Swatch trắng/đen nhìn thấy được ở cả hai chế độ.

**Trạng thái**
- [ ] Có loading (skeleton), empty, error.
- [ ] Hover, selected, focus-visible khác nhau và nhìn thấy được.

**Accessibility & responsive**
- [ ] Contrast đạt chuẩn mục 9.
- [ ] Điều hướng được bằng bàn phím, focus ring hiển thị.
- [ ] Kiểm tra ở 1440 / 1024 / 768 / 375px, light và dark.
- [ ] Không phần tử nào rơi về font fallback.

---

## 14. Quyết định còn mở

| # | Vấn đề | Chi tiết | Phương án |
|---|---|---|---|
| 1 | **Contrast nút primary** | Chữ trắng trên `#FF6B35` = 2.8:1, không đạt WCAG AA (4.5:1) cho chữ 13px. | (a) Giữ nguyên vì nhận diện thương hiệu, chấp nhận không đạt AA. (b) Nền nút `#CC4414` (≈ 4.8:1), giữ `#FF6B35` cho outline/focus/trang trí. (c) Giữ nền `#FF6B35`, chữ `#1A1A1A` (≈ 6.2:1). |
| 2 | **Font** | App hiện dùng một font hình học khác Inter. | Chuyển toàn bộ sang Inter theo file này, hoặc cập nhật mục 3.3 nếu giữ font hiện tại. Không để hai font song song. |
| 3 | **Archives vs Trash** | Sidebar có Archives, tab có Trash — trùng khái niệm. | Archives thành tab cạnh Trash, hoặc bỏ một trong hai. |
| 4 | **Dữ liệu card** | Colorway count, swatch, collaborator, version chưa chắc backend có. | Xác nhận API; trường chưa có → ẩn theo 5.11. |
| 5 | **Lý do lỗi scan** | UI cần mã lỗi để hiển thị "Not enough photos…". | Backend bổ sung `failureReason` enum + bảng ánh xạ trong `labels.ts`. |

Khi chốt một quyết định: cập nhật mục liên quan, xóa dòng khỏi bảng này, ghi vào changelog.

---

## Changelog

| Phiên bản | Ngày | Thay đổi |
|---|---|---|
| 1.1 | 2026-09-26 | Bổ sung quy chuẩn Edge art cho Landing page (mục 6.4). |
| 1.0 | 2026-09-26 | Bản đầu tiên — chốt phong cách phẳng từ các vòng thiết kế Projects, Overview, Landing. |
