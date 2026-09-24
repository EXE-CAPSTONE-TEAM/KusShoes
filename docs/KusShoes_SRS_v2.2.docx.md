&nbsp;

&nbsp;

&nbsp;

# **KusShoes**

**Software Requirement Specification**

**Nền tảng AI quét & thiết kế giày tùy chỉnh — Web / Desktop / Mobile**

**Phiên bản 2.2 — 17/09/2026** · Đồng bộ với sheet phân task EXE201 (7 quyết định đã chốt, 13/09/2026)

| Hạng mục | Thay đổi so với v2.1 |
| :---- | :---- |
| **Business Rules (5.1)** | Viết lại toàn bộ theo 12 nhóm; mỗi BR có trạng thái (Giữ/Sửa/Mới/Gộp/Hoãn), lý do theo stakeholder và điểm áp dụng. Giữ nguyên số hiệu cũ để không vỡ tham chiếu; BR mới đánh số từ BR-83 đến BR-110. |
| **Đồng bộ với quyết định đã chốt** | Danh mục bán Free/Basic/Pro/Credit; Basic kèm 1 lượt quét; mobile chỉ chụp/quay \+ upload; nghệ nhân xem/tải được file; gói Team và Creator chuyển Phase 2\. |
| **Sửa lỗi nội dung** | Giá năm ghi “tiết kiệm 33%” nhưng bằng đúng 12 tháng; mâu thuẫn “AI không giới hạn” và AI Credits; form nhập số thẻ mâu thuẫn NFR-SEC-04; tự gia hạn mâu thuẫn việc không lưu thẻ/ví; camera 1080p/60fps chưa bảo đảm trên WebView; BR-48 chặn tải file mâu thuẫn luồng nghệ nhân; MSG01–MSG35 còn trống. |
| **Ngữ nghĩa mới** | 2.3 Stakeholder & nhu cầu thông tin; 5.4 Định nghĩa dữ liệu nghiệp vụ & chỉ số; 5.5 Vòng đời trạng thái; 5.6 Truy vết yêu cầu môn EXE201. |
| **Tính năng/thực thể bổ sung** | UC-25 → UC-29; SC-33 → SC-36; SF-17 → SF-20; 9 thực thể mới (biên nhận, hoàn tiền, link nghệ nhân, phản hồi, đồng ý, chi phí API, khoá sổ…). |
| **Đánh dấu \[ĐX\]** | Con số do Claude đề xuất, chưa có trong Figma/CP4/sheet phân task — team cần chốt trước khi đưa vào Pricing hoặc báo cáo. |

&nbsp;

# **II. Software Requirement Specification**

## **1\. Product Overview**

KusShoes là hệ thống cho phép người dùng **quét đôi giày thật bằng camera điện thoại**, hệ thống dựng thành **model 3D**; người dùng có thể **xuất ngay file scan gốc** hoặc tiếp tục thiết kế. Trên **Kus Studio** (Web App / Desktop App), người dùng thêm **sticker, chữ ký/text, vẽ tay tự do (Draw Artwork), họa tiết, logo**, xem trước 3D, rồi **xuất file thiết kế hoàn chỉnh** (GLB; thêm OBJ với gói Pro) kèm ảnh render và gói tham khảo để **tự mang cho nghệ nhân/thợ vẽ tay gia công bên ngoài hệ thống**.

**KusShoes không tổ chức sản xuất, không có xưởng đối tác, không xử lý đặt hàng/thanh toán gia công, và không có AR try-on.** Vai trò hệ thống dừng ở: quét → thiết kế → xuất file. Thanh toán trong hệ thống chỉ áp dụng cho **gói dịch vụ (subscription)** Free/Basic/Pro và Credit quét lẻ (gói Team thuộc Phase 2), không phải cho việc gia công.

Trong kỳ EXE201, **sản phẩm bán** là nền tảng thiết kế giày 3D trên web kèm xuất file 3D; khách và nghệ nhân đều xem/tải được file. Việc biến thiết kế thành giày thật do khách tự thực hiện với nghệ nhân bên ngoài và **không** nằm trong lời hứa bán hàng.

## **2\. User Requirements**

### **2.1 Actors**

| \# | Actor | Description |
| :---- | :---- | :---- |
| 1 | **Guest** | Khách chưa đăng nhập. Xem Landing/Pricing/About, xem các ảnh mẫu design. |
| 2 | **Customer** | Người dùng đã đăng ký. 3 cấp gói: **Free, Basic, Pro** (mua thêm Credit quét lẻ khi có Basic/Pro). Thực hiện luồng quét → xuất file scan → thiết kế → xuất file thiết kế → chia sẻ cho nghệ nhân; tự quản lý bảo mật, thiết bị, dữ liệu. Quyền lợi và hạn mức theo bảng 3.2.8. |
| 3 | **Team Owner** | **(Phase 2 — ẩn trong kỳ EXE201, BR-32)** Chủ workspace nhóm (gói Team, 299.000đ/người/tháng). Quản lý thành viên, dự án dùng chung. |
| 4 | **Admin** | Đội Vietstride quản trị hệ thống: dashboard vận hành, người dùng, doanh thu, báo cáo, guardrail nội dung. |
| 5 | **Artisan (Nghệ nhân)** | Người bên ngoài hệ thống nhận file để gia công/vẽ tay. **Không bắt buộc tài khoản**: truy cập bằng link do khách tạo (UC-26, BR-101) để xem 3D, tải gói tham khảo và file 3D của đúng phiên bản đã xuất. |
| 6 | **Creator** | **(Phase 2, BR-64)** Nghệ nhân/nhà thiết kế đóng góp template lên gallery, nhận chia sẻ doanh thu. |
| 7 | **System** | Tác nhân tự động: job scheduler, webhook listener, hàng đợi xử lý 3D/AI, report generator. |

### **2.2 Use Cases**

| ID | Use Case | Actors | Mô tả |
| :---- | :---- | :---- | :---- |
| UC-01 | Đăng ký / Đăng nhập | Guest | Email–mật khẩu hoặc Google OAuth (Web); Mobile có thêm chế độ khách. |
| UC-02 | Xem Dashboard | Customer | Tổng quan gói, hạn mức, dự án gần đây, lịch sử xuất file, lịch sử thanh toán. |
| UC-03 | Quản lý hồ sơ | Customer | Ảnh đại diện, tên, username, ngôn ngữ, email, số điện thoại, giới thiệu, phong cách yêu thích. |
| UC-04 | Đổi mật khẩu & bật 2FA | Customer | Đổi mật khẩu; bật xác thực 2 bước qua Authenticator/SMS/Email. |
| UC-05 | Quản lý quyền riêng tư | Customer | Bật/tắt hồ sơ công khai, hiển thị thiết kế, cho phép tìm kiếm; cá nhân hoá dữ liệu/quảng cáo, cookie. |
| UC-06 | Quản lý thiết bị & phiên đăng nhập | Customer | Xem thiết bị đang đăng nhập, đăng xuất từng thiết bị hoặc tất cả; xem lịch sử đăng nhập (IP, vị trí, trạng thái). |
| UC-07 | Xuất/nhập dữ liệu, xoá tài khoản | Customer | Tải toàn bộ dữ liệu (.zip), khôi phục từ backup, xoá cache, xoá vĩnh viễn tài khoản. |
| UC-08 | Đăng ký / nâng cấp gói | Customer | Chọn Free/Basic/Pro (gói Tháng trong kỳ EXE201); xem hạn mức; đăng ký hạ cấp; gia hạn thủ công (không tự trừ tiền). |
| UC-09 | Thanh toán gói | Customer, System | Checkout 3 bước (Chọn gói → Thanh toán → Hoàn tất) qua VietQR (PayOS) / MoMo / VNPay; nhận biên nhận PDF. |
| UC-10 | Quét giày tạo model 3D | Customer, System | Chụp/quay giày theo hướng dẫn AI, nhận model 3D. |
| UC-11 | Xuất file scan gốc | Customer | Tải file 3D vừa quét mà không cần qua Editor. |
| UC-12 | Chọn phôi có sẵn | Guest, Customer | Chọn model phôi giày chuẩn thay vì tự quét. |
| UC-13 | Quản lý dự án (My Designs) | Customer | Xem dạng lưới/danh sách, lọc theo trạng thái (Nháp/Đang chỉnh/Baked/Đã xuất), nhân bản, đổi tên, xoá. |
| UC-14 | Thiết kế trên Kus Studio | Customer | Add Text, Upload Image (+AI tách nền), Draw Artwork, Sticker Library, đổi màu theo Zone. |
| UC-15 | Áp template | Customer | Chọn mẫu từ gallery, áp lên phôi (Phase 1: chỉ template do KusShoes tạo). |
| UC-16 | Xem trước 3D & Bake Preview | Customer | Xoay 360°, “Bake Preview” để chốt render. |
| UC-17 | Xuất file thiết kế & gói tham khảo cho nghệ nhân | Customer | Xuất GLB (+OBJ với Pro) \+ ảnh render \+ gói tham khảo (mã màu, kích thước, vị trí sticker/chữ). |
| UC-18 | Quản lý workspace nhóm (Phase 2\) | Team Owner | Tạo workspace, mời thành viên, chia sẻ dự án dùng chung. |
| UC-19 | Xem dashboard vận hành | Admin | Tổng người dùng, MRR, lượt xuất, tăng trưởng, người dùng gần đây. |
| UC-20 | Quản lý người dùng | Admin | Danh sách, lọc theo gói, tìm kiếm; xem/sửa/khoá/xoá; đổi gói hộ; đặt lại mật khẩu hộ;&nbsp; |
| UC-21 | Phân tích doanh thu | Admin | MRR/ARR/ARPU/churn, doanh thu theo gói, retention (NRR/GRR), thanh toán lỗi & hoàn tiền, khách hàng doanh thu cao. |
| UC-22 | Tạo & lên lịch báo cáo | Admin | Xuất báo cáo Doanh thu/Người dùng/Thiết kế/Gói/Xuất file/Kiểm duyệt dạng PDF/CSV/XLSX; đặt lịch định kỳ gửi email. |
| UC-23 | Cấu hình gói & guardrail nội dung | Admin | Bảng giá gói, hạn mức, bộ quy tắc guardrail nội dung. |
| UC-24 | Kiểm duyệt nội dung | Admin | Duyệt/từ chối template, xử lý báo cáo vi phạm bản quyền. |
| UC-25 | Gửi phản hồi | Customer | Form phản hồi trong app (mức hài lòng, nội dung, nhóm khách) – BR-109. |
| UC-26 | Tạo / thu hồi link cho nghệ nhân | Customer (Basic+), Artisan | Chia sẻ một phiên bản đã xuất; nghệ nhân xem và tải không cần tài khoản – BR-101. |
| UC-27 | Mua Credit quét | Customer (Basic/Pro), System | Mua lượt quét lẻ 49.000đ/lượt – BR-94. |
| UC-28 | Giao dịch thủ công & hoàn tiền | Admin | Ghi nhận giao dịch ngoài cổng có chứng từ; tạo bút toán hoàn tiền – BR-95, BR-97. |
| UC-29 | Khoá sổ kỳ báo cáo | Admin | Khoá dữ liệu giao dịch của một kỳ trước buổi báo cáo – BR-98. |

### **2.3 Stakeholders & nhu cầu thông tin**

Bảng dưới trả lời câu hỏi “mỗi bên liên quan cần biết gì, được bảo đảm gì” và chỉ ra quy tắc/tính năng đáp ứng. Viết tắt dùng trong cột “Lý do · Stakeholder” của mục 5.1: **KH** khách hàng · **NN** nghệ nhân · **VS** team VietStride (R1–R6) · **GV** giảng viên/hội đồng EXE201 · **MT** mentor/nhà đầu tư · **NCC** nhà cung cấp · **PL** pháp lý · **CSH** chủ sở hữu nhãn hiệu/bản quyền.

| Stakeholder | Vai trò với KusShoes | Thông tin / quyền lợi mong muốn | Được đáp ứng bởi |
| :---- | :---- | :---- | :---- |
| **Khách hàng (Customer: Free/Basic/Pro)** | Người trả tiền; chủ yếu sinh viên, người trẻ yêu giày muốn cá nhân hoá. | Giá và hạn mức rõ trước khi trả; hiểu “một lượt quét / một lượt xuất / một Credit” là gì; không bị trừ lượt vô lý; biết file xuất dùng để làm gì và mang đi đâu; quyền sở hữu thiết kế; biên nhận; điều kiện hoàn tiền; kiểm soát ảnh và dữ liệu cá nhân. | Bảng 3.2.8, BR-92, BR-23, BR-35/36, BR-72, BR-71, BR-102, BR-69, BR-31, BR-97, BR-15, BR-87/88 |
| **Nghệ nhân / thợ vẽ giày (Artisan)** | Nhận file để gia công ngoài hệ thống. | Mở được file mà không phải đăng ký; phiên bản cố định không bị sửa ngầm; mã màu, kích thước, vị trí, trái/phải; biết màu hiển thị có thể sai lệch; biết khách đã xác nhận quyền dùng hình ảnh. | BR-101, BR-43/44, BR-71, BR-49/66, BR-51 |
| **VietStride – PO/Web (R1)** | Vận hành hệ thống, chịu trách nhiệm demo Outcome 1\. | Luồng chính chạy không ngắt; trạng thái job/giao dịch rõ ràng; nhật ký thao tác quản trị. | Mục 5.5, SF-15, BR-80, BR-83 |
| **VietStride – Sales Lead (R4)** | Chốt 20 đơn qua đường bán trực tiếp. | Mã giới thiệu cá nhân; trạng thái thanh toán tức thời khi đứng trước khách; biên nhận đặt tên chuẩn; cách ghi nhận đơn tiền mặt. | BR-85, BR-29, BR-31, BR-106, BR-95 |
| **VietStride – Content/Marketing (R5)** | Đường B: traffic, người dùng Free, feedback. | Kênh đến của từng người đăng ký; phễu theo kênh; ≥20 phản hồi; quyền hợp lệ để dùng video scan làm nội dung. | BR-84, BR-107, BR-109, BR-87 |
| **VietStride – Docs/Finance (R6)** | Sổ sách, CAC, report & slide. | Doanh thu thực thu (sau giảm giá, trừ hoàn tiền); tách quà tặng COMP; chi phí API theo ngày; khoá sổ; một định nghĩa duy nhất cho mỗi chỉ số. | BR-26, BR-97, BR-103, BR-108, BR-98, mục 5.4 |
| **VietStride – Dev Mobile & Scan (R2, R3)** | Xây app Android (Tauri) và pipeline quét. | Giới hạn camera trong WebView; trần 10 lượt quét nội bộ; trạng thái Scan Job; ngân sách API. | BR-34, BR-42, BR-79, mục 5.5 |
| **Giảng viên & Hội đồng EXE201** | Chấm Outcome 1 (40%), Outcome 2 (20%), Outcome 3 (40%). | Demo luồng chính \+ cổng thanh toán hoạt động \+ 3 link; biên lai từng giao dịch (**thiếu là fail môn**); bảng đơn 6 cột; chi phí theo ngày; CAC, conversion, churn, tỷ lệ khách quay lại; ≥20 phản hồi; số liệu trung thực, khớp sổ. | Mục 5.6, BR-31, BR-106, BR-108, BR-104/105, BR-107, BR-109, BR-83, BR-98 |
| **Mentor / nhà đầu tư (theo CP4)** | Đánh giá tính khả thi, có thể ngồi hội đồng O3. | Chi phí thật mỗi lượt quét và biên lợi nhuận; khả năng mở rộng; CAC so với trần 217.000đ/khách. | BR-79, SF-14, BR-108, NFR-PER-06 |
| **Nhà cung cấp dự kiến (3D API: KIRI Engine/Tripo/Meshy; cổng: PayOS/MoMo/VNPay; cloud: DigitalOcean/Cloudflare/Neon)** | Hạ tầng tính phí theo lượt/dung lượng. | Webhook có chữ ký; không gửi yêu cầu vô ích; tuân thủ điều khoản nội dung của họ. | BR-29, BR-33/39, BR-73, NFR-MNT-02 |
| **Cơ quan quản lý / pháp lý** | NĐ 13/2023 về dữ liệu cá nhân; quyền lợi người tiêu dùng; hoá đơn. | Đồng ý rõ ràng và lưu được; quyền truy cập/xoá dữ liệu; điều khoản và chính sách hoàn tiền công khai; không quảng cáo sai. | BR-15, BR-19, BR-06, BR-89, BR-97, BR-93, NFR-LEG |
| **Chủ sở hữu nhãn hiệu/bản quyền** | Bên thứ ba bị ảnh hưởng bởi nội dung người dùng. | Không dùng logo trái phép; không dùng model giày có nhãn hiệu để làm hàng giả; gỡ khi có khiếu nại. | BR-51, BR-53, BR-69, BR-73, NFR-LEG-03 |
| **Kho ứng dụng (APKPure) & người dùng Android** | Kênh phân phối app. | Giải thích vì sao xin quyền camera; URL chính sách bảo mật; không thu thập ngoài mục đích. | NFR-LEG-06, BR-34 |

## **3\. Functional Requirements**

### **3.1 System Functional Overview**

#### *3.1.1 Danh sách màn hình*&nbsp;

**A — Marketing site**

| \# | Screen | Ghi chú&nbsp; |
| :---- | :---- | :---- |
| SC-01 | Landing | Hero, quy trình 3 bước, 3 điểm khác biệt, đội ngũ Vietstride, FAQ, CTA |
| SC-02 | Pricing | Free / Basic / Pro \+ Credit; toggle Năm ẩn trong kỳ EXE201 (BR-93); gói Team ẩn (Phase 2). Mọi con số đọc từ bảng 3.2.8 (BR-92). |
| SC-03 | Auth — Đăng nhập | Email/mật khẩu \+ Google OAuth \+ “Dùng thử Demo” |
| SC-04 | Auth — Đăng ký | Họ tên, email, mật khẩu, xác nhận mật khẩu \+ Google OAuth |
| SC-05 | About | Sứ mệnh, giá trị cốt lõi |
| SC-33 | Trang pháp lý | Điều khoản sử dụng, Chính sách bảo mật, Chính sách hoàn tiền; có số phiên bản (BR-89, BR-97) |
| SC-34 | Artisan Viewer | Trang công khai mở bằng token: xem 3D, tải gói tham khảo & file 3D, tuyên bố miễn trừ (BR-101) |

**B — Web App**

| \# | Screen | Ghi chú |
| :---- | :---- | :---- |
| SC-06 | Dashboard | Tổng quan gói/hạn mức, dự án gần đây, lịch sử xuất file, lịch sử thanh toán |
| SC-07 | My Designs \- Grid/List | Bộ đếm theo trạng thái, filter, sort, tìm kiếm, đổi chế độ xem |
| SC-08 | Billing & Subscription | Gói hiện tại, hạn mức, phương thức thanh toán, lịch sử mua |
| SC-09 | Settings \- Hồ sơ | Ảnh đại diện, tên, username, ngôn ngữ, liên hệ, phong cách yêu thích |
| SC-10 | Settings \- Mật khẩu | Đổi mật khẩu \+ yêu cầu độ mạnh |
| SC-11 | Settings \- Bảo mật | 2FA (Authenticator/SMS/Email), email khôi phục, cảnh báo đăng nhập lạ |
| SC-12 | Settings \- Quyền riêng tư | Hiển thị hồ sơ/thiết kế, tìm kiếm, cá nhân hoá dữ liệu, cookie |
| SC-13 | Settings \- Thiết bị | Thiết bị đang đăng nhập, đăng xuất từng thiết bị / tất cả |
| SC-14 | Settings \- Lịch sử đăng nhập | Bảng thời gian/thiết bị/trình duyệt/IP-vị trí/trạng thái |
| SC-15 | Settings \- Dữ liệu | Tải xuống dữ liệu, nhập dữ liệu, xoá cache, xoá tài khoản |
| SC-16 | Settings \- Gói & Thanh toán | Gói hiện tại, hạn mức, phương thức thanh toán mặc định |
| SC-17 | Checkout \- Thanh toán | Bước 2/3: phương thức VietQR/MoMo/VNPay (không nhập số thẻ trên KusShoes – BR-96); mã khuyến mãi; tóm tắt đơn: giá niêm yết, giảm giá, tổng thanh toán; ô đồng ý BR-88; câu hỏi “Bạn biết KusShoes từ đâu?” khi thiếu kênh đến (BR-84) |
| SC-18 | Checkout \- Thành công | Bước 3/3: mã đơn KUS-xxx, biên nhận PDF, email xác nhận; trạng thái “Đang xác nhận” nếu chưa có webhook (MSG29) |

**C — Kus Studio (Editor)**

| \# | Screen | Ghi chú&nbsp; |
| :---- | :---- | :---- |
| SC-19 | Kus Studio — Editor | Tabs Studio/Customize/Export; Design Tools (Add Text, Upload Image, Draw Artwork, Sticker Library có filter); panel Layers; Preview Ready / Save Draft / Bake Preview / Export |

**D — Mobile App**

| \# | Screen | Ghi chú&nbsp; |
| :---- | :---- | :---- |
| SC-20 | Mobile \- Đăng nhập | “Tiếp tục thiết kế đôi giày cá nhân hóa bằng AI” |
| SC-21 | Mobile \- Đăng ký | \+ đăng ký qua Gmail (Apple chỉ khi có bản iOS), “Tiếp tục với chế độ khách” (BR-41) |
| SC-22 | Mobile \- Scan | Bước 01 · Quét AI, khung dẫn hướng xoay 360° |
| SC-23 | Mobile \- AfterScan | Checklist: tải lên → AI dựng lưới 3D → nén GLB → xem 3D; nút tiếp tục thiết kế trên Web/Desktop (link/QR) hoặc xuất file scan gốc (BR-42) |
| SC-24 | Mobile \- User Manual | Hướng dẫn quét & xuất mô hình 3D; “Xuất file rồi làm gì?”; danh bạ nghệ nhân tham khảo (BR-102) |
| SC-25 | Mobile \- Thông báo | Thông báo hệ thống, gói, cộng đồng |
| SC-26 | Mobile \- Hồ sơ | Menu: giao diện, thiết kế của tôi, gói, đã lưu, phương thức thanh toán, lịch sử, đăng xuất |
| SC-27 | Mobile \- Khám phá | Tính năng nổi bật; các mục mở rộng chỉ hiển thị “Sắp ra mắt”, không nhận đặt lịch/đơn (mục 6, câu 3\) |

**E — Admin Portal**

| \# | Screen | Ghi chú&nbsp; |
| :---- | :---- | :---- |
| SC-28 | Admin \- Dashboard | Tổng người dùng, MRR, lượt xuất, biểu đồ doanh thu & tăng trưởng, người dùng gần đây |
| SC-29 | Admin \- Người dùng | Danh sách, bộ đếm Tổng/Hoạt động/Đang ân hạn/Đã rời (mục 5.4), filter theo gói và cờ nội bộ, tìm kiếm, phân trang |
| SC-30 | Admin \- Chi tiết người dùng | Thông tin, gói & thanh toán, thiết kế, nhật ký hoạt động, vùng nguy hiểm (khoá/xoá) |
| SC-31 | Admin \- Doanh thu | MRR/ARR/ARPU/churn, doanh thu theo gói, retention, thanh toán lỗi & hoàn tiền, khách hàng doanh thu cao, biến động MRR |
| SC-32 | Admin \- Báo cáo | 6 loại báo cáo (Doanh thu/Người dùng/Thiết kế/Gói/Xuất file/Kiểm duyệt) × PDF/CSV/XLSX; báo cáo gần đây; lịch báo cáo định kỳ |
| SC-35 | Admin \- Giao dịch, hoàn tiền & khoá sổ | Danh sách giao dịch lọc theo trạng thái/kênh/người phụ trách; tạo giao dịch thủ công; hoàn tiền; khoá kỳ; xuất “Sổ giao dịch EXE201” |
| SC-36 | Admin \- Phản hồi khách hàng | Danh sách phản hồi, trạng thái xử lý, “đã đổi gì trong sản phẩm”, nhóm 4P; xuất theo cột sổ 10 |

#### *3.1.2 Screen Authorization*

| Screen / Activity | Guest | Free | Basic/Pro | Team Owner | Admin |
| :---- | :---- | :---- | :---- | :---- | :---- |
| SC-01 → SC-05 | X | X | X | X |  |
| SC-06 → SC-16 (Web App) |  | X | X | X |  |
| SC-17, SC-18 Checkout |  | X | X | X |  |
| SC-19 Kus Studio — công cụ cơ bản | X (demo) | X | X | X |  |
| SC-19 — Draw Artwork, layer nâng cao |  |  | X | X |  |
| SC-20 → SC-27 (Mobile) | (đăng ký/đăng nhập) | X | X | X |  |
| Xuất file 3D |  |  | X | X |  |
| SC-28 → SC-32 (Admin) |  |  |  |  | X |
| Xem dữ liệu của chính mình |  | X | X | X | X |
| Xem toàn bộ dữ liệu người dùng |  |  |  |  | X |
| Quét giày (SC-22, SC-23), mua Credit |  |  | X | — |  |
| Tạo / thu hồi link nghệ nhân |  |  | X | — |  |
| SC-33 Trang pháp lý | X | X | X | X | X |
| SC-34 Artisan Viewer (cần token hợp lệ) | X | X | X | X | X |
| SC-35, SC-36 (Admin) |  |  |  |  | X |

*Cột Team Owner áp dụng từ Phase 2 (BR-32). “—” \= chưa áp dụng trong kỳ EXE201. Admin bắt buộc 2FA (BR-12).*

#### *3.1.3 Non-Screen Functions*

| \# | Feature | System Function | Description |
| :---- | :---- | :---- | :---- |
| 1 | Scan | SF-01 Scan Worker | Lấy Scan Job từ hàng đợi, gọi API dựng 3D, nhận GLB, auto-zoning, cập nhật trạng thái. |
| 2 | Scan | SF-02 Scan Timeout Monitor | Cron 1 phút: job quá 30 phút → FAILED\_SYSTEM, hoàn hạn mức. |
| 3 | Design | SF-03 AI Background Removal Worker | Chạy khi Upload Image: tách nền ảnh tự động trước khi áp lên model. |
| 4 | Design | SF-04 Content Guardrail Engine | Kiểm tra nội dung chèn chữ/hình ảnh/sticker: từ khóa cấm, nhãn hiệu bảo hộ. |
| 5 | Account | SF-05 Payment Webhook Handler | Nhận callback Thẻ/MoMo/VNPay cho thanh toán gói; idempotent theo mã tham chiếu. |
| 6 | Account | SF-06 Payment Timeout Job | Cron 5 phút: giao dịch PENDING quá 30 phút → hủy. |
| 7 | Export | SF-07 Design Reference Pack Generator | Sinh PDF gói tham khảo (bản trải phẳng, mã màu, vị trí sticker/chữ) khi xuất file thiết kế. |
| 8 | Account | SF-08 Quota Reset Job | Cron hằng ngày: reset hạn mức (lượt quét gói / AI Credit / lượt xuất) cho các tài khoản đến ngày neo chu kỳ (BR-23). |
| 9 | Account | SF-09 Subscription Expiry Job | Hết ân hạn 3 ngày → hạ về Free, dự án vượt hạn mức → read-only (BR-27, BR-90). |
| 10 | Account | SF-10 Data Retention Job | Xoá ảnh/video scan gốc \> 30 ngày; dọn thùng rác \> 30 ngày. |
| 11 | Account | SF-11 Data Export Job | Đóng gói toàn bộ thiết kế \+ thông tin tài khoản thành .zip khi người dùng bấm “Tải xuống dữ liệu”. |
| 12 | Security | SF-12 Session Manager | Quản lý phiên đăng nhập theo thiết bị; thu hồi khi người dùng bấm “Đăng xuất” một thiết bị hoặc tất cả. |
| 13 | System | SF-13 Notification Dispatcher | Gửi push/email theo cài đặt người dùng. |
| 14 | System | SF-14 API Cost Tracker | Ghi chi phí mọi lần gọi API 3D/AI theo user và theo ngày; cảnh báo 80%, tạm ngưng nhận Scan Job ở 100% ngân sách; trần 10 lượt cho tài khoản nội bộ (BR-79, BR-108). |
| 15 | System | SF-15 Audit Logger | Ghi nhật ký thao tác quản trị, truy cập dữ liệu nhạy cảm |
| 16 | Admin | SF-16 Report Generator | Sinh báo cáo PDF/CSV/XLSX theo yêu cầu hoặc lịch định kỳ; gửi email người nhận. |
| 17 | Account | SF-17 Renewal Reminder Job | Cron hằng ngày: nhắc T−3/T−1/T0; chuyển ACTIVE → GRACE → Free (BR-90). |
| 18 | Account | SF-18 Receipt Generator | Sinh biên nhận PDF bất biến cho giao dịch SUCCESS/MANUAL\_CONFIRMED, đặt tên theo BR-106. |
| 19 | Growth | SF-19 Attribution Tracker | Lưu UTM/mã ref first-touch 30 ngày, gắn vào USER khi đăng ký, chốt ở giao dịch đầu (BR-84, BR-85). |
| 20 | Export | SF-20 Artisan Link Service | Cấp/thu hồi token, đếm lượt tải, cấp signed URL, ghi EXPORT\_LOG (BR-101). |

#### *3.1.4 Entities Description*

| \# | Entity | Description |
| :---- | :---- | :---- |
| 1 | USER | Tài khoản; thông tin cá nhân, vai trò, cài đặt riêng tư, trạng thái 2FA; **kênh đến, UTM, mã ref, cờ nội bộ, ngày trả tiền đầu tiên** (BR-83 → BR-85). |
| 2 | SUBSCRIPTION | Gói hiệu lực (Free/Basic/Pro; Team – Phase 2), chu kỳ Tháng, ngày neo, trạng thái ACTIVE/GRACE/EXPIRED, hạ cấp đã đăng ký, nhãn COMP. |
| 3 | QUOTA\_USAGE | Tiêu thụ hạn mức theo loại: thiết kế đã lưu / AI credits / lượt xuất trong tháng. |
| 4 | TRANSACTION | Giao dịch trả tiền: loại hàng hoá, giá niêm yết, giảm giá, số thực trả, phương thức, mã tham chiếu cổng, trạng thái (mục 5.5), người phụ trách (mã ref), cờ thủ công \+ chứng từ \+ người thu/người duyệt, đồng ý BR-88. |
| 5 | SCAN\_JOB | Một lượt dựng 3D: nguồn ảnh/video, trạng thái, điểm chất lượng. |
| 6 | BASE\_MODEL | Model 3D phôi (từ scan hoặc dựng sẵn), Zone, UV map. |
| 7 | DESIGN\_PROJECT | Dự án thiết kế; trạng thái DRAFT (Nháp) / EDITING (Đang chỉnh) / BAKED / EXPORTED (Đã xuất). |
| 8 | DESIGN\_VERSION | Một phiên bản: layer (sticker/text/draw/pattern), cấu hình Zone, ảnh preview. |
| 9 | TEMPLATE | Mẫu thiết kế trong gallery. |
| 10 | EXPORT\_LOG | Nhật ký xuất/tải file: phiên bản, định dạng, dung lượng, thời điểm, người tải (chủ / link nghệ nhân). |
| 11 | DEVICE\_SESSION | Phiên đăng nhập theo thiết bị: loại thiết bị, trình duyệt, IP/vị trí, thời điểm hoạt động cuối, trạng thái hiện tại/đã đăng xuất. |
| 12 | REPORT | Báo cáo Admin: loại, khoảng thời gian, định dạng, trạng thái, lịch định kỳ và người nhận. |
| 13 | AUDIT\_LOG | Nhật ký bất biến cho thao tác quản trị, truy cập dữ liệu, và mạo danh đăng nhập. |
| 14 | SCAN\_CREDIT\_LEDGER | Sổ lượt quét: nguồn (gói/Credit), bút toán cộng/giữ chỗ/trừ/nhả, hạn dùng. |
| 15 | COUPON | Mã khuyến mãi: loại giảm, gói áp dụng, thời hạn, số lượng, bật/tắt (vd. Early Bird). |
| 16 | REFUND | Bút toán hoàn tiền đối ứng một TRANSACTION: số tiền, lý do, người duyệt, thời điểm. |
| 17 | RECEIPT | Biên nhận PDF bất biến: số KUS-xxx, tên file, thời điểm phát hành. |
| 18 | ARTISAN\_LINK | Link nghệ nhân: token, DESIGN\_VERSION, hạn dùng, số lượt tải, trạng thái. |
| 19 | FEEDBACK | Phản hồi: điểm 1–5, nội dung, nhóm khách, kênh thu, trạng thái xử lý, “đã đổi gì”, nhóm 4P. |
| 20 | CONSENT\_RECORD | Lần đồng ý: loại, phiên bản văn bản, thời điểm, kênh, thời điểm rút lại (nếu có). |
| 21 | API\_COST\_LOG | Lần gọi API 3D/AI: nhà cung cấp, loại, user, chi phí, kết quả, thời điểm. |
| 22 | REPORTING\_PERIOD | Kỳ báo cáo: khoảng thời gian, trạng thái OPEN/LOCKED, người khoá. |

### **3.2 Account, Security & Subscription**

#### *3.2.1 Đăng ký / Đăng nhập (SC-03, SC-04, SC-20, SC-21)*

| Mục | Nội dung |
| :---- | :---- |
| **Trigger** | Landing → “Đăng nhập”/“Đăng ký”; hoặc mở app lần đầu (Mobile). |
| **Mô tả** | Web: email–mật khẩu hoặc “Tiếp tục với Google”, có nút “Dùng thử Demo”. Mobile: thêm lựa chọn đăng ký qua Apple và “Tiếp tục với chế độ khách”. Đăng ký yêu cầu Họ và tên, Email, Mật khẩu (≥8 ký tự), Xác nhận mật khẩu. |
| **Xử lý** | Băm mật khẩu, tạo USER UNVERIFIED, ghi kênh đến/mã ref (SF-19), ghi CONSENT\_RECORD, gửi email xác thực, gán SUBSCRIPTION FREE, tạo QUOTA\_USAGE. Đăng nhập trả JWT access (≤15 phút) \+ refresh, tạo DEVICE\_SESSION mới. |
| **Luồng bất thường** | Sai mật khẩu 5 lần/15 phút → khoá 15 phút (BR-86, MSG12). Email chưa xác thực → chặn thanh toán, quét, xuất file (BR-03, MSG13). Email trùng → MSG01. |
| **BR áp dụng** | BR-01 → BR-04, BR-41, BR-83 → BR-86, BR-89 |

#### *3.2.2 Dashboard (SC-06)*

| Mục | Nội dung |
| :---- | :---- |
| **Trigger** | Đăng nhập thành công; hoặc menu “Bảng điều khiển”. |
| **Mô tả** | Điểm vào chính: thẻ **Gói đăng ký** (tên gói, ngày gia hạn, nút “Nâng cấp gói”), 3 thanh hạn mức (Thiết kế đã lưu x/y, AI Credits x/y, Lượt xuất tháng này x/y), **Chi tiết tài khoản** (thành viên từ, tổng thiết kế, mã tài khoản KS-2026-xxxxx), danh sách **Dự án gần đây** (trạng thái Baked/Đang chỉnh/Đã xuất, nút “Mở Editor”), **Lịch sử xuất file** (tên tệp, định dạng, dự án, ngày, tải về), **Lịch sử thanh toán** (ngày, gói, số tiền, phương thức, trạng thái, hoá đơn PDF). |
| **Xử lý** | Số liệu hạn mức đọc trực tiếp từ QUOTA\_USAGE; danh sách gần đây giới hạn 3 mục mới nhất, có link “Xem tất cả”. |
| **BR áp dụng** | BR-46, BR-92 |

#### *3.2.3 Hồ sơ cá nhân (SC-09)*

| Mục | Nội dung |
| :---- | :---- |
| **Trigger** | Settings → “Hồ sơ”. |
| **Mô tả** | Ảnh đại diện (Tải ảnh lên — JPG/PNG ≤5MB), Tên, Họ, Tên người dùng (@handle, duy nhất), Tên hiển thị, Ngôn ngữ (Tiếng Việt/English), Email (bắt buộc), Số điện thoại, Giới thiệu bản thân, Phong cách yêu thích (tag nhiều lựa chọn: Minimalist, Streetwear, Y2K, Vintage…). |
| **Xử lý** | “LƯU THAY ĐỔI” cập nhật USER. Đổi email yêu cầu xác thực lại email mới trước khi có hiệu lực. |
| **Luồng bất thường** | Username trùng → chặn, gợi ý username khác. |
| **BR áp dụng** | BR-08, BR-09, BR-10 |

#### *3.2.4 Bảo mật: mật khẩu & 2FA (SC-10, SC-11)*

| Mục | Nội dung |
| :---- | :---- |
| **Trigger** | Settings → “Mật khẩu” / “Bảo mật”. |
| **Mô tả** | **Đổi mật khẩu:** mật khẩu hiện tại, mật khẩu mới (thanh đo độ mạnh), xác nhận mật khẩu mới; hiển thị yêu cầu (≥8 ký tự, chữ HOA+thường, ≥1 số, ≥1 ký tự đặc biệt). **2FA:** bật/tắt xác thực 2 bước; 3 phương thức — Authenticator app (khuyến nghị), SMS, Email. **Đăng nhập & khôi phục:** email khôi phục, cảnh báo đăng nhập lạ (bật/tắt), bắt buộc xác minh thiết bị lạ (bật/tắt). |
| **Xử lý** | Đổi mật khẩu thành công → thu hồi toàn bộ DEVICE\_SESSION khác (trừ phiên hiện tại), gửi email thông báo. Bật 2FA → yêu cầu xác minh mã trước khi kích hoạt. |
| **Luồng bất thường** | Mật khẩu mới không đạt yêu cầu → chặn, MSG11. Đăng nhập từ thiết bị mới khi đã bật cảnh báo → gửi email \+ (nếu bật) yêu cầu xác minh trước khi cấp phiên. |
| **BR áp dụng** | BR-11 → BR-14, BR-17, BR-86 |

#### *3.2.5 Quyền riêng tư (SC-12)*

| Mục | Nội dung |
| :---- | :---- |
| **Trigger** | Settings → “Quyền riêng tư”. |
| **Mô tả** | **Hiển thị hồ sơ:** hồ sơ công khai, hiển thị thiết kế của tôi, cho phép tìm kiếm hồ sơ — mỗi mục có toggle riêng. **Dữ liệu & cá nhân hoá:** chia sẻ dữ liệu phân tích (ẩn danh), cá nhân hoá quảng cáo, cookie không thiết yếu. |
| **Xử lý** | Thay đổi có hiệu lực ngay; ảnh hưởng tới việc thiết kế/hồ sơ có xuất hiện công khai hay trong tìm kiếm hay không. |
| **BR áp dụng** | BR-15, BR-87 → BR-89 |

#### *3.2.6 Thiết bị & lịch sử đăng nhập (SC-13, SC-14)*

| Mục | Nội dung |
| :---- | :---- |
| **Trigger** | Settings → “Thiết bị” / “Lịch sử đăng nhập”. |
| **Mô tả** | **Thiết bị:** danh sách thiết bị đang đăng nhập (tên thiết bị \+ trình duyệt/app, vị trí, hoạt động lần cuối, nhãn “HIỆN TẠI”), nút “Đăng xuất” từng thiết bị và “Đăng xuất tất cả thiết bị khác”. **Lịch sử đăng nhập:** bảng Thời gian / Thiết bị / Trình duyệt / IP-Vị trí / Trạng thái (Thành công/Thất bại). |
| **Xử lý** | “Đăng xuất” một thiết bị → SF-12 thu hồi DEVICE\_SESSION đó ngay lập tức, không cần thiết bị đó đang online. |
| **BR áp dụng** | BR-16, BR-17, BR-18 |

#### *3.2.7 Dữ liệu & xoá tài khoản (SC-15)*

| Mục | Nội dung |
| :---- | :---- |
| **Trigger** | Settings → “Dữ liệu”. |
| **Mô tả** | **Tải xuống dữ liệu:** xuất toàn bộ thiết kế & thông tin tài khoản (.zip). **Nhập dữ liệu:** khôi phục từ tệp sao lưu trước đó. **Xoá bộ nhớ đệm:** giải phóng dung lượng tạm trên thiết bị (client-side). **Vùng nguy hiểm — Xoá tài khoản:** xoá vĩnh viễn tài khoản và toàn bộ thiết kế đã lưu, không thể hoàn tác. |
| **Xử lý** | “Tải xuống dữ liệu” → SF-11 đóng gói .zip, gửi link tải qua email/trực tiếp. “Xoá tài khoản” yêu cầu xác nhận (nhập lại mật khẩu hoặc gõ “XOÁ”) trước khi thực thi (BR-22), sau đó theo chính sách lưu trữ 30 ngày (BR-06). |
| **Luồng bất thường** | Xoá tài khoản khi đang trong gói trả phí còn hiệu lực → cảnh báo mất quyền lợi, không hoàn tiền (BR-07) → MSG15. |
| **BR áp dụng** | BR-19, BR-20, BR-21, BR-22, BR-06, BR-07 |

#### *3.2.8 Gói dịch vụ & nâng cấp (SC-02 Pricing, SC-16 Settings — Gói & Thanh toán, SC-08 Billing)*

| Quyền lợi | Free | Basic | Pro | Credit (mua lẻ) |
| :---- | :---- | :---- | :---- | :---- |
| **Giá** | 0đ | 259.000đ/tháng | 649.000đ/tháng | 49.000đ/lượt |
| **Chu kỳ bán trong kỳ EXE201** | — | Tháng (BR-93) | Tháng (BR-93) | Không theo chu kỳ; hạn dùng 12 tháng |
| **Lượt quét giày / chu kỳ** | 0 (BR-99) | 1 | 3 \[ĐX\] | \+1 mỗi Credit; tối đa 3/chu kỳ; cần gói Basic/Pro |
| **Phôi giày chuẩn** | 3 mẫu | Toàn bộ thư viện | Toàn bộ thư viện | — |
| **Dự án lưu tối đa** | 3 | 20 | 50 | — |
| **Phiên bản giữ lại / dự án** | 20 | 20 | 50 | — |
| **Layer** | 5/Zone · 30/dự án | 5/Zone · 30/dự án | 5/Zone · 60/dự án | — |
| **Công cụ thiết kế** | Cơ bản: Text, Upload Image, Sticker, màu theo Zone | \+ Draw Artwork, layer nâng cao | Như Basic \+ truy cập sớm tính năng beta | — |
| **AI tách nền (AI Credit) / chu kỳ** | 5 \[ĐX\] | 100 | 300 \[ĐX\] | — |
| **Lượt xuất / chu kỳ** | Không xuất file 3D | 100 | 300 \[ĐX\] | — |
| **Định dạng xuất** | Ảnh PNG có watermark (≤1080px) | GLB, texture 2K | GLB \+ OBJ (FBX khi hỗ trợ), texture 4K | — |
| **Gói tham khảo PDF & link nghệ nhân** | Không | Có | Có | — |
| **Watermark trên render** | Có | Không | Không | — |

*\[ĐX\] \= số do Claude đề xuất, chưa có trong Figma/CP4 — cần team chốt. Số của Basic (1 lượt quét; 20 dự án; 100 AI Credit; 100 lượt xuất) lấy theo sheet phân task và Figma. Gói Team (299.000đ/người/tháng) chuyển sang Phase 2 (BR-32). Mọi màn hình đọc cùng bảng này (BR-92).*

| Mục | Nội dung |
| :---- | :---- |
| **Trigger** | Pricing (Guest/Customer) hoặc Settings → “Gói & Thanh toán” → “Nâng cấp gói”. |
| **Mô tả** | So sánh gói theo bảng trên (chỉ gói Tháng trong kỳ EXE201), xem hạn mức đã dùng/còn lại và **ngày reset**, đăng ký hạ cấp, gia hạn thủ công; mua Credit quét khi đang có Basic/Pro. |
| **Xử lý** | Nâng cấp giữa chu kỳ tính pro-rata, làm tròn lên hàng nghìn, hạn mức mới hiệu lực ngay (BR-24, MSG18). Không tự trừ tiền gia hạn; nhắc T−3/T−1/T0, ân hạn 3 ngày (BR-25, BR-90). |
| **Luồng bất thường** | Hạ về Free mà vượt hạn mức → khách chọn dự án giữ, phần còn lại read-only (BR-27, MSG16). Hết lượt quét → MSG28. Mua quá 3 Credit/chu kỳ → MSG51. |
| **BR áp dụng** | BR-23 → BR-27, BR-32, BR-90 → BR-94, BR-99 |

#### *3.2.9 Thanh toán & Checkout (SC-17, SC-18 \+ SF-05, SF-06)*

| Mục | Nội dung |
| :---- | :---- |
| **Trigger** | Xác nhận nâng cấp gói. |
| **Mô tả** | Checkout 3 bước: **1\) Chọn gói → 2\) Thanh toán → 3\) Hoàn tất.** Bước 2: chọn VietQR (PayOS) / MoMo / VNPay – khách nhập thông tin thẻ (nếu có) trên trang của cổng, **không** trên KusShoes (BR-96); ô mã khuyến mãi; tóm tắt đơn gồm giá niêm yết, giảm giá, tổng thanh toán (dòng VAT chỉ hiện khi bật cấu hình thuế – BR-28); email nhận biên nhận; ô đồng ý dùng thông tin đơn cho báo cáo học thuật (BR-88); câu hỏi kênh đến nếu thiếu (BR-84). Bước 3: mã đơn KUS-xxx, gói, số tiền, phương thức, ngày thanh toán, ngày hết hạn, nút “Về Dashboard” và “Tải biên nhận (PDF)”; email xác nhận tự động. |
| **Xử lý** | Tạo TRANSACTION PENDING → redirect cổng → SF-05 xác thực chữ ký webhook, đối chiếu số tiền/mã đơn, cập nhật SUCCESS/FAILED (idempotent) → SF-18 sinh biên nhận. Chỉ SUCCESS (hoặc MANUAL\_CONFIRMED) mới kích hoạt gói (BR-29). |
| **Luồng bất thường** | Khách quay lại trước webhook → “Đang xác nhận” (MSG29). PENDING quá 30 phút → CANCELLED (BR-30, MSG17); webhook SUCCESS đến trễ vẫn kích hoạt. Thất bại → MSG20. Mã khuyến mãi sai → MSG27. |
| **BR áp dụng** | BR-26, BR-28 → BR-31, BR-88, BR-91, BR-95 → BR-97 |

### **3.3 Shoe Scanning & 3D Model**

#### *3.3.1 Quét giày (SC-22, SC-23 \+ SF-01, SF-02)*

| Mục | Nội dung |
| :---- | :---- |
| **Trigger** | Mobile → tab “Quét AI” (Bước 01). |
| **Mô tả** | Camera (getUserMedia trong WebView Tauri) có khung dẫn hướng oval, hướng dẫn “Đặt đôi giày vào khung và xoay 360°”, quay video tối thiểu 720p (khuyến nghị 1080p nếu thiết bị hỗ trợ), nút “Bắt đầu tạo lưới 3D bằng AI”. Trước khi gửi: xác nhận quyền sở hữu (BR-38) và tuỳ chọn đồng ý dùng làm nội dung truyền thông (BR-87). Sau khi gửi, AfterScan hiển thị checklist tiến trình: “Đang tải video/ảnh lên…” → “AI đang tạo lưới 3D…” → “Đang nén sang GLB… Sẵn sàng\!” rồi mở trình xem 3D, kèm link/QR để tiếp tục thiết kế trên Web/Desktop. |
| **Dữ liệu & validation** | Tối đa 30 ảnh hoặc video ≤60 giây, tổng ≤200MB (BR-34). Kiểm tra chất lượng tại chỗ trước khi cho gửi (BR-33). |
| **Xử lý** | Kiểm tra quyền (Basic/Pro, còn lượt – BR-99, MSG28) → tạo SCAN\_JOB, giữ chỗ lượt (BR-35) → SF-01 gọi API dựng 3D, SF-14 ghi chi phí → GLB \+ zoning → quality\_score → BASE\_MODEL → trừ lượt. Ngay sau đó cho phép **xuất file scan gốc** (UC-11) hoặc tạo dự án (BR-42). |
| **Luồng bất thường** | Không đạt kiểm tra tại chỗ → MSG31. Không phải giày → không trừ lượt (BR-39, MSG34). Lỗi đầu vào → hoàn lượt tối đa 1 lần/chu kỳ (BR-36, MSG33). Lỗi hệ thống/quá 30 phút → FAILED\_SYSTEM, nhả lượt (BR-35, BR-37). quality\_score \<60 → vẫn cho thiết kế/xuất kèm cảnh báo (BR-40, MSG35). Ngân sách API cạn → MSG43 (BR-79). |
| **BR áp dụng** | BR-33 → BR-42, BR-79, BR-87, BR-99 |

#### *3.3.2 Chọn phôi có sẵn*

| Mục | Nội dung |
| :---- | :---- |
| **Trigger** | “Chọn mẫu giày” (Bước 01 Landing) hoặc trong Kus Studio. |
| **Mô tả** | Thư viện phôi chuẩn KusShoes; gói Free chỉ có 3 mẫu, Basic/Pro có toàn bộ thư viện. |
| **BR áp dụng** | BR-41 |

### **3.4 Design & Editor**

#### *3.4.1 Quản lý dự án — My Designs (SC-07)*

| Mục | Nội dung |
| :---- | :---- |
| **Trigger** | Dashboard → “+ Tạo dự án mới” hoặc menu “Thiết kế của tôi”. |
| **Mô tả** | 2 chế độ xem: **Grid** (thẻ ảnh preview \+ badge trạng thái) và **List** (bảng: Tên thiết kế, mã tệp KS-2026xxx.glb, Trạng thái, Sửa lần cuối, Dung lượng, Thao tác). Bộ đếm đầu trang: Tổng thiết kế / Đang chỉnh sửa / Đã export / Bản nháp. Filter theo trạng thái (Tất cả/Baked/Đang chỉnh/Đã xuất/Nháp), sắp xếp (Mới nhất), tìm kiếm theo tên. Menu “···” mỗi thiết kế: Mở Editor, Nhân bản, Đổi tên, Xuất/Tải về, Xoá. |
| **Trạng thái dự án** | NHÁP (mới tạo, chưa chỉnh sửa đáng kể) → ĐANG CHỈNH (đang có thay đổi chưa chốt) → BAKED (đã bake preview/render 3D) → ĐÃ XUẤT (đã xuất file ít nhất 1 lần) (BR-43). |
| **Dữ liệu & validation** | Số dự án ≤ hạn mức gói (3/20/50) → vượt thì chặn tạo mới (BR-46), MSG21. |
| **Xử lý** | Tự động lưu; giữ 20 phiên bản gần nhất (Pro: 50\) (BR-44). |
| **Luồng bất thường** | Dự án đang xuất file → khoá chỉnh sửa tạm thời (BR-45), MSG22. Xoá → thùng rác 30 ngày (BR-47). |
| **BR áp dụng** | BR-43 → BR-48, BR-100 |

#### *3.4.2 Kus Studio — Editor 3D (SC-19)*

**Bố cục (“KUSSHOES DESKTOP STUDIO”):** thanh trên cùng — logo, tabs **STUDIO / CUSTOMIZE / EXPORT**, tên bản nháp (Draft name), trạng thái “PREVIEW READY”, nút **Save Draft / Bake Preview / Export**, biểu tượng cài đặt. Giữa — viewport 3D hiển thị model giày. Phải — panel **Design Tools**: **Add Text**, **Upload Image**, **Draw Artwork**, thư viện **Sticker** có filter (All/Featured/Street/Racing/Marks/Type) dạng lưới cuộn; dưới cùng panel **Layers** (danh sách layer đã thêm, vd. sticker\_001).

| Mục | Nội dung |
| :---- | :---- |
| **Trigger** | Từ SC-23 (AfterScan), SC-07 (My Designs), hoặc chọn phôi có sẵn. |
| **Mô tả** | Người dùng chọn Zone, rồi: đổi màu hiển thị; **Add Text** (chữ ký/text, font hoặc mô phỏng viết tay); **Upload Image** (ảnh người dùng tải lên, tự động qua SF-03 AI Background Removal trước khi áp); **Draw Artwork** (vẽ tay tự do trực tiếp lên model bằng chuột/bút cảm ứng); chọn từ **Sticker Library**. Hỗ trợ di chuyển/xoay/scale/lật, undo/redo, mirror sang chiếc còn lại, xem trải phẳng 2D, quản lý layer. **Save Draft** lưu nháp; **Bake Preview** chốt render 3D chất lượng cao (chuyển trạng thái dự án sang BAKED); **Export** mở SC panel xuất file. |
| **Dữ liệu & validation** | Màu/vật liệu chỉ minh hoạ trực quan, không đảm bảo đúng khi gia công thủ công (BR-49). Ảnh tải lên PNG/JPG/SVG ≤20MB (BR-50); xác nhận bản quyền bắt buộc (BR-51). Tối đa 5 layer/Zone, 30/dự án (Pro: 60\) — áp dụng chung cho sticker/text/draw (BR-52, BR-58). Chữ ký/text ≤20 ký tự/vị trí (BR-54). |
| **Xử lý** | Mỗi thao tác cập nhật viewport ≤300ms (NFR-PER-03). Guardrail nội dung (SF-04) chạy khi chèn chữ/ảnh/sticker (BR-73). Auto-save 30 giây; mở cùng lúc hai thiết bị → phiên sau chỉ xem (BR-100). Trái/phải khác nhau → xuất 2 file trong cùng 1 lượt (BR-56). |
| **Luồng bất thường** | Chữ/nhãn hiệu bị cấm → chặn, MSG24. Free/gói không đủ dùng Draw Artwork hoặc layer nâng cao → chặn kèm CTA nâng cấp (BR-57), MSG25. |
| **BR áp dụng** | BR-49 → BR-58 (trừ BR-55 – đã gộp), BR-73, BR-100, BR-110 |

#### *3.4.3 AI tách nền ảnh tải lên (tích hợp trong Upload Image, SF-03)*

| Mục | Nội dung |
| :---- | :---- |
| **Trigger** | Người dùng bấm “Upload Image” trong Kus Studio. |
| **Mô tả** | Theo Landing page (“AI tách nền tức thì”): người dùng tải ảnh bất kỳ, AI tự động loại nền trong vài giây, kết quả là sticker/decal nền trong suốt sẵn sàng dán lên model. **Đây là tính năng AI**&nbsp;&nbsp; |
| **Dữ liệu & validation** | Ảnh PNG/JPG/SVG ≤20MB (BR-50). |
| **Xử lý** | Mỗi lượt tách nền **thành công** trừ 1 AI Credit theo bảng 3.2.8 (BR-59). Pricing ghi đúng số lượt, không dùng “không giới hạn” (BR-92) – đã xử lý câu hỏi mở số 2 của v2.1. Hết credit → MSG47. |
| **Luồng bất thường** | Tách nền lỗi/timeout → giữ ảnh gốc, cho người dùng tự crop thủ công (BR-60). |
| **BR áp dụng** | BR-59, BR-60 |

#### *3.4.4 Template Gallery (giữ theo đặc tả trước —  chưa có màn hình)*

| Mục | Nội dung |
| :---- | :---- |
| **Mô tả** | Duyệt/áp template có sẵn. **Phase 1:** chỉ template do KusShoes tạo, Admin duyệt trước khi công khai. **Phase 2:** mở cho Creator, chia sẻ doanh thu 30%. |
| **BR áp dụng** | BR-61 → BR-63 (BR-64, BR-76: Phase 2\) |

### **3.5 Preview & Export**

#### *3.5.1 Xem trước & Bake Preview*

| Mục | Nội dung |
| :---- | :---- |
| **Mô tả** | Xoay 360°, đổi ánh sáng; “Bake Preview” chốt bản render chất lượng cao dùng cho xuất file và ảnh chia sẻ. |
| **Xử lý** | Free luôn gắn watermark (BR-65). Khuyến cáo sai lệch màu hiển thị vs. thực tế (BR-66). |
| **BR áp dụng** | BR-65, BR-66 |

#### *3.5.2 Xuất file thiết kế & gói tham khảo cho nghệ nhân (SF-07)*

| Mục | Nội dung |
| :---- | :---- |
| **Trigger** | Kus Studio → tab “Export”; hoặc My Designs → “Xuất/Tải về”. |
| **Mô tả** | Xuất GLB texture 2K (Basic) hoặc GLB \+ OBJ texture 4K (Pro; FBX khi adapter hỗ trợ) kèm ảnh render, video xoay, và **Gói tham khảo** PDF theo nội dung tối thiểu ở BR-71; khách có thể nhập size giày (EU/US) để gói tham khảo ghi kích thước theo mm. Sau khi xuất, khách có thể tạo link cho nghệ nhân (mục 3.5.3). |
| **Dữ liệu & validation** | Free chỉ tải ảnh render PNG có watermark (BR-67). Gói tham khảo chỉ Basic+ (BR-71). Gói ở trạng thái GRACE không xuất được (BR-90). |
| **Xử lý** | File thuộc quyền sử dụng của khách, không ràng buộc bên gia công nào (BR-69). Một lần Export thành công \= 1 lượt xuất (BR-72); ghi EXPORT\_LOG, hiển thị lại trong lịch sử xuất file. Phiên bản đã xuất được ghim và bất biến (BR-43, BR-44). |
| **BR áp dụng** | BR-48, BR-56, BR-65 → BR-72 (BR-70 đã gộp) |

#### *3.5.3 Link cho nghệ nhân (UC-26, SC-34 \+ SF-20)*

| Mục | Nội dung |
| :---- | :---- |
| **Trigger** | My Designs / tab Export → “Chia sẻ cho nghệ nhân” trên một phiên bản đã xuất. |
| **Mô tả** | **Phía khách:** tạo link, xem danh sách link của dự án (phiên bản, hạn dùng, số lượt tải còn lại, trạng thái), gia hạn hoặc thu hồi. **Phía nghệ nhân (không cần tài khoản):** mở link → trình xem 3D, thông tin phiên bản và ngày xuất, nút tải gói tham khảo PDF và file 3D, tuyên bố: KusShoes không tổ chức sản xuất và không bảo đảm chất lượng gia công; màu hiển thị có thể sai lệch. |
| **Dữ liệu & validation** | Chỉ Basic/Pro; chỉ tạo từ phiên bản ĐÃ XUẤT; token ngẫu nhiên ≥128 bit; hạn 30 ngày; tối đa 20 lượt tải/link. |
| **Xử lý** | SF-20 cấp token, mỗi lần tải cấp signed URL ≤15 phút, ghi EXPORT\_LOG (người tải \= link nghệ nhân), không trừ lượt xuất của chủ. |
| **Luồng bất thường** | Link hết hạn / hết lượt / bị thu hồi / dự án bị xoá / tài khoản bị khoá → MSG48. Gói của chủ hết hạn → link vẫn dùng được đến hết hạn link. |
| **BR áp dụng** | BR-49, BR-66, BR-69, BR-71, BR-72, BR-101, BR-102 |

### **3.6 Administration**

#### *3.6.1 Dashboard vận hành (SC-28)*

| Mục | Nội dung |
| :---- | :---- |
| **Mô tả** | KPI: Tổng người dùng, MRR, Lượt xuất (mỗi KPI kèm % so với tháng trước). Biểu đồ Doanh thu theo tháng (MRR gộp) và Tăng trưởng người dùng (đăng ký mới/tháng). Bảng “Người dùng gần đây” (tên, email, gói, trạng thái, ngày tham gia, MRR, nút Xem). |
| **BR áp dụng** | BR-83, BR-104 |

#### *3.6.2 Quản lý người dùng (SC-29, SC-30)*

| Mục | Nội dung |
| :---- | :---- |
| **Mô tả — Danh sách (SC-29)** | Bộ đếm: Tổng/Hoạt động/Đang dùng thử/Đã rời. Filter theo gói (Free/Basic/Pro/Team), tìm theo tên/email, phân trang. |
| **Mô tả — Chi tiết (SC-30)** | Thông tin tài khoản (email đã xác minh, SĐT, vai trò, ngày tham gia, hoạt động lần cuối, vị trí, trạng thái); **Gói & thanh toán** (đổi gói hộ, lịch sử thanh toán); **Thiết kế của người dùng** \+ dung lượng sử dụng; **Nhật ký hoạt động** (đăng nhập, tạo thiết kế, xuất file, nâng cấp, thanh toán, cập nhật hồ sơ); **Vùng nguy hiểm** — Khoá tài khoản / Xoá tài khoản. Nút **“Mạo danh đăng nhập”** và **“Đặt lại mật khẩu”** để hỗ trợ khách hàng. |
| **Xử lý** | Mạo danh đăng nhập → SF-15 ghi AUDIT\_LOG (admin, user mục tiêu, lý do, thời gian bắt đầu/kết thúc); phiên mạo danh giới hạn thời gian và hiển thị banner cảnh báo cho admin trong suốt phiên (BR-80). Khoá tài khoản chặn đăng nhập ngay; xoá tài khoản theo BR-06 (BR-81). |
| **BR áp dụng** | BR-78, BR-80, BR-81, BR-103 |

#### *3.6.3 Phân tích doanh thu (SC-31)*

| Mục | Nội dung |
| :---- | :---- |
| **Mô tả** | KPI: MRR, ARR, ARPU, Tỉ lệ rời bỏ (churn). Biểu đồ MRR theo tháng, Doanh thu theo gói (Pro/Basic/Team/Free, % đóng góp). Bảng giao dịch gần đây. Giữ chân & chuyển đổi: Net Revenue Retention, Gross Revenue Retention, tỉ lệ Free→Trả phí, **tỷ lệ khách quay lại** (BR-105). Thanh toán lỗi & hoàn tiền: số giao dịch thất bại (30 ngày) \+ MRR rủi ro, tỉ lệ thu hồi (dunning), hoàn tiền tháng này. Khách hàng doanh thu cao (top theo MRR/LTV). Biến động MRR: MRR mới, mở rộng, kích hoạt lại, thu hẹp, rời bỏ → Net New MRR. Bộ lọc khoảng thời gian (Hôm nay/7 ngày/30 ngày/Quý này/Năm nay) \+ so sánh kỳ trước. **Mọi chỉ số loại tài khoản nội bộ và gói COMP; định nghĩa theo mục 5.4.** |
| **BR áp dụng** | BR-83, BR-103, BR-104, BR-105, BR-107 |

#### *3.6.4 Tạo & lên lịch báo cáo (SC-32 \+ SF-16)*

| Mục | Nội dung |
| :---- | :---- |
| **Mô tả** | 9 loại báo cáo: Doanh thu (MRR/ARR/giao dịch/hoàn tiền), Người dùng (đăng ký/hoạt động/churn), Thiết kế (số thiết kế/lượt export), Gói đăng ký (phân bổ/tỉ lệ chuyển đổi), Hoạt động xuất file (GLB/OBJ/ZIP theo thời gian), Kiểm duyệt nội dung (thiết kế bị báo cáo/vi phạm), **Sổ giao dịch EXE201** (BR-106), **Phễu theo kênh** (BR-107), **Chi phí API theo ngày** (BR-108) — mỗi loại xuất PDF/CSV/XLSX. Bảng “Báo cáo gần đây” (tên, loại, khoảng thời gian, ngày tạo, định dạng, trạng thái Sẵn sàng/Đang xử lý, tải về). Báo cáo định kỳ: tên, tần suất (Hàng tuần/Hàng tháng/Hàng quý), người nhận (email), lần chạy kế tiếp, bật/tạm dừng. |
| **Xử lý** | SF-16 sinh file theo yêu cầu hoặc lịch cron, gửi email người nhận khi báo cáo định kỳ hoàn tất. |
| **BR áp dụng** | BR-82, BR-88, BR-106 → BR-108 |

#### *3.6.5 Cấu hình gói & guardrail nội dung, Kiểm duyệt nội dung*

&nbsp;

| BR áp dụng | BR-61 → BR-63, BR-73 → BR-78 |
| :---- | :---- |

#### *3.6.6 Giao dịch thủ công, hoàn tiền & khoá sổ (UC-28, UC-29, SC-35)*

| Mục | Nội dung |
| :---- | :---- |
| **Trigger** | Admin → “Giao dịch”. |
| **Mô tả** | Danh sách giao dịch (lọc trạng thái, kênh đến, người phụ trách, khoảng thời gian, cờ nội bộ). **Tạo giao dịch thủ công:** khách, loại hàng hoá, số tiền, ngày, hình thức, người thu, ảnh chứng từ, lý do. **Hoàn tiền:** chọn giao dịch, số tiền, lý do. **Khoá sổ:** chọn khoảng thời gian → khoá. Nút xuất “Sổ giao dịch EXE201”. |
| **Xử lý** | Giao dịch thủ công ở trạng thái chờ duyệt đến khi một Admin khác duyệt → MANUAL\_CONFIRMED → kích hoạt gói, SF-18 sinh biên nhận. Hoàn tiền tạo REFUND đối ứng, cập nhật trạng thái gói. Mọi thao tác ghi AUDIT\_LOG. |
| **Luồng bất thường** | Thiếu chứng từ → không lưu được. Người tạo tự duyệt → chặn. Sửa giao dịch trong kỳ đã khoá → chặn, hướng dẫn tạo bút toán ở kỳ đang mở. |
| **BR áp dụng** | BR-31, BR-83, BR-95, BR-97, BR-98, BR-103, BR-106 |

#### *3.6.7 Phản hồi khách hàng (UC-25, SC-36)*

| Mục | Nội dung |
| :---- | :---- |
| **Trigger** | Khách: form tự hiện sau lần xuất file đầu tiên hoặc phiên thứ 3, hoặc menu “Góp ý”. Admin: menu “Phản hồi”. |
| **Mô tả** | Khách chọn mức hài lòng 1–5, viết nội dung, chọn nhóm khách, tick đồng ý được liên hệ. Admin xem danh sách, đổi trạng thái (NEW → REVIEWED → PLANNED → DONE/WONT\_DO), ghi “đã đổi gì trong sản phẩm” và nhóm 4P, xuất theo cột sổ 10\. |
| **Xử lý** | Tối đa 1 lần hiện form/14 ngày/tài khoản; phản hồi từ tài khoản nội bộ được đánh dấu và loại khỏi thống kê. |
| **BR áp dụng** | BR-83, BR-109 |

## **4\. Non-Functional Requirements**

### **4.1 External Interfaces**

| Hệ thống ngoài | Giao thức | Dữ liệu trao đổi | Xử lý khi lỗi |
| :---- | :---- | :---- | :---- |
| **3D Scan Service** | REST \+ webhook | Ảnh/video → GLB \+ texture \+ metadata | Thử lại 2 lần → FAILED\_SYSTEM, nhả lượt; ghi chi phí mọi lần gọi (SF-14) |
| **AI Background Removal Service** | REST | Ảnh gốc → ảnh đã tách nền | Timeout → giữ ảnh gốc, cho crop thủ công |
| **Payment Gateway** (PayOS VietQR / MoMo / VNPay) | REST \+ webhook có chữ ký | Mã giao dịch, số tiền → kết quả | Xác thực chữ ký; idempotent; PENDING \>30 phút tự huỷ; webhook trễ vẫn ghi nhận (BR-30) |
| **Cloud Storage \+ CDN** | S3-compatible | Model 3D, texture, ảnh, PDF, file backup (.zip) | Signed URL ≤15 phút |
| **Push / Email Service** | REST | Thông báo, email xác thực/hoá đơn/2FA | Hàng đợi gửi lại |
| **OAuth Providers** (Google, Apple) | OAuth 2.0 | Token, email, tên, avatar | Fallback email–mật khẩu |

### **4.2 Quality Attributes**

#### *4.2.1 Usability*

NFR-USA-01 Hoàn tất thiết kế đầu tiên ≤5 phút. NFR-USA-02 Hướng dẫn quét trực quan từng bước. NFR-USA-03 Giao diện song ngữ Việt/Anh (Settings → Ngôn ngữ). NFR-USA-04 WCAG 2.1 AA. NFR-USA-05 Thông báo lỗi nêu rõ nguyên nhân \+ hành động khắc phục. NFR-USA-06 Mọi hạn mức hiển thị kèm định nghĩa ngắn và ngày reset (BR-92).

#### *4.2.2 Reliability*

NFR-REL-01 Khả dụng ≥99,5%/tháng cho auth/editor. NFR-REL-02 Backup hằng ngày, RPO≤24h/RTO≤4h. NFR-REL-03 Dịch vụ 3D gián đoạn vẫn cho thiết kế trên phôi chuẩn. NFR-REL-04 Retry+backoff+DLQ cho tác vụ bất đồng bộ. NFR-REL-05 Auto-save mỗi 30 giây.

#### *4.2.3 Performance*

NFR-PER-01 Editor ≥30 FPS. NFR-PER-02 Tải model ≤5s. NFR-PER-03 Cập nhật viewport ≤300ms (thay BR-55). NFR-PER-04 Dựng model ≤10 phút (p95). NFR-PER-05 API ≤500ms (p95). NFR-PER-06 1.000 user đồng thời \+ 100 Scan Job hàng đợi.

#### *4.2.4 Security*

NFR-SEC-01 HTTPS/TLS1.2+. NFR-SEC-02 bcrypt/argon2. NFR-SEC-03 RBAC tầng server. NFR-SEC-04 không lưu thẻ/ví. NFR-SEC-05 Signed URL ≤15 phút cho file/gói tham khảo. NFR-SEC-06 Rate limiting scan/AI/xuất file. NFR-SEC-07 Quét virus file tải lên. NFR-SEC-08 Audit log thao tác quản trị \+ mạo danh đăng nhập. **NFR-SEC-09** 2FA khả dụng cho mọi tài khoản (Authenticator/Email; SMS khi đã tích hợp), bắt buộc với Admin; phiên đăng nhập gắn DEVICE\_SESSION, thu hồi được theo thiết bị. NFR-SEC-10 Token link nghệ nhân ≥128 bit ngẫu nhiên, không ghi token đầy đủ vào log. NFR-SEC-11 Access token ≤15 phút.

#### *4.2.5 Maintainability*

NFR-MNT-01 Bảng giá/hạn mức/guardrail cấu hình qua CMS. NFR-MNT-02 Dịch vụ 3D/AI qua lớp adapter. NFR-MNT-03 Worker 3D mở rộng ngang. NFR-MNT-04 Test coverage ≥70% cho subscription/quota/guardrail.

#### *4.2.6 Compliance*

NFR-LEG-01 Nghị định 13/2023/NĐ-CP. NFR-LEG-02 ToS & Chính sách bảo mật. NFR-LEG-03 Quy trình khiếu nại bản quyền. NFR-LEG-04 Hoá đơn điện tử cho thanh toán gói – áp dụng khi đã có pháp nhân; trước đó phát hành biên nhận thanh toán (BR-31). **NFR-LEG-05** Người dùng có quyền tải xuống toàn bộ dữ liệu cá nhân và yêu cầu xoá tài khoản (quyền truy cập & xoá dữ liệu theo Nghị định 13). NFR-LEG-06 Trang Điều khoản, Chính sách bảo mật, Chính sách hoàn tiền công khai, có phiên bản; app Android nêu rõ mục đích quyền camera và liên kết Chính sách bảo mật.

## **5\. Requirement Appendix**

### **5.1 Business Rules**

Mục này thay thế bảng Business Rules của v2.1. **Số hiệu cũ được giữ nguyên** để không làm vỡ tham chiếu ở mục 3; quy tắc mới đánh số BR-83 → BR-110. Mỗi quy tắc ghi: nội dung chuẩn hoá (điều kiện → hệ quả, ngoại lệ), lý do theo stakeholder (viết tắt ở mục 2.3) và nơi áp dụng (UC/SC/SF, mã thông báo).

| Trạng thái | Ý nghĩa |
| :---- | :---- |
| **Giữ** | Giữ nội dung v2.1 (có thể viết lại câu cho rõ). |
| **Sửa** | Đổi nội dung hoặc bổ sung điều kiện – nền vàng. |
| **Mới** | Quy tắc mới trong v2.2 – nền xanh. |
| **Gộp / Hoãn** | Gộp vào mục khác, hoặc chuyển Phase 2 – nền xám. |

#### *5.1.1 Tài khoản, định danh & ghi nhận nguồn khách*

| ID | Quy tắc | Lý do · Stakeholder | Áp dụng |
| :---- | :---- | :---- | :---- |
| **BR-01** ***Sửa*** | Một email (so khớp không phân biệt hoa/thường, đã bỏ khoảng trắng) chỉ gắn với **một** tài khoản. Đăng nhập Google/Apple có email trùng tài khoản sẵn có → liên kết vào tài khoản đó sau khi người dùng xác minh, không tạo tài khoản mới. | KH: không mất dữ liệu khi đổi cách đăng nhập. GV/VS: một người \= một khách, không đếm trùng KPI. | UC-01 MSG01 |
| **BR-02** ***Sửa*** | Người dùng phải **đủ 16 tuổi** (tự xác nhận khi đăng ký). Người dưới 18 tuổi khi thanh toán phải tick cam kết đã có sự đồng ý của cha mẹ/người giám hộ. Hệ thống **không** thu thập CCCD hay thông tin người giám hộ. | PL: NĐ 13/2023 – tối thiểu hoá dữ liệu. VS: nhóm khách chính là sinh viên, không đủ năng lực xử lý hồ sơ giám hộ. | UC-01, UC-09 MSG02 |
| **BR-03** ***Sửa*** | Tài khoản **UNVERIFIED** được thiết kế trên phôi chuẩn và lưu nháp, nhưng bị chặn: thanh toán, quét giày, xuất file, tạo link nghệ nhân. Link xác thực email hết hạn sau 24 giờ; gửi lại tối đa 5 lần/giờ. | VS/GV: tài khoản rác làm méo số đăng ký và conversion. KH: email là nơi nhận biên nhận. | UC-01, UC-09, UC-10, UC-17 MSG13 |
| **BR-04** ***Giữ*** | Link đặt lại mật khẩu hết hiệu lực sau 15 phút hoặc sau lần dùng đầu tiên. Màn hình “Quên mật khẩu” luôn trả cùng một thông báo, không tiết lộ email có tồn tại hay không. | KH: an toàn tài khoản. | UC-01 MSG03 |
| **BR-08** ***Giữ*** | Ảnh đại diện: JPG/PNG, ≤5MB; ảnh đi qua guardrail nội dung (SF-04) trước khi hiển thị công khai. | KH, VS. | UC-03 MSG04 |
| **BR-09** ***Giữ*** | Đổi email chỉ có hiệu lực sau khi xác thực email mới; email cũ nhận thông báo. Biên nhận đã phát hành giữ nguyên email tại thời điểm giao dịch. | KH: chống chiếm đoạt tài khoản. VS: biên nhận bất biến (CR-08). | UC-03 MSG05 |
| **BR-10** ***Sửa*** | @handle duy nhất toàn hệ thống, 3–30 ký tự \[a-z 0-9 . \_\], không phân biệt hoa/thường, không dùng từ dành riêng (admin, kusshoes, support…); đổi tối đa 1 lần/30 ngày. | KH: link hồ sơ ổn định. VS: chống mạo danh thương hiệu. | UC-03 MSG06 |
| **BR-83** ***Mới*** | **Tài khoản nội bộ:** tài khoản của thành viên VietStride và tài khoản demo/test được Admin gắn cờ is\_internal. Mọi giao dịch, lượt quét, đăng ký của tài khoản nội bộ **không** được tính vào KPI khách trả tiền, doanh thu báo cáo, CAC, conversion, tỷ lệ khách quay lại. | GV/MT: số liệu phải phản ánh khách thật. VS (R6): tránh số trong report lệch sổ. | UC-20, UC-21, UC-22 |
| **BR-84** ***Mới*** | **Kênh đến (first-touch):** tham số utm\_source/utm\_campaign hoặc mã giới thiệu (?ref=) của lần truy cập đầu được lưu 30 ngày và gắn vào USER khi đăng ký. Không có dữ liệu (hoặc khách từ chối cookie phân tích) → hỏi bắt buộc “Bạn biết KusShoes từ đâu?” ở checkout đầu tiên. Giá trị chuẩn: *Trực tiếp / TikTok / Facebook / Email / Giới thiệu (WOM) / Khác*. Kênh đến chốt tại giao dịch trả tiền đầu tiên; chỉ Admin sửa được, bắt buộc lý do và ghi AUDIT\_LOG. | GV: O2 chấm conversion & CAC, O3 chấm hiệu quả từng kênh. VS (R4, R5): tách đường A (bán trực tiếp) và đường B (traffic). | UC-01, UC-09 SF-19 |
| **BR-85** ***Mới*** | **Mã giới thiệu nhân viên bán:** mỗi thành viên có một mã ref cố định (vd. KUS-R4). Đơn có mã ref ghi nhận “người phụ trách” để đối chiếu danh sách khách cần tiếp cận. Mã ref **không** tạo giảm giá và không thay thế mã khuyến mãi. | VS (R4 Sales Lead): theo dõi ai chốt đơn nào. GV: minh bạch nguồn đơn. | UC-09, UC-22 |

#### *5.1.2 Bảo mật & phiên đăng nhập*

| ID | Quy tắc | Lý do · Stakeholder | Áp dụng |
| :---- | :---- | :---- | :---- |
| **BR-11** ***Giữ*** | Mật khẩu mới: ≥8 ký tự, có chữ HOA và thường, ≥1 số, ≥1 ký tự đặc biệt; không trùng mật khẩu hiện tại. | KH. | UC-04 MSG11 |
| **BR-12** ***Sửa*** | 2FA **tuỳ chọn** với Customer, **bắt buộc** với Admin. Phương thức: Authenticator (khuyến nghị) và Email; SMS chỉ hiển thị khi đã tích hợp nhà cung cấp SMS. Bật 2FA phải nhập đúng mã xác minh; hệ thống cấp 10 mã khôi phục dùng một lần. | VS: Admin có quyền mạo danh/đổi gói nên phải 2FA. NCC: SMS phát sinh chi phí theo tin. | UC-04 MSG37 |
| **BR-13** ***Sửa*** | Email khôi phục là **khuyến nghị** với Customer và **bắt buộc** trước khi bật 2FA; phải khác email chính và đã xác thực. | KH: lấy lại tài khoản khi mất thiết bị 2FA. | UC-04 MSG07 |
| **BR-14** ***Giữ*** | Đăng nhập từ thiết bị mới khi đã bật cảnh báo → gửi email; nếu bật “bắt buộc xác minh thiết bị lạ” → phải xác minh trước khi cấp phiên. | KH. | UC-04, UC-06 |
| **BR-16** ***Sửa*** | Danh sách thiết bị hiển thị tên thiết bị/trình duyệt, vị trí **ước lượng mức tỉnh/thành** từ IP, hoạt động lần cuối. “Đăng xuất” thu hồi refresh token của phiên đó ngay; access token còn lại tự hết hạn tối đa 15 phút. | KH: hiểu đúng “đăng xuất ngay” nghĩa là gì. Dev: định nghĩa kiểm thử được. | UC-06 MSG38 |
| **BR-17** ***Giữ*** | “Đăng xuất tất cả thiết bị khác” thu hồi mọi phiên trừ phiên hiện tại; tự động áp dụng sau khi đổi mật khẩu. | KH. | UC-04, UC-06 MSG36 |
| **BR-18** ***Sửa*** | Lịch sử đăng nhập lưu **90 ngày**: thời gian, thiết bị, trình duyệt, IP, vị trí ước lượng, kết quả. Người dùng thấy IP đã che octet cuối; Admin xem đầy đủ chỉ khi có lý do (ghi AUDIT\_LOG). | KH, PL: tối thiểu hoá hiển thị dữ liệu cá nhân. | UC-06 |
| **BR-86** ***Mới*** | Sai mật khẩu **5 lần trong 15 phút** (tính theo tài khoản và theo IP) → khoá đăng nhập 15 phút, gửi email cảnh báo cho chủ tài khoản. | KH: chống dò mật khẩu. (Trước đây chỉ nằm trong mô tả 3.2.1, chưa có BR.) | UC-01 MSG12 |

#### *5.1.3 Quyền riêng tư, đồng ý & dữ liệu cá nhân*

| ID | Quy tắc | Lý do · Stakeholder | Áp dụng |
| :---- | :---- | :---- | :---- |
| **BR-05** ***Giữ*** | Thông báo giao dịch (thanh toán, biên nhận, nhắc gia hạn, bảo mật) không thể tắt; chỉ thông báo marketing được tắt. | KH, PL. | SF-13 |
| **BR-06** ***Sửa*** | Xoá tài khoản: vô hiệu hoá ngay (không đăng nhập được, link nghệ nhân bị thu hồi), khôi phục được trong 30 ngày qua link email. Sau 30 ngày xoá vĩnh viễn dữ liệu cá nhân, ảnh/video scan, model và thiết kế. TRANSACTION và biên nhận được **giữ lại ở dạng ẩn danh** (thay tên/email bằng mã) cho kế toán và các kỳ báo cáo đã khoá sổ. | PL: quyền xoá dữ liệu (NĐ 13). GV/VS: số đã báo cáo không bị thay đổi sau khi khách xoá tài khoản. | UC-07 MSG39 |
| **BR-07** ***Giữ*** | Xoá tài khoản khi gói trả phí còn hiệu lực → cảnh báo mất quyền lợi đến ngày hết hạn, không hoàn tiền (trừ khi thoả BR-97). | KH, VS. | UC-07 MSG15 |
| **BR-15** ***Sửa*** | **Riêng tư theo mặc định:** hồ sơ công khai, hiển thị thiết kế, cho phép tìm kiếm, cookie phân tích/quảng cáo đều **TẮT** cho đến khi người dùng bật. Thay đổi có hiệu lực ngay. | PL: NĐ 13 yêu cầu đồng ý rõ ràng. KH: kiểm soát dữ liệu. | UC-05 |
| **BR-19** ***Sửa*** | Người dùng tải toàn bộ dữ liệu (.zip) tối đa 1 lần/24 giờ; gói dữ liệu tồn tại 7 ngày, mỗi lần tải cấp signed URL ≤15 phút (NFR-SEC-05). | PL: quyền truy cập dữ liệu. NCC: chi phí băng thông. | UC-07 SF-11 MSG40 |
| **BR-20** ***Sửa*** | Chỉ nhập được tệp sao lưu do KusShoes xuất (kiểm tra checksum). Dữ liệu nhập được tạo thành **bản sao mới**, không ghi đè, và tính vào hạn mức dự án (BR-46). | KH: không mất dữ liệu hiện có. VS: chống vượt hạn mức qua import. | UC-07 MSG08 |
| **BR-21** ***Giữ*** | “Xoá cache” chỉ xoá dữ liệu tạm phía client, không ảnh hưởng dữ liệu trên server. | KH. | UC-07 |
| **BR-22** ***Giữ*** | Xoá tài khoản bắt buộc xác nhận rõ ràng (nhập lại mật khẩu hoặc gõ “XOÁ”) trước khi thực thi. | KH. | UC-07 MSG39 |
| **BR-87** ***Mới*** | **Đồng ý dùng nội dung cho truyền thông:** ảnh/video scan, model và thiết kế của khách chỉ được team dùng làm nội dung TikTok/Facebook/slide khi khách tick ô đồng ý **riêng** (tách khỏi ToS, rút lại được bất cứ lúc nào). Khi khách rút đồng ý, team gỡ nội dung đã đăng trong 72 giờ. | KH: quyền với hình ảnh đồ vật cá nhân. VS (R5): nội dung chủ lực là video scan → cần căn cứ hợp lệ. | UC-05, UC-10 |
| **BR-88** ***Mới*** | **Thông tin đơn trong báo cáo học thuật:** checkout có ô đồng ý (không bắt buộc) cho phép dùng thông tin đơn trong báo cáo EXE201. Mọi biên nhận/bảng xuất dùng làm minh chứng **luôn che** email, SĐT; tên hiển thị dạng rút gọn (vd. Nguyễn V. A) nếu khách đồng ý, ngược lại chỉ hiển thị mã khách. | GV: cần minh chứng giao dịch thật. KH, PL: không lộ dữ liệu cá nhân trong slide/report. | UC-09, UC-22 |
| **BR-89** ***Mới*** | Mỗi lần đồng ý (ToS, Chính sách bảo mật, Chính sách hoàn tiền, BR-87, BR-88, cookie) ghi CONSENT\_RECORD gồm phiên bản văn bản, thời điểm, kênh. Khi ToS/Chính sách đổi phiên bản, người dùng phải đồng ý lại ở lần đăng nhập kế tiếp. | PL: chứng minh được đã có đồng ý. VS: điều khoản tối thiểu cho Market-readiness (O1). | UC-01, UC-05, UC-09 MSG09 |

#### *5.1.4 Gói dịch vụ, hạn mức & giá*

| ID | Quy tắc | Lý do · Stakeholder | Áp dụng |
| :---- | :---- | :---- | :---- |
| **BR-92** ***Mới*** | **Bảng quyền lợi gói ở mục 3.2.8 là nguồn sự thật duy nhất.** Pricing, Dashboard, Settings, email và checkout đọc cùng một cấu hình (NFR-MNT-01), không ghi cứng. Không dùng cụm “không giới hạn” cho quyền lợi có đồng hồ đếm. | KH: thấy cùng một con số ở mọi nơi. (Giải quyết mâu thuẫn “AI tách nền không giới hạn” vs “AI Credits 45/100”.) | UC-02, UC-08 |
| **BR-23** ***Sửa*** | Hạn mức theo chu kỳ (lượt quét của gói, AI Credit, lượt xuất) reset khi **tài khoản đó** sang chu kỳ mới (neo theo ngày thanh toán; Free neo theo ngày đăng ký), không cộng dồn. Lượt quét mua lẻ (Credit) **không** reset. Thứ tự trừ: lượt của gói trước, Credit sau. | KH: biết lượt nào sắp mất. Dev: SF-08 chạy hằng ngày, reset đúng tài khoản đến kỳ (không phải reset theo tháng dương lịch). | UC-08 SF-08 |
| **BR-24** ***Sửa*** | Nâng cấp Basic → Pro giữa chu kỳ: phí \= (giá Pro − giá Basic) × số ngày còn lại ÷ số ngày của chu kỳ, **làm tròn lên hàng nghìn**; hiệu lực ngay, giữ nguyên ngày neo. Hạn mức mới \= hạn mức Pro trừ phần đã dùng trong chu kỳ. Ví dụ: còn 15/30 ngày → (649.000 − 259.000) × 15/30 \= **195.000đ**. | KH: công thức minh bạch. VS (R6): doanh thu ghi nhận đúng số thực thu. | UC-08, UC-09 MSG18 |
| **BR-25** ***Sửa*** | **Không tự động trừ tiền gia hạn** (hệ thống không lưu thẻ/ví – NFR-SEC-04). Gói hết hiệu lực lúc 23:59 (GMT+7) ngày hết hạn; khách gia hạn thủ công. Hạ cấp Pro → Basic được đăng ký trước và áp dụng khi khách thanh toán gia hạn gói Basic. | KH: không bị trừ tiền bất ngờ. VS: mỗi lần gia hạn là một tín hiệu “khách quay lại” đo được (BR-105). | UC-08 SF-09, SF-17 |
| **BR-90** ***Mới*** | Nhắc gia hạn qua email \+ thông báo app ở **T−3, T−1 và T0**. **Ân hạn 3 ngày** (trạng thái GRACE): xem, chỉnh sửa, lưu được; không quét, không xuất, không tạo link nghệ nhân. Hết ân hạn → về Free (SF-09). Gia hạn trong ân hạn: chu kỳ mới tính tiếp từ ngày hết hạn cũ. | KH: không mất việc đang dở. VS: giảm churn không chủ ý trong mô hình gia hạn thủ công. | UC-08 SF-17 MSG26 |
| **BR-26** ***Sửa*** | Mã khuyến mãi: mỗi mã dùng 1 lần/tài khoản, không cộng gộp; có thời hạn, số lượng tối đa, gói áp dụng. Giá sau giảm không nhỏ hơn 0\. Biên nhận thể hiện đủ **giá niêm yết, giảm giá, số thực trả**. | GV/MT: doanh thu báo cáo là số thực thu, không phải giá niêm yết. | UC-09 MSG27 |
| **BR-91** ***Mới*** | **Early Bird (CHƯA DUYỆT — chỉ Admin bật khi team quyết theo ngưỡng chặn cuối tuần 5):** giảm gói Basic **tháng đầu** còn 129.000đ; chỉ áp cho tài khoản chưa từng có giao dịch trả tiền; không áp cho Pro/Credit; kỳ gia hạn sau tính giá niêm yết 259.000đ. | VS (R4): đòn chốt đơn có điều kiện. GV: quyết định giá có căn cứ (4P – Price, O2). | UC-09, UC-23 |
| **BR-27** ***Sửa*** | Hạ về Free mà số dự án vượt hạn mức → khách chọn dự án giữ ở trạng thái chỉnh sửa (mặc định: các dự án sửa gần nhất); phần còn lại chuyển **read-only** (xem được, không sửa, không xoá dữ liệu). Nâng cấp lại → mở khoá ngay. | KH: không mất thiết kế. VS: hạn mức vẫn có ý nghĩa. | UC-08, UC-13 MSG16 |
| **BR-93** ***Mới*** | **Trong kỳ EXE201 chỉ bán gói Tháng.** Toggle Năm ẩn cho tới khi có giá năm chiết khấu thật. (Bản v2.1 ghi Basic năm 3.108.000đ “tiết kiệm 33%”, nhưng 3.108.000đ \= 12 × 259.000đ, tức không tiết kiệm; Pro năm 7.788.000đ \= 12 × 649.000đ cũng vậy.) | KH/PL: tránh quảng cáo sai sự thật. GV: đo được churn & khách quay lại trong 5–6 tuần. | UC-08 SC-02 |
| **BR-94** ***Mới*** | **Credit 49.000đ \= 1 lượt quét bổ sung**; chỉ mua được khi đang có gói Basic/Pro còn hiệu lực; tối đa 3 Credit/chu kỳ; hạn dùng 12 tháng kể từ ngày mua; Credit đã dùng không hoàn. | VS/MT: chi phí biên 32–49k/lượt → biên lợi nhuận Credit rất mỏng, cần trần. KH: có cách quét thêm khi hết lượt. | UC-27 MSG28 |
| **BR-32** ***Hoãn*** | Gói Team (299.000đ/người/tháng) chuyển sang **Phase 2**: ẩn khỏi Pricing trong kỳ EXE201 vì không nằm trong danh mục đã chốt (Free/Basic/Pro/Credit) và chưa có màn hình quản lý thành viên. | VS: tập trung 20 khách Basic. GV: portfolio trình bày nhất quán với CP4. | UC-18 |

#### *5.1.5 Thanh toán, biên nhận & hoàn tiền*

| ID | Quy tắc | Lý do · Stakeholder | Áp dụng |
| :---- | :---- | :---- | :---- |
| **BR-96** ***Mới*** | Phương thức thanh toán \= danh sách cổng đã tích hợp (cấu hình): chuyển khoản VietQR (PayOS), ví MoMo, VNPay (thẻ ATM/quốc tế nhập **trên trang của VNPay**). Màn hình KusShoes **không** có ô nhập số thẻ/CVC. | PL/NCC: không chạm dữ liệu thẻ (NFR-SEC-04). KH: dùng phương thức quen thuộc của sinh viên. | UC-09 SC-17 |
| **BR-28** ***Sửa*** | Giá niêm yết là **số tiền cuối cùng khách trả** (VND, đã gồm thuế nếu có). Dòng VAT chỉ hiển thị khi bật cấu hình thuế (khi đã có pháp nhân xuất hoá đơn); khi bật, VAT được **tách ra từ** giá niêm yết, không cộng thêm. | KH: không bị “cộng thêm 8%” ở bước cuối. VS: doanh thu sổ 07 khớp giá bán 259.000đ. | UC-09 SC-17 |
| **BR-29** ***Sửa*** | Chỉ kích hoạt/nâng gói khi: (a) webhook có **chữ ký hợp lệ**, số tiền và mã đơn khớp TRANSACTION đang PENDING; hoặc (b) Admin xác nhận thủ công theo BR-95. Webhook trùng được xử lý idempotent. Khách quay về trang “Hoàn tất” trước khi có webhook → hiển thị “Đang xác nhận”, **không** kích hoạt dựa trên redirect. | VS: chống giả mạo redirect. KH: biết đơn đang ở trạng thái nào. | UC-09 SF-05 MSG29 |
| **BR-30** ***Sửa*** | Giao dịch PENDING quá 30 phút → CANCELLED. Nếu webhook SUCCESS đến sau khi đã huỷ → vẫn ghi nhận SUCCESS, kích hoạt gói và cảnh báo Admin (tiền đã thu thì phải giao quyền lợi). | KH: không mất tiền oan. NCC: cổng có thể gửi webhook trễ. | UC-09 SF-06 MSG17 |
| **BR-31** ***Sửa*** | Mỗi giao dịch SUCCESS/MANUAL\_CONFIRMED sinh **một Biên nhận thanh toán PDF** mã KUS-xxx, bất biến sau khi phát hành, tải lại được bất cứ lúc nào. Trường bắt buộc: mã đơn, ngày giờ thanh toán, tên khách, email (che), loại hàng hoá (gói/Credit \+ chu kỳ), giá niêm yết, giảm giá, số thực trả, tình trạng thanh toán, hình thức thanh toán, mã tham chiếu cổng. Đây **không phải hoá đơn GTGT** cho tới khi bật NFR-LEG-04. | GV: O3 đòi file biên lai – thiếu là **fail môn**. KH: có chứng từ. VS (R4): mỗi đơn một file, đặt tên theo BR-106. | UC-09 SF-18 |
| **BR-95** ***Mới*** | **Giao dịch ngoài cổng:** mọi đơn, kể cả bán tận mặt, ưu tiên thanh toán bằng QR của cổng trên web để có bằng chứng hệ thống. Trường hợp tiền mặt/chuyển khoản trực tiếp: Admin tạo “Giao dịch thủ công” với **ảnh chứng từ, số tiền, ngày, người thu, lý do** (bắt buộc); trạng thái MANUAL\_CONFIRMED; người tạo và người duyệt phải là hai người khác nhau; ghi AUDIT\_LOG. | GV: biên lai phải kiểm chứng được. VS (R4, R6): đường A là kênh chính nên sẽ có đơn trực tiếp. | UC-28 SC-35 |
| **BR-97** ***Mới*** | **Hoàn tiền (đề xuất, cần team chốt và công bố trên trang Chính sách hoàn tiền):** hoàn 100% nếu yêu cầu trong 7 ngày kể từ thanh toán **và** chưa dùng lượt quét, chưa xuất file trong chu kỳ đó. Đã dùng → không hoàn, trừ khi lỗi hệ thống làm gián đoạn dịch vụ \>48 giờ (hoàn theo ngày). Hoàn tiền tạo bút toán REFUND đối ứng (CR-08), không sửa giao dịch gốc. Khách được hoàn toàn phần **không còn** được tính là khách trả tiền. | KH/PL: quyền lợi người tiêu dùng rõ ràng. VS: mỗi lượt quét đã tốn chi phí API. GV: KPI không bị thổi phồng. | UC-28 SC-35 MSG30 |

#### *5.1.6 Quét giày & kiểm soát chi phí API*

| ID | Quy tắc | Lý do · Stakeholder | Áp dụng |
| :---- | :---- | :---- | :---- |
| **BR-99** ***Mới*** | **Free không tự quét giày** (chốt câu hỏi mở \#1): Free thiết kế trên 3 phôi chuẩn. Lượt quét là quyền lợi trả phí chính vì chi phí biên \~32–49k/lượt. | VS/MT: bảo vệ biên lợi nhuận \~84% của Basic. KH: Free vẫn trải nghiệm đủ luồng thiết kế. | UC-10 MSG25 |
| **BR-33** ***Sửa*** | Không cho gửi Scan Job nếu kiểm tra tại chỗ không đạt: đủ sáng, không nhoè, có vật thể trong khung, đủ góc xoay theo hướng dẫn. | NCC/VS: không trả tiền API cho đầu vào hỏng. | UC-10 MSG31 |
| **BR-34** ***Sửa*** | Mỗi Scan Job: tối đa 30 ảnh hoặc video ≤60 giây, tổng ≤200MB; độ phân giải tối thiểu 720p, khuyến nghị 1080p nếu thiết bị/WebView hỗ trợ; số ảnh tối thiểu theo cấu hình của nhà cung cấp 3D. | Dev (R2): camera qua getUserMedia trong WebView Tauri không bảo đảm 1080p/60fps như bản v2.1 ghi. | UC-10 MSG32 |
| **BR-38** ***Giữ*** | Người dùng xác nhận là chủ sở hữu hoặc được phép quét đôi giày trước khi gửi Scan Job. | CSH, PL. | UC-10 |
| **BR-35** ***Sửa*** | Lượt quét được **giữ chỗ** khi job vào hàng đợi, **trừ chính thức** khi SUCCEEDED, **nhả** khi thất bại do hệ thống (FAILED\_SYSTEM). | KH: chỉ trả cho kết quả. Dev: chống gửi song song để dùng quá lượt. | UC-10 SF-01 |
| **BR-36** ***Sửa*** | Thất bại do đầu vào (FAILED\_INPUT – nhà cung cấp từ chối sau khi đã qua kiểm tra tại chỗ): hoàn lượt tối đa **1 lần/chu kỳ/tài khoản** (v2.1: 2 lần/tháng); từ lần thứ hai trừ lượt bình thường. | VS: Basic chỉ có 1 lượt, mỗi lần gọi API đều tốn tiền. KH: vẫn có một lần thử lại miễn phí. | UC-10 MSG33 |
| **BR-37** ***Giữ*** | Job ở hàng đợi/xử lý quá 30 phút → FAILED\_SYSTEM, nhả lượt. | KH. | SF-02 |
| **BR-39** ***Sửa*** | Ảnh/video không phải giày phát hiện được ở bước kiểm tra tại chỗ → REJECTED\_NOT\_SHOE, không gọi API, không trừ lượt. Nếu chỉ phát hiện sau khi gọi API → không trừ lượt nhưng tính vào giới hạn của BR-36. | VS: chặn lạm dụng gọi API. | UC-10 MSG34 |
| **BR-40** ***Giữ*** | quality\_score \<60 vẫn được tính là thành công, cho thiết kế/xuất file kèm cảnh báo chất lượng thấp. | KH. | UC-10 MSG35 |
| **BR-41** ***Sửa*** | Guest (web “Dùng thử Demo” và chế độ khách trên mobile): dùng phôi demo và công cụ cơ bản; không lưu quá phiên, không quét, không xuất, không tạo link. Đăng ký ngay trong phiên → thiết kế demo được chuyển vào tài khoản mới (tính hạn mức). | GV (O1 UX): người lạ thử được trong \<5 phút. VS: giữ được người dùng vừa thử. | UC-01, UC-12 |
| **BR-42** ***Sửa*** | Sau khi quét thành công: xuất ngay file scan gốc GLB (Basic+, tính 1 lượt xuất) hoặc tạo dự án mới. **Trên Mobile**, nút “Mở trong trình chỉnh sửa 3D” mở trình xem 3D và gửi link/QR để tiếp tục thiết kế trên Web/Desktop – Editor đầy đủ chỉ có trên Web/Desktop. | Dev (R2): điện thoại chỉ chụp/quay \+ upload theo quyết định đã chốt. | UC-10, UC-11 |
| **BR-79** ***Sửa*** | SF-14 ghi chi phí **mọi** lần gọi API 3D/AI (kể cả thất bại) theo user và theo ngày. Ngân sách tháng cấu hình được: đạt 80% → cảnh báo Admin; đạt 100% → tạm ngưng nhận Scan Job mới (giữ nguyên lượt của khách), thiết kế trên phôi vẫn hoạt động. Tài khoản nội bộ có trần riêng **10 lượt quét cho cả kỳ EXE201**. | VS (R3, R6): không cháy tiền; số liệu chi phí/lượt cho mục Scalability (O1). MT: unit economics. | SF-14 MSG43 |

#### *5.1.7 Dự án & Kus Studio*

| ID | Quy tắc | Lý do · Stakeholder | Áp dụng |
| :---- | :---- | :---- | :---- |
| **BR-43** ***Sửa*** | Trạng thái dự án theo vòng đời ở mục 5.5. Sửa sau BAKED → về ĐANG CHỈNH (bản bake cũ hết hiệu lực). Sửa sau ĐÃ XUẤT → về ĐANG CHỈNH; các phiên bản đã xuất giữ nguyên, bất biến. | NN: file đang gia công không bị thay đổi ngầm. KH: hiểu trạng thái. | UC-13, UC-16 |
| **BR-44** ***Sửa*** | Giữ tối đa 20 phiên bản gần nhất/dự án (Pro: 50). Phiên bản đã xuất được ghim, không bị xoá khi vượt giới hạn. | NN, KH. | UC-13 |
| **BR-45** ***Sửa*** | Dự án đang xuất file bị khoá chỉnh sửa tối đa 5 phút; quá thời gian tự mở khoá và báo lỗi xuất. | KH. | UC-17 MSG22 |
| **BR-46** ***Sửa*** | Số dự án tối đa: Free 3 / Basic 20 / Pro 50\. Dự án read-only vẫn tính; dự án trong thùng rác không tính. | KH, VS. | UC-13 MSG21 |
| **BR-47** ***Giữ*** | Dự án xoá nằm trong thùng rác 30 ngày rồi xoá vĩnh viễn; khôi phục được khi còn chỗ trong hạn mức. | KH. | UC-13 MSG44 |
| **BR-100** ***Mới*** | Auto-save mỗi 30 giây và khi rời trang. Một dự án mở cùng lúc trên hai thiết bị → phiên mở sau ở chế độ chỉ xem cho tới khi phiên trước đóng (CR-07). | KH: không mất thao tác, không ghi đè lẫn nhau giữa Web và Desktop. | UC-14 MSG45 |
| **BR-49** ***Giữ*** | Màu/vật liệu trong Editor chỉ minh hoạ, không bảo đảm đúng khi gia công thủ công; cảnh báo này in trong gói tham khảo. | KH, NN. | UC-14, UC-17 |
| **BR-50** ***Sửa*** | Ảnh tải lên: PNG/JPG/SVG, ≤20MB; SVG được làm sạch (loại bỏ script) trước khi lưu. | VS: an toàn. | UC-14 MSG23 |
| **BR-51** ***Giữ*** | Bắt buộc xác nhận bản quyền cho mọi ảnh/logo tải lên; xác nhận được lưu kèm layer. | CSH, PL. | UC-14 |
| **BR-52** ***Giữ*** | Tối đa 5 layer/Zone, 30 layer/dự án (Pro: 60); nét vẽ tay tính là layer (BR-58). | KH, hiệu năng. | UC-14 MSG46 |
| **BR-53** ***Giữ*** | Nội dung chữ bị lọc từ khoá cấm (thù ghét, khiêu dâm, chính trị nhạy cảm) và nhãn hiệu bảo hộ; thực thi theo BR-73. | CSH, PL. | UC-14 MSG24 |
| **BR-54** ***Giữ*** | Chữ ký/text tối đa 20 ký tự/vị trí. | NN: vẽ tay được. | UC-14 |
| **BR-55** ***Gộp*** | Chuyển thành yêu cầu phi chức năng **NFR-PER-03** (cập nhật viewport ≤300ms) – đây là yêu cầu hiệu năng, không phải quy tắc nghiệp vụ. | — | — |
| **BR-56** ***Giữ*** | Thiết kế trái/phải khác nhau xuất thành 2 file riêng, vẫn tính là 1 lượt xuất (BR-72). | NN. | UC-17 |
| **BR-57** ***Sửa*** | Draw Artwork và layer nâng cao (độ mờ, chế độ hoà trộn, mask, nhóm layer) chỉ có từ gói Basic. | VS: lý do nâng cấp rõ ràng. | UC-14 MSG25 |
| **BR-58** ***Giữ*** | Nét vẽ tay (Draw Artwork) được tính là layer, áp chung giới hạn BR-52. | — | UC-14 |

#### *5.1.8 AI tách nền*

| ID | Quy tắc | Lý do · Stakeholder | Áp dụng |
| :---- | :---- | :---- | :---- |
| **BR-59** ***Sửa*** | 1 lượt tách nền **thành công** \= 1 AI Credit. Hạn mức theo bảng 3.2.8 (Free 5 / Basic 100 / Pro 300 mỗi chu kỳ). Pricing ghi đúng con số, bỏ cụm “không giới hạn” (BR-92). | KH: thông tin nhất quán. VS: kiểm soát chi phí AI. | UC-14 SF-03 MSG47 |
| **BR-60** ***Giữ*** | Tách nền lỗi/timeout → giữ ảnh gốc, cho crop thủ công, không trừ credit. | KH. | SF-03 |

#### *5.1.9 Xuất file & chia sẻ cho nghệ nhân*

| ID | Quy tắc | Lý do · Stakeholder | Áp dụng |
| :---- | :---- | :---- | :---- |
| **BR-65** ***Giữ*** | Ảnh/video render của tài khoản Free luôn có watermark. | VS. | UC-16 |
| **BR-66** ***Giữ*** | Cảnh báo sai lệch màu hiển thị so với thực tế tại màn hình preview và trong file xuất. | KH, NN. | UC-16, UC-17 |
| **BR-67** ***Sửa*** | Free chỉ tải **ảnh render PNG có watermark** (cạnh dài ≤1080px); không tải file 3D, không có gói tham khảo. Pricing đổi “xuất có watermark” thành “tải ảnh render có watermark”. | KH/PL: mô tả gói không gây hiểu lầm. | UC-17 MSG25 |
| **BR-68** ***Sửa*** | Định dạng: Basic – GLB, texture tối đa 2K; Pro – GLB \+ OBJ (FBX khi adapter hỗ trợ), texture tối đa 4K. Định dạng chưa hỗ trợ **không** được hiển thị trên Pricing. (Gộp BR-70.) | KH: không hứa điều chưa làm được. NN: biết định dạng nào mở được. | UC-17 |
| **BR-69** ***Sửa*** | File xuất thuộc quyền sử dụng của khách cho mục đích cá nhân và mang đi gia công; không ràng buộc với bên gia công nào. KusShoes **không** chịu trách nhiệm chất lượng gia công. Model quét từ giày có nhãn hiệu không được dùng để sản xuất/bán hàng giả (ToS). | KH, NN, CSH, PL. | UC-11, UC-17 |
| **BR-70** ***Gộp*** | Đã gộp vào BR-68. | — | — |
| **BR-71** ***Sửa*** | Gói tham khảo PDF (Basic+) gồm tối thiểu: ảnh render 4 góc; bản trải phẳng theo Zone; mã màu HEX kèm tên màu gần đúng; nội dung text \+ font; vị trí và kích thước từng layer (mm nếu khách nhập size giày EU/US khi xuất, nếu không thì theo % bề mặt); ghi chú trái/phải; mã phiên bản \+ ngày xuất; QR mở trình xem 3D; cảnh báo sai lệch màu. | NN: đủ thông tin để vẽ/gia công mà không phải hỏi lại khách. KH: trả lời được câu “xuất file rồi làm gì”. | UC-17 SF-07 |
| **BR-72** ***Sửa*** | **1 lượt xuất** \= 1 lần Export thành công sinh ra 1 gói file (bất kể số file trái/phải hay định dạng). Tải lại cùng gói trong 7 ngày không trừ thêm; nghệ nhân tải qua link không trừ lượt của chủ. Mọi lần tạo/tải ghi EXPORT\_LOG (người tải: chủ hoặc link nghệ nhân, thời điểm, định dạng). | KH: biết thế nào là “một lượt”. VS: số lượt xuất trên Dashboard Admin có nghĩa rõ. | UC-17, UC-26 |
| **BR-48** ***Sửa*** | **Link chia sẻ công khai** (để khoe thiết kế): chỉ xem ảnh/trình xem 3D có watermark, không tải file; chỉ tạo được khi “Hiển thị thiết kế” đang bật (BR-15). Khác với link nghệ nhân (BR-101). | KH, VS (R5): lan truyền trên mạng xã hội mà không lộ file. | UC-13 |
| **BR-101** ***Mới*** | **Link cho nghệ nhân** (Basic+): tạo từ **một phiên bản đã xuất**; token ngẫu nhiên không đoán được; hạn 30 ngày (gia hạn được); tối đa 20 lượt tải/link; chủ thu hồi bất cứ lúc nào. Nghệ nhân **không cần tài khoản**: xem 3D, tải gói tham khảo và file 3D của đúng phiên bản đó; mỗi lần tải cấp signed URL ≤15 phút. Link vẫn hoạt động đến hết hạn kể cả khi gói của chủ đã hết (không làm gián đoạn việc gia công); link bị vô hiệu khi dự án bị xoá hoặc tài khoản bị khoá/xoá. | NN: nhận file mà không phải đăng ký. KH: kiểm soát ai có file. GV (O1): demo được bước “artist mở/tải được”. | UC-26 SC-34 MSG48 |
| **BR-102** ***Mới*** | **Danh bạ nghệ nhân tham khảo** (nếu có): thông tin tĩnh do team biên soạn, nghệ nhân phải đồng ý được liệt kê. Trang hiển thị rõ: KusShoes không nhận hoa hồng, không đặt hàng hộ, không bảo đảm chất lượng gia công. | KH: phản hồi “không biết đem file đi đâu”. VS/PL: giữ đúng phạm vi “không tổ chức sản xuất”. | SC-24 |

#### *5.1.10 Template & Creator*

| ID | Quy tắc | Lý do · Stakeholder | Áp dụng |
| :---- | :---- | :---- | :---- |
| **BR-61** ***Sửa*** | Phase 1: chỉ template do KusShoes tạo; Admin duyệt trước khi công khai, mục tiêu ≤48 giờ. | VS: giảm phạm vi. | UC-15, UC-24 |
| **BR-62** ***Giữ*** | Template chỉ được công khai khi nội dung phù hợp, không vi phạm bản quyền. | CSH. | UC-24 |
| **BR-63** ***Giữ*** | Template áp lên phôi khác dáng tự co giãn theo Zone; sai lệch \>15% → cảnh báo. | KH. | UC-15 MSG49 |
| **BR-64** ***Hoãn*** | Creator đóng góp template và chia sẻ doanh thu 30% (đối soát tháng, ngưỡng rút 500.000đ) → **Phase 2**; cần hợp đồng và luồng chi trả chưa có trong kỳ EXE201. | VS, PL. | — |
| **BR-76** ***Hoãn*** | Gỡ template vi phạm khi có khiếu nại hợp lệ; Creator tái phạm 3 lần bị thu hồi quyền đăng → áp dụng khi mở Creator (Phase 2). | CSH. | — |

#### *5.1.11 Quản trị, kiểm duyệt & nhật ký*

| ID | Quy tắc | Lý do · Stakeholder | Áp dụng |
| :---- | :---- | :---- | :---- |
| **BR-73** ***Sửa*** | Guardrail (SF-04) chạy khi chèn chữ/ảnh/sticker: từ khoá cấm → **chặn cứng**; nghi nhãn hiệu bảo hộ → cảnh báo, yêu cầu xác nhận bản quyền (BR-51) mới cho áp. | CSH, PL, KH. | UC-14, UC-23 MSG24 |
| **BR-74** ***Giữ*** | Thay đổi bảng giá/hạn mức/guardrail ghi AUDIT\_LOG và khôi phục được phiên bản trước. | VS. | UC-23 |
| **BR-75** ***Sửa*** | Thay đổi giá không hồi tố cho chu kỳ đã thanh toán; khách đang dùng được báo trước 7 ngày nếu giá gia hạn thay đổi. | KH, PL. | UC-23 |
| **BR-77** ***Giữ*** | Xử lý vi phạm nội dung 3 mức: cảnh cáo → hạn chế chia sẻ công khai 30 ngày → khoá tài khoản. | PL. | UC-24 |
| **BR-78** ***Giữ*** | Admin không xem thiết kế riêng tư của người dùng trừ khi có khiếu nại/báo cáo; mọi truy cập ghi AUDIT\_LOG. | KH, PL. | UC-20 |
| **BR-80** ***Sửa*** | Mạo danh đăng nhập: chỉ Admin đã bật 2FA; bắt buộc nhập lý do/mã ticket; tối đa 30 phút; trong phiên **không** được thanh toán, đổi mật khẩu/email, xoá tài khoản, xem cài đặt 2FA; banner cảnh báo suốt phiên; khách nhận email thông báo sau phiên. | KH: biết khi có người truy cập hộ. VS: giới hạn rủi ro lạm quyền. | UC-20 MSG41 |
| **BR-81** ***Giữ*** | Khoá tài khoản chặn đăng nhập ngay và vô hiệu link nghệ nhân; xoá tài khoản theo BR-06. | VS. | UC-20 |
| **BR-103** ***Mới*** | Admin đổi gói hộ chỉ dùng cho bồi hoàn sự cố/hỗ trợ; bắt buộc lý do; gắn nhãn **COMP**, không tạo doanh thu, không tính khách trả tiền. | GV/MT: không thổi phồng KPI. VS (R6): tách doanh thu thật và quà tặng. | UC-20 |
| **BR-82** ***Giữ*** | Báo cáo Admin xuất PDF/CSV/XLSX theo yêu cầu hoặc lịch tuần/tháng/quý, gửi email người nhận. | VS. | UC-22 SF-16 MSG42 |

#### *5.1.12 Đo lường kinh doanh & minh chứng EXE201*

| ID | Quy tắc | Lý do · Stakeholder | Áp dụng |
| :---- | :---- | :---- | :---- |
| **BR-104** ***Mới*** | Định nghĩa **“Khách hàng trả tiền”** tại mục 5.4 là định nghĩa **duy nhất** dùng cho KPI 20 khách, Dashboard Admin, báo cáo Outcome 2 và Outcome 3\. | GV: hội đồng hỏi chéo một con số, cả team trả lời giống nhau. | UC-19, UC-21, UC-22 |
| **BR-105** ***Mới*** | **Tỷ lệ khách quay lại** \= số khách trả tiền có ≥2 giao dịch trả tiền ở hai thời điểm khác nhau (gia hạn, nâng cấp hoặc mua Credit) ÷ tổng khách trả tiền trong khung báo cáo. Báo cáo tách riêng nhóm “chưa đến kỳ gia hạn” để không kéo tỷ lệ xuống sai. | GV: O3 đòi tỷ lệ khách quay lại dạng %. VS: lịch nén chỉ còn 5–6 tuần bán. | UC-21, UC-22 |
| **BR-106** ***Mới*** | Báo cáo **“Sổ giao dịch EXE201”** xuất XLSX/CSV đúng thứ tự cột của sổ 07: Mã · Ngày đặt · Tên khách (rút gọn) · Kênh đến · Loại hàng hoá · Giá tiền · Tình trạng thanh toán · Hình thức thanh toán · Tên file biên nhận · Khách quay lại? File biên nhận đặt tên KUS-{mã}-{tenkhongdau}-{ddmmyy}.pdf. | VS (R4): dán thẳng vào sổ 07\. GV: bảng 6 cột bắt buộc của O3. | UC-22 SF-16 |
| **BR-107** ***Mới*** | Báo cáo **phễu theo kênh và theo tuần**: đăng ký → xác thực email → lưu thiết kế đầu tiên → thanh toán; loại tài khoản nội bộ (BR-83). | GV: O2 conversion tách đường A/B. VS (R5, R6). | UC-21, UC-22 |
| **BR-108** ***Mới*** | Báo cáo **chi phí API theo ngày** (SF-14) xuất CSV cho R6 nhập sổ 08\. Chi phí marketing **không** nhập vào hệ thống — sổ 08 là nguồn sự thật để tính CAC. | GV: O3 đòi chi phí theo từng ngày. VS: tránh hai nguồn số liệu. | UC-22 |
| **BR-109** ***Mới*** | **Phản hồi trong app:** form hiện sau lần xuất file đầu tiên hoặc sau phiên làm việc thứ 3, tối đa 1 lần/14 ngày/tài khoản. Trường: mức hài lòng 1–5, nội dung, nhóm khách (tự chọn), đồng ý được liên hệ. Xuất đúng cột sổ 10; mỗi phản hồi có trạng thái xử lý và ô “Đã đổi gì trong sản phẩm”. | GV: O2 cần ≥20 phản hồi từ khách mục tiêu; O3 chấm lộ trình điều chỉnh theo feedback. | UC-25 SC-36 MSG50 |
| **BR-110** ***Mới*** | Ghi **time-to-first-design** \= thời gian từ lúc bắt đầu phiên (hoặc đăng ký) đến lần lưu thiết kế đầu tiên có ≥1 layer; dùng để đo NFR-USA-01 (≤5 phút). | GV: O1 chấm UX. VS (R1): bằng chứng số cho test 3 người ngoài team. | UC-14 |
| **BR-98** ***Mới*** | **Khoá sổ kỳ báo cáo:** Admin khoá một khoảng thời gian (vd. trước buổi Outcome 2/3). Sau khoá, giao dịch trong kỳ không sửa được; mọi điều chỉnh là bút toán ở kỳ đang mở, kèm lý do; báo cáo của kỳ đã khoá luôn ra cùng một kết quả. | GV: số trong report khớp sổ. VS (R6): task O3-19 “đóng sổ”. | UC-29 SC-35 |

### **5.2 Common Requirements**

| ID | Yêu cầu chung |
| :---- | :---- |
| CR-01 | Toàn hệ thống dùng múi giờ GMT+7. |
| CR-02 | Đơn vị tiền tệ VND, phân tách hàng nghìn, không phần thập phân. |
| CR-03 | Danh sách mặc định phân trang 20 (Admin \- Người dùng: 10/trang), sắp xếp mới nhất trước.&nbsp; |
| CR-04 | Mọi thao tác xoá là soft-delete, trừ job dọn dữ liệu theo chính sách lưu trữ. |
| CR-05 | Ảnh/video gốc Scan Job lưu tối đa 30 ngày; model 3D lưu theo hạn mức gói. |
| CR-06 | Tài khoản Free không hoạt động 12 tháng: cảnh báo trước 30 ngày rồi lưu trữ lạnh/xoá. |
| CR-07 | Một thiết kế có một nguồn sự thật duy nhất trên server. |
| CR-08 | Giao dịch tài chính ghi nhận bất biến, điều chỉnh bằng bút toán đối ứng. |
| CR-09 | Mọi lượt gọi dịch vụ AI/3D bên thứ ba ghi nhận chi phí gắn với user. |
| CR-10 | Người dùng giữ quyền sở hữu thiết kế; KusShoes chỉ có quyền sử dụng phi độc quyền để lưu trữ/xử lý. |
| CR-11 | Tài khoản nội bộ bị loại khỏi mọi chỉ số kinh doanh (BR-83). |
| CR-12 | Mọi chỉ số hiển thị/xuất báo cáo dùng định nghĩa mục 5.4; báo cáo ghi rõ khoảng thời gian và thời điểm trích xuất. |
| CR-13 | Tên khách trong mọi tài liệu xuất ra ngoài hệ thống được rút gọn/che theo BR-88. |
| CR-14 | Số tiền lưu dạng số nguyên VND; chỉ phí pro-rata được làm tròn lên hàng nghìn (BR-24). |

### **5.3 Application Messages List**&nbsp;

| \# | Message code | Type | Context | Content |
| :---- | :---- | :---- | :---- | :---- |
| 1 | MSG01 | Inline | Đăng ký – email trùng | *Email này đã được dùng. Vui lòng đăng nhập hoặc đặt lại mật khẩu.* |
| 2 | MSG02 | Inline | Đăng ký – chưa xác nhận tuổi | *Bạn cần đủ 16 tuổi để sử dụng KusShoes.* |
| 3 | MSG03 | Toast | Quên mật khẩu | *Nếu email tồn tại, chúng tôi đã gửi hướng dẫn đặt lại mật khẩu. Link có hiệu lực 15 phút.* |
| 4 | MSG04 | Inline | Ảnh đại diện không hợp lệ | *Chỉ hỗ trợ JPG/PNG, dung lượng tối đa 5MB.* |
| 5 | MSG05 | Toast | Đổi email | *Đã gửi email xác thực tới {email mới}. Email mới chỉ có hiệu lực sau khi bạn xác thực.* |
| 6 | MSG06 | Inline | Username không hợp lệ/trùng | *Tên người dùng đã tồn tại hoặc không hợp lệ. Gợi ý: {gợi ý}.* |
| 7 | MSG07 | Inline | Bật 2FA khi chưa có email khôi phục | *Vui lòng thêm và xác thực email khôi phục trước khi bật xác thực 2 bước.* |
| 8 | MSG08 | Dialog | Nhập dữ liệu lỗi | *Tệp sao lưu không hợp lệ hoặc vượt hạn mức dự án của gói hiện tại.* |
| 9 | MSG09 | Dialog | Điều khoản thay đổi | *Điều khoản/Chính sách đã cập nhật (phiên bản {x}). Vui lòng đọc và đồng ý để tiếp tục.* |
| 10 | MSG10 | Toast | Lỗi hệ thống chung | *Đã có lỗi xảy ra. Vui lòng thử lại sau ít phút. Mã lỗi: {mã}.* |
| 11 | MSG11 | Inline | Mật khẩu yếu | *Mật khẩu cần ≥8 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt.* |
| 12 | MSG12 | Dialog | Khoá đăng nhập tạm thời | *Bạn đã nhập sai quá 5 lần. Vui lòng thử lại sau 15 phút.* |
| 13 | MSG13 | Banner | Email chưa xác thực | *Xác thực email để thanh toán, quét giày và xuất file. \[Gửi lại email\]* |
| 14 | MSG14 | Toast | Gửi lại email xác thực | *Đã gửi lại email xác thực. Link có hiệu lực 24 giờ.* |
| 15 | MSG15 | Dialog | Xoá tài khoản khi còn gói | *Gói {gói} còn hiệu lực đến {ngày}. Xoá tài khoản sẽ mất quyền lợi còn lại và không được hoàn tiền.* |
| 16 | MSG16 | Dialog | Hạ về Free vượt hạn mức | *Gói Free cho phép {n} dự án. Chọn dự án muốn tiếp tục chỉnh sửa; các dự án còn lại chuyển sang chỉ xem.* |
| 17 | MSG17 | Dialog | Giao dịch quá hạn | *Giao dịch {mã} đã hết hạn sau 30 phút. Nếu bạn đã chuyển tiền, hệ thống vẫn tự ghi nhận khi cổng xác nhận.* |
| 18 | MSG18 | Dialog | Xác nhận nâng cấp pro-rata | *Nâng cấp lên Pro cho {n} ngày còn lại của chu kỳ: {số tiền}. Hạn mức mới có hiệu lực ngay.* |
| 19 | MSG19 | Toast | Thanh toán thành công | *Thanh toán thành công. Biên nhận {mã} đã được gửi tới email của bạn.* |
| 20 | MSG20 | Dialog | Thanh toán thất bại | *Thanh toán chưa thành công ({lý do từ cổng}). Bạn chưa bị trừ tiền cho giao dịch này.* |
| 21 | MSG21 | Dialog | Hết hạn mức dự án | *Bạn đã dùng {x}/{y} dự án. Xoá bớt hoặc nâng cấp gói để tạo dự án mới.* |
| 22 | MSG22 | Toast | Dự án đang xuất file | *Dự án đang được xuất file, tạm khoá chỉnh sửa. Vui lòng đợi trong giây lát.* |
| 23 | MSG23 | Inline | Ảnh tải lên không hợp lệ | *Chỉ hỗ trợ PNG/JPG/SVG, dung lượng tối đa 20MB.* |
| 24 | MSG24 | Inline | Nội dung bị chặn | *Nội dung này vi phạm quy định nội dung hoặc có thể thuộc nhãn hiệu được bảo hộ.* |
| 25 | MSG25 | Dialog | Tính năng cần nâng cấp | *Tính năng {tên} có từ gói {gói}. \[Xem các gói\]* |
| 26 | MSG26 | Banner | Nhắc gia hạn / ân hạn | *Gói {gói} hết hạn ngày {ngày}. Gia hạn để tiếp tục quét và xuất file. \[Gia hạn\]* |
| 27 | MSG27 | Inline | Mã khuyến mãi không hợp lệ | *Mã không hợp lệ, đã hết hạn, đã dùng hoặc không áp dụng cho gói này.* |
| 28 | MSG28 | Dialog | Hết lượt quét | *Bạn đã dùng hết lượt quét của chu kỳ. Mua Credit (49.000đ/lượt) hoặc chờ đến {ngày reset}.* |
| 29 | MSG29 | Screen | Đang xác nhận thanh toán | *Chúng tôi đang chờ cổng thanh toán xác nhận. Trang sẽ tự cập nhật, bạn không cần thanh toán lại.* |
| 30 | MSG30 | Dialog | Kết quả yêu cầu hoàn tiền | *Yêu cầu hoàn tiền cho {mã} {được chấp nhận/bị từ chối}: {lý do}.* |
| 31 | MSG31 | Inline | Không đạt kiểm tra tại chỗ | *Ảnh/video chưa đạt: {tiêu chí}. Hãy chụp lại theo hướng dẫn trước khi gửi.* |
| 32 | MSG32 | Inline | Đầu vào quét vượt giới hạn | *Tối đa 30 ảnh hoặc video 60 giây, tổng 200MB.* |
| 33 | MSG33 | Dialog | Quét thất bại do đầu vào | *Không dựng được model từ ảnh/video này. {Đã hoàn lượt (còn 0 lần hoàn trong chu kỳ) / Lượt quét đã bị trừ}.* |
| 34 | MSG34 | Inline | Không phải giày | *Không nhận diện được giày trong ảnh/video. Lượt quét của bạn không bị trừ.* |
| 35 | MSG35 | Banner | Model chất lượng thấp | *Model có chất lượng thấp ({điểm}/100). Bạn vẫn có thể thiết kế và xuất file, nhưng chi tiết có thể không chính xác.* |
| 36 | MSG36 | Toast | Đổi mật khẩu thành công | *Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất.* |
| 37 | MSG37 | Dialog | Bật 2FA | *Nhập mã xác minh từ {phương thức} để hoàn tất bật 2FA.* |
| 38 | MSG38 | Toast | Đăng xuất thiết bị | *Đã đăng xuất thiết bị {tên thiết bị}.* |
| 39 | MSG39 | Dialog | Xác nhận xoá tài khoản | *Hành động này không thể hoàn tác. Nhập mật khẩu để xác nhận xoá vĩnh viễn tài khoản.* |
| 40 | MSG40 | Toast | Dữ liệu sẵn sàng tải | *Gói dữ liệu của bạn đã sẵn sàng. Kiểm tra email để tải xuống.* |
| 41 | MSG41 | Banner (Admin) | Đang trong phiên mạo danh | *Bạn đang đăng nhập thay {tên người dùng}. Mọi thao tác được ghi lại.* |
| 42 | MSG42 | Toast (Admin) | Báo cáo sẵn sàng | *Báo cáo “{tên báo cáo}” đã sẵn sàng để tải về.* |
| 43 | MSG43 | Dialog | Tạm ngưng nhận quét | *Hệ thống tạm ngưng nhận yêu cầu quét mới. Lượt quét của bạn được giữ nguyên; bạn vẫn có thể thiết kế trên phôi chuẩn.* |
| 44 | MSG44 | Dialog | Khôi phục dự án không đủ chỗ | *Không thể khôi phục vì đã đạt giới hạn {y} dự án. Xoá bớt hoặc nâng cấp gói.* |
| 45 | MSG45 | Banner | Dự án đang mở ở thiết bị khác | *Dự án đang được chỉnh sửa trên {thiết bị}. Bạn đang ở chế độ chỉ xem.* |
| 46 | MSG46 | Inline | Vượt giới hạn layer | *Đã đạt giới hạn {n} layer cho {Zone/dự án}.* |
| 47 | MSG47 | Dialog | Hết AI Credit | *Bạn đã dùng hết {y} lượt tách nền của chu kỳ. Lượt mới có từ {ngày reset}.* |
| 48 | MSG48 | Screen | Link nghệ nhân không còn hiệu lực | *Link này đã hết hạn, hết lượt tải hoặc đã bị thu hồi. Vui lòng liên hệ người gửi.* |
| 49 | MSG49 | Banner | Template sai lệch dáng | *Template bị co giãn hơn 15% so với bản gốc trên phôi này. Hãy kiểm tra lại trước khi xuất.* |
| 50 | MSG50 | Toast | Gửi phản hồi thành công | *Cảm ơn bạn\! Phản hồi đã được ghi nhận.* |
| 51 | MSG51 | Inline | Vượt giới hạn Credit | *Mỗi chu kỳ mua tối đa 3 Credit quét.* |

### **5.4 Định nghĩa dữ liệu nghiệp vụ & chỉ số**

Mỗi thuật ngữ dưới đây có **một** định nghĩa vận hành dùng chung cho hệ thống, Dashboard Admin, sheet phân task (sổ 07–10) và báo cáo EXE201 (CR-12).

| Thuật ngữ | Định nghĩa vận hành | Nguồn / quy tắc |
| :---- | :---- | :---- |
| **Khách hàng trả tiền** | USER không phải tài khoản nội bộ, có ≥1 TRANSACTION trạng thái SUCCESS hoặc MANUAL\_CONFIRMED với số thực trả \>0 và chưa được hoàn tiền toàn phần; không tính gói COMP. **Đếm theo người**, không theo giao dịch. | USER, TRANSACTION, REFUND · BR-83, BR-97, BR-103, BR-104 |
| **Đơn hàng** | Một TRANSACTION trả tiền (gói, nâng cấp hoặc Credit), mã KUS-xxx, có đúng một biên nhận. | TRANSACTION, RECEIPT |
| **Doanh thu ghi nhận** | Tổng **số thực trả** của giao dịch SUCCESS/MANUAL\_CONFIRMED trừ các bút toán REFUND, theo ngày thanh toán. Không dùng giá niêm yết. | TRANSACTION, REFUND · BR-26 |
| **Loại hàng hoá** | Basic tháng · Pro tháng · Nâng cấp Basic→Pro (pro-rata) · Credit quét. | TRANSACTION.item\_type |
| **Tình trạng thanh toán** | PENDING · SUCCESS · FAILED · CANCELLED · MANUAL\_CONFIRMED · REFUNDED (toàn phần/một phần). | Mục 5.5 |
| **Hình thức thanh toán** | Chuyển khoản VietQR · MoMo · VNPay · Tiền mặt (thủ công) · Chuyển khoản trực tiếp (thủ công). | TRANSACTION.method · BR-95, BR-96 |
| **Kênh đến** | Một giá trị cho mỗi khách, lấy theo first-touch và chốt ở giao dịch trả tiền đầu tiên: Trực tiếp · TikTok · Facebook · Email · Giới thiệu · Khác. | USER.acquisition\_channel · BR-84 |
| **Đường A / Đường B** | A \= kênh đến “Trực tiếp” (kể cả người thân, bạn bè, lớp, CLB). B \= TikTok, Facebook, Email. “Giới thiệu” và “Khác” báo cáo riêng. | BR-107 |
| **Conversion rate (theo kênh)** | Số khách trả tiền mới có kênh X trong kỳ ÷ số đăng ký mới đã xác thực email có kênh X trong cùng kỳ. | BR-107 |
| **CAC** | Tổng chi phí marketing trong kỳ (sổ 08, cột “Tính vào CAC? \= Có”) ÷ số khách trả tiền mới trong kỳ. Chi phí API quét **không** tính vào CAC. | Sổ 08 \+ BR-104 |
| **Khách quay lại / tỷ lệ** | Khách trả tiền có ≥2 giao dịch trả tiền ở hai thời điểm khác nhau; tỷ lệ theo BR-105, tách nhóm chưa đến kỳ gia hạn. | BR-105 |
| **Churn (kỳ EXE201)** | Số khách có gói hết hạn trong kỳ và không gia hạn trước khi hết ân hạn ÷ số khách có gói đến hạn trong kỳ. Khách chưa đến hạn không nằm trong mẫu số. | SUBSCRIPTION · BR-90 |
| **MRR (giai đoạn EXE201)** | Tổng giá thực trả quy về tháng của các gói ACTIVE/GRACE tại thời điểm xem; không gồm Credit và COMP. | SUBSCRIPTION |
| **Chu kỳ gói** | Từ ngày thanh toán đến cùng ngày của tháng sau (tháng sau không có ngày đó → ngày cuối tháng), kết thúc 23:59 GMT+7. | BR-23, BR-25 |
| **Lượt quét** | Quyền gửi 1 Scan Job. Nguồn: gói (mất khi hết chu kỳ) hoặc Credit (hạn 12 tháng). Giữ chỗ khi vào hàng đợi, trừ khi SUCCEEDED. | SCAN\_CREDIT\_LEDGER · BR-35 |
| **Lượt xuất** | 1 lần Export thành công sinh 1 gói file, bất kể số file hay định dạng. | EXPORT\_LOG · BR-72 |
| **AI Credit** | 1 lượt tách nền thành công. | QUOTA\_USAGE · BR-59 |
| **Dự án đã lưu** | DESIGN\_PROJECT không nằm trong thùng rác (kể cả read-only). | BR-46 |
| **Phiên bản đã xuất** | DESIGN\_VERSION đã qua Export; bất biến; là đối tượng duy nhất của link nghệ nhân. | BR-43, BR-101 |
| **Người dùng hoạt động** | Đăng nhập và có ≥1 thao tác lưu thiết kế, quét hoặc xuất trong 30 ngày gần nhất. | SC-28, SC-29 |
| **Đang ân hạn / Đã rời** | Đang ân hạn \= gói ở trạng thái GRACE. Đã rời \= từng trả tiền, hiện ở Free sau ân hạn. (Thay nhãn “Đang dùng thử” vì hệ thống không có gói dùng thử.) | SC-29 |
| **Time-to-first-design** | Thời gian từ bắt đầu phiên/đăng ký đến lần lưu thiết kế đầu tiên có ≥1 layer. | BR-110, NFR-USA-01 |
| **Tài khoản nội bộ** | Tài khoản thành viên, demo, test được gắn cờ; bị loại khỏi mọi chỉ số kinh doanh. | BR-83, CR-11 |

### **5.5 Vòng đời trạng thái**

| Đối tượng | Trạng thái | Chuyển trạng thái chính | BR |
| :---- | :---- | :---- | :---- |
| **TRANSACTION** | PENDING, SUCCESS, FAILED, CANCELLED, MANUAL\_CONFIRMED, REFUNDED | PENDING → SUCCESS (webhook hợp lệ) · → FAILED (cổng báo lỗi) · → CANCELLED (quá 30 phút) CANCELLED → SUCCESS (webhook đến trễ) (tạo thủ công) → MANUAL\_CONFIRMED (người thứ hai duyệt) SUCCESS / MANUAL\_CONFIRMED → REFUNDED (bút toán hoàn) | BR-29, BR-30, BR-95, BR-97 |
| **SUBSCRIPTION** | FREE, ACTIVE, GRACE, EXPIRED | FREE → ACTIVE (thanh toán thành công) ACTIVE → GRACE (qua 23:59 ngày hết hạn) GRACE → ACTIVE (gia hạn) · → EXPIRED → FREE (hết 3 ngày ân hạn) ACTIVE → FREE (hoàn tiền toàn phần) | BR-25, BR-90, BR-97 |
| **SCAN\_JOB** | CAPTURING, PRECHECK\_FAILED, REJECTED\_NOT\_SHOE, QUEUED, PROCESSING, SUCCEEDED, FAILED\_INPUT, FAILED\_SYSTEM | CAPTURING → PRECHECK\_FAILED · → REJECTED\_NOT\_SHOE · → QUEUED (giữ chỗ lượt) QUEUED → PROCESSING → SUCCEEDED (trừ lượt) · → FAILED\_INPUT (BR-36) · → FAILED\_SYSTEM (nhả lượt; gồm quá 30 phút) | BR-33 → BR-40 |
| **DESIGN\_PROJECT** | DRAFT, EDITING, BAKED, EXPORTED, READ\_ONLY, TRASHED, PURGED | DRAFT → EDITING (thao tác đầu tiên) → BAKED (Bake Preview) → EXPORTED (Export thành công) BAKED / EXPORTED → EDITING (sửa tiếp) Bất kỳ → READ\_ONLY (hạ gói vượt hạn mức) → trạng thái trước (nâng cấp) Bất kỳ → TRASHED → PURGED (sau 30 ngày) hoặc khôi phục | BR-43, BR-27, BR-47 |
| **ARTISAN\_LINK** | ACTIVE, EXPIRED, EXHAUSTED, REVOKED | ACTIVE → EXPIRED (hết 30 ngày) · → EXHAUSTED (đủ 20 lượt tải) · → REVOKED (chủ thu hồi, dự án bị xoá, tài khoản bị khoá) EXPIRED → ACTIVE (chủ gia hạn) | BR-101 |
| **FEEDBACK** | NEW, REVIEWED, PLANNED, DONE, WONT\_DO | NEW → REVIEWED → PLANNED → DONE (ghi “đã đổi gì trong sản phẩm”) · → WONT\_DO (ghi lý do) | BR-109 |
| **REPORTING\_PERIOD** | OPEN, LOCKED | OPEN → LOCKED (Admin khoá sổ). Không mở lại; điều chỉnh bằng bút toán ở kỳ đang mở. | BR-98 |

### **5.6 Truy vết yêu cầu môn EXE201**

Liên kết từng hạng mục rubric/guidelines (theo sheet phân task, lịch nén O1 tuần 3 · O2 tuần 5 · O3 tuần 7\) với phần hệ thống cung cấp và phần team tự làm ngoài hệ thống.

| Yêu cầu môn | Hệ thống cung cấp | UC / SC / BR | Ngoài hệ thống |
| :---- | :---- | :---- | :---- |
| **O1 · Live demo – main functions** | Luồng: đăng ký → thiết kế trên mesh quét sẵn → lưu → xuất → nghệ nhân mở/tải qua link → thanh toán gói qua cổng. | UC-01, UC-14, UC-17, UC-26, UC-09 · BR-101 | Không demo quét real-time; dùng mesh quét sẵn (task O1-04). |
| **O1 · Market-readiness** | Pricing công khai đúng số; cổng thanh toán hoạt động; trang Điều khoản, Chính sách bảo mật, Chính sách hoàn tiền. | SC-02, SC-33 · BR-92, BR-93, BR-97, BR-89 | Giao dịch thử (O1-08) dùng tài khoản nội bộ nên không tính KPI (BR-83). |
| **O1 · Scalability** | Chi phí thật mỗi lượt quét, hàng đợi, trần ngân sách API. | SF-01, SF-14 · BR-79, BR-108 | Sơ đồ kiến trúc (task O1-05). |
| **O1 · UI / UX** | Đo time-to-first-design. | BR-110 · NFR-USA-01 | Test 3 người ngoài team (task O1-07). |
| **O2 · KPIs (30đ)** | Conversion theo kênh, doanh thu thực thu, churn. | BR-84, BR-104, BR-107 · mục 5.4 | CAC \= sổ 08 ÷ khách trả tiền mới. |
| **O2 · Target – PMF revision (10đ)** | Form phản hồi trong app, trạng thái xử lý, “đã đổi gì”. | UC-25 · BR-109 | Phản hồi phải từ khách mục tiêu, không phải người thân; xong trong tuần 4\. |
| **O2 · Messaging (40đ)** | UTM riêng cho từng công cụ (TikTok, Facebook, Email) để đo hiệu quả. | BR-84 | Lịch đăng, nội dung, reach: sổ 09\. |
| **O2 · Báo cáo kinh doanh \+ bảng giao dịch \+ ảnh** | Biên nhận PDF và báo cáo Sổ giao dịch. | BR-31, BR-106, BR-88 | Ảnh chụp giao dịch phải che thông tin cá nhân. |
| **O3 · Transaction receipts (thiếu \= fail môn)** | Biên nhận cho mọi giao dịch; giao dịch thủ công bắt buộc chứng từ. | BR-31, BR-95, BR-106 | Thư mục biên lai tồn tại từ đơn đầu tiên (tuần 3). |
| **O3 · Bảng chi tiết từng đơn (6 cột)** | Báo cáo “Sổ giao dịch EXE201”. | BR-106 | — |
| **O3 · Doanh thu, lợi nhuận, tỷ lệ khách quay lại** | Doanh thu thực thu, tỷ lệ khách quay lại dạng %. | BR-105 · mục 5.4 | Lợi nhuận \= doanh thu − tổng chi phí sổ 08\. |
| **O3 · Chi phí chi tiết theo ngày** | Chi phí API theo ngày. | BR-108 | Chi phí marketing và chi phí khác nhập sổ 08\. |
| **O3 · Báo cáo truyền thông & kênh bán** | Phễu theo kênh và theo tuần. | BR-107 | Reach, follow, tương tác lấy từ dashboard nền tảng (sổ 09). |
| **O3 · Lộ trình điều chỉnh sản phẩm theo feedback** | Lịch sử xử lý phản hồi. | BR-109 | — |
| **O3 · Achievements – app thật** | APK Android có chính sách quyền camera và URL chính sách bảo mật. | NFR-LEG-06 | Task O3-18. |
| **O3 · Số trong report khớp sổ** | Khoá sổ kỳ báo cáo. | BR-98 | Task O3-19. |

## **6\. Các điểm cần team xác nhận thêm**

Bảng ghi cách v2.2 xử lý 6 câu hỏi của v2.1 và các điểm mới phát sinh khi đối chiếu với sheet phân task. Cột “Đề xuất” là phương án Claude đưa ra — team cần xác nhận trước khi đưa vào Pricing hoặc báo cáo.

| \# | Vấn đề | Đề xuất trong v2.2 | Người chốt |
| :---- | :---- | :---- | :---- |
| **1** | Gói Free có được tự quét không? | **Không** (BR-99). Free dùng 3 phôi chuẩn. Chi phí biên \~32–49k/lượt và lượt quét là lý do chính để trả 259k. | Team (R1, R3) |
| **2** | AI Credits vs “AI tách nền không giới hạn” | Dùng đồng hồ đếm: Free 5 \[ĐX\] / Basic 100 / Pro 300 \[ĐX\]; sửa chữ trên Pricing (BR-59, BR-92). | R1 |
| **3** | Tab “Khám phá” (mobile) | Ngoài phạm vi kỳ EXE201. Đặt lịch dịch vụ và theo dõi đơn hàng mâu thuẫn quyết định “không tổ chức sản xuất” → không đưa vào bản APK. Các ý tưởng trình bày ở Kế hoạch tương lai (task O3-15). | Team |
| **4** | Template Gallery & Creator | Phase 1 chỉ template do KusShoes tạo; Creator và chia sẻ 30% chuyển Phase 2 (BR-61, BR-64). | Team |
| **5** | Hạn mức chính xác Free/Pro | Xem bảng 3.2.8; các số \[ĐX\] cần chốt: Pro 3 lượt quét, 300 AI Credit, 300 lượt xuất; Free 5 AI Credit. | R1, R6 |
| **6** | Gói Team | Phase 2, ẩn khỏi Pricing (BR-32). | Team |
| **7 (mới)** | Trần 10 scan cả kỳ vs 1 scan/khách Basic | 20 khách Basic \= 20 lượt quét, vượt trần 10\. Sheet 02 đã tính 40.000đ chi phí quét cho mỗi khách, nên v2.2 hiểu trần 10 chỉ áp cho tài khoản nội bộ (BR-79). Cần xác nhận. | R3, R6 |
| **8 (mới)** | Biên lợi nhuận Credit 49.000đ | Chi phí 32–49k/lượt → lãi 0–17k, có thể lỗ khi có lỗi đầu vào. Cân nhắc giá 59.000đ, hoặc giữ 49k với trần 3 Credit/chu kỳ (BR-94). | R6 |
| **9 (mới)** | VAT & hoá đơn | Team đã có pháp nhân chưa? Nếu chưa: phát hành biên nhận thanh toán, không tách VAT (BR-28, BR-31, NFR-LEG-04). | R6 \+ GV |
| **10 (mới)** | Chính sách hoàn tiền | Chốt BR-97 và công bố trên trang pháp lý (SC-33) trước buổi Outcome 1\. | R1, R6 |
| **11 (mới)** | Cổng thanh toán thực tế | v2.1 ghi Thẻ/MoMo/VNPay/Chuyển khoản; BMC ghi MoMo/VNPay/PayOS. Cần liệt kê đúng cổng đã tích hợp; v2.2 bỏ form nhập thẻ (BR-96). | R1 |
| **12 (mới)** | Early Bird 129.000đ | Chưa duyệt. BR-91 chỉ bật khi cuối tuần 5 dưới ngưỡng 12 khách và team đồng ý. | Team |
| **13 (mới)** | Đăng nhập Apple trên mobile | Chỉ cần khi có bản iOS; bản APK Android (APKPure) có thể bỏ khỏi SC-21. | R2 |

## **7\. Bảng giải thích thuật ngữ**

### **Kinh doanh / Doanh thu (SaaS metrics)**

| Thuật ngữ | Giải thích |
| ----- | ----- |
| MRR (Monthly Recurring Revenue) | Doanh thu định kỳ hàng tháng — tổng doanh thu subscription quy đổi về theo tháng. |
| ARR (Annual Recurring Revenue) | Doanh thu định kỳ hàng năm ≈ MRR × 12; dùng để nhìn quy mô dài hạn. |
| ARPU (Average Revenue Per User) | Doanh thu trung bình trên mỗi người dùng trả phí. |
| Churn (rate) | Tỉ lệ khách hàng/doanh thu rời bỏ (huỷ gói) trong một kỳ. |
| NRR (Net Revenue Retention) | % doanh thu giữ lại từ nhóm khách hàng cũ sau 1 kỳ, đã tính cả nâng cấp/hạ cấp/rời bỏ (có thể \>100% nếu upsell tốt hơn churn). |
| GRR (Gross Revenue Retention) | Giống NRR nhưng không cộng phần mở rộng (upsell), chỉ trừ churn/downgrade — trần tối đa 100%. |
| LTV (Lifetime Value) | Tổng doanh thu kỳ vọng thu được từ một khách hàng trong suốt vòng đời sử dụng. |
| Dunning | Quy trình tự động nhắc/thử lại thu tiền khi thanh toán định kỳ thất bại (thẻ hết hạn, không đủ số dư...). |
| Net New MRR | MRR mới trong kỳ \= MRR mới (new) \+ mở rộng (expansion) \+ kích hoạt lại (reactivation) − thu hẹp (contraction) − rời bỏ (churn). |
| Pro-rata | Tính phí/hoàn tiền theo tỉ lệ số ngày còn lại khi đổi gói giữa chu kỳ. |
| KPI | Chỉ số đo lường hiệu quả then chốt (vd. tổng người dùng, MRR, lượt xuất file). |
| VAT | Thuế giá trị gia tăng (ở đây 8%, hiển thị riêng ở bước checkout). |
| **CAC (Customer Acquisition Cost)** | Chi phí marketing để có một khách trả tiền mới; cách tính xem mục 5.4. |
| **Conversion rate** | Tỉ lệ người đăng ký trở thành khách trả tiền, tính riêng theo kênh (mục 5.4). |
| **Khách quay lại** | Khách trả tiền có từ 2 giao dịch trả tiền ở hai thời điểm khác nhau (BR-105). |
| **Credit quét** | Lượt quét mua lẻ 49.000đ, không mất khi hết chu kỳ, hạn dùng 12 tháng (BR-94). |
| **Ân hạn (Grace period)** | 3 ngày sau khi gói hết hạn: vẫn xem/sửa được nhưng không quét/xuất (BR-90). |
| **First-touch attribution** | Gán khách cho kênh của lần truy cập đầu tiên (BR-84). |
| **Khoá sổ** | Chốt dữ liệu một kỳ để số liệu báo cáo không đổi (BR-98). |
| **Biên nhận thanh toán** | Chứng từ PDF xác nhận khách đã trả tiền; khác hoá đơn GTGT (BR-31). |
| **COMP** | Gói được Admin tặng/bồi hoàn, không tạo doanh thu (BR-103). |

### **Bảo mật / Tài khoản**

| Thuật ngữ | Giải thích |
| ----- | ----- |
| Đăng nhập mạo danh (Impersonation login) | Admin đăng nhập tạm thời vào tài khoản của một user khác để hỗ trợ (debug, xử lý ticket) mà không cần mật khẩu của user đó; bắt buộc ghi log, giới hạn thời gian và hiển thị cảnh báo vì có rủi ro lạm dụng quyền. |
| 2FA (Two-Factor Authentication) | Xác thực 2 lớp — ngoài mật khẩu còn cần thêm mã từ app Authenticator/SMS/Email. |
| RBAC (Role-Based Access Control) | Phân quyền theo vai trò (Guest/Customer/Team Owner/Admin) ở tầng server, không chỉ ẩn/hiện ở giao diện. |
| Device Session | Một phiên đăng nhập gắn với 1 thiết bị cụ thể; có thể thu hồi (đăng xuất) độc lập từng thiết bị. |
| Audit Log | Nhật ký bất biến ghi lại thao tác nhạy cảm (thao tác Admin, truy cập dữ liệu, mạo danh đăng nhập) để truy vết trách nhiệm. |
| Signed URL | Đường link tải file có chữ ký số, tự hết hạn sau một khoảng thời gian (ở đây ≤15 phút) để tránh lộ file vĩnh viễn. |
| Rate limiting | Giới hạn số lượt gọi API/tính năng trong một khoảng thời gian để chống lạm dụng/spam. |
| **Link nghệ nhân (Artisan link)** | Đường link chứa token ngẫu nhiên cho phép người không có tài khoản xem và tải đúng một phiên bản thiết kế đã xuất, có hạn dùng và giới hạn lượt tải (BR-101). |
| **Tài khoản nội bộ** | Tài khoản của team/demo/test, bị loại khỏi số liệu kinh doanh (BR-83). |

### **Kỹ thuật / Vận hành**

| Thuật ngữ | Giải thích |
| ----- | ----- |
| Webhook | Cơ chế một hệ thống ngoài (cổng thanh toán, dịch vụ scan 3D) chủ động gọi ngược vào server của mình để báo kết quả, thay vì mình phải hỏi liên tục. |
| Idempotent | Gọi lại nhiều lần cùng một yêu cầu (vd. webhook thanh toán bị gửi trùng) vẫn cho kết quả đúng một lần duy nhất, không xử lý lặp. |
| Cron job | Tác vụ chạy tự động theo lịch định kỳ (vd. "cron 1 phút" kiểm tra job quá hạn). |
| DLQ (Dead Letter Queue) | Hàng đợi chứa các tác vụ xử lý thất bại nhiều lần, để xem xét thủ công thay vì mất dữ liệu. |
| p95 | Giá trị mà 95% các lần đo nằm dưới ngưỡng đó (vd. API ≤500ms ở p95 nghĩa là 95% request nhanh hơn 500ms). |
| RPO / RTO | RPO (Recovery Point Objective): lượng dữ liệu tối đa chấp nhận mất khi có sự cố (ở đây ≤24h). RTO (Recovery Time Objective): thời gian tối đa để khôi phục hệ thống (ở đây ≤4h). |
| WCAG 2.1 AA | Chuẩn khả năng tiếp cận (accessibility) cho người khuyết tật, mức AA là mức phổ biến được yêu cầu tối thiểu. |
| Soft-delete | Xoá "mềm" — đánh dấu ẩn/không hoạt động thay vì xoá hẳn khỏi database, cho phép khôi phục. |
| Read-only | Chỉ xem, không sửa/lưu được (áp dụng cho dự án vượt hạn mức sau khi hạ gói). |
| Zoning / UV map | Zoning: chia bề mặt giày thành các vùng (mũi giày, gót, thân...) để áp màu/hoạ tiết riêng từng vùng. UV map: bản đồ "trải phẳng" bề mặt model 3D ra 2D để biết vị trí chính xác dán texture/hình ảnh lên. |
| Bake Preview | Chốt lại một bản render 3D chất lượng cao (ánh sáng, chất liệu) làm bản xem trước chính thức, dùng để xuất file/ảnh. |
| Guardrail nội dung | Bộ quy tắc lọc tự động (từ khoá cấm, nhãn hiệu bảo hộ...) để chặn nội dung vi phạm khi người dùng chèn chữ/ảnh/sticker. |
| **Pre-check (kiểm tra tại chỗ)** | Bước kiểm tra ánh sáng, độ nét, vật thể trước khi gửi Scan Job, để không trả tiền API cho đầu vào hỏng (BR-33). |
| **UTM** | Tham số gắn vào link (utm\_source, utm\_campaign) để biết người dùng đến từ kênh nào. |

&nbsp;