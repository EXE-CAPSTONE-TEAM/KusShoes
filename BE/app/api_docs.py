"""OpenAPI documentation: tag descriptions, per-endpoint summaries/descriptions and
the shared error envelope.

Kept in one place so the API reference can be reviewed as a whole. tests/test_api_docs.py
fails when an endpoint has no entry here (or an entry points at a removed endpoint).

Conventions used in the descriptions:
- "Bearer" = `Authorization: Bearer <access token>`; "Service token" = `X-Service-Token`
  header used by the desktop editor / worker; "Admin" = role admin or staff, "Admin (ghi)" =
  role admin only (staff gets 403).
- Every error is `{"code": "...", "message": "...", ...extra}` (see ErrorResponse).
"""

from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi

API_DESCRIPTION = """
Backend API của nền tảng KusShoes (thiết kế giày 3D tùy biến).

**Xác thực**
- Người dùng: `Authorization: Bearer <access_token>` (token sống ngắn, đổi bằng `/auth/refresh`;
  refresh token nằm trong cookie HttpOnly).
- Admin/Staff: đăng nhập tại `/admin/auth/login`, cùng dạng Bearer. Endpoint ghi dữ liệu yêu cầu
  role `admin` (staff nhận 403).
- Ứng dụng desktop / worker: header `X-Service-Token`.

**Định dạng lỗi**: mọi lỗi nghiệp vụ trả `{"code": "MA_LOI", "message": "..."}` kèm trường phụ
tùy lỗi (ví dụ `retry_after`, `terms`, `next_allowed_at`). Lỗi kiểm tra dữ liệu đầu vào (422) dùng
định dạng chuẩn của FastAPI (`detail`).

**Phân trang**: danh sách dùng con trỏ (`cursor`, `limit`) và trả `next_cursor` + `has_next`.

**Thời gian**: ISO 8601 có múi giờ; ngày nghiệp vụ tính theo GMT+7.

**Số tiền**: VND, số nguyên.
"""

TAGS = [
    {"name": "Auth", "description": "Đăng ký, đăng nhập, OTP, 2FA, phiên đăng nhập, SSO cho editor, khôi phục mật khẩu/tài khoản."},
    {"name": "Users", "description": "Hồ sơ cá nhân, quyền riêng tư, đồng ý dữ liệu, lịch sử đăng nhập, 2FA, xuất dữ liệu, xóa tài khoản."},
    {"name": "Projects", "description": "Dự án thiết kế, thùng rác, lưu thiết kế, bake/export 3D."},
    {"name": "Assets", "description": "Tệp của dự án (model 3D, texture) qua presigned URL."},
    {"name": "Editor", "description": "API của cầu nối KusStudio (desktop): dùng editor session token lấy từ vé mở editor."},
    {"name": "Mobile", "description": "Cầu nối ứng dụng di động (quét giày). Ngoài phạm vi web portal."},
    {"name": "Mobile Internal", "description": "Endpoint nội bộ cho dịch vụ tính toán quét; xác thực bằng token dịch vụ riêng."},
    {"name": "Studio", "description": "Lịch sử phiên bản, template, link chia sẻ cho nghệ nhân, gói tham khảo PDF."},
    {"name": "Public Artisan", "description": "Endpoint công khai (không đăng nhập) để nghệ nhân xem/tải bản xuất qua link chia sẻ."},
    {"name": "Exports", "description": "Lịch sử file đã xuất và link tải."},
    {"name": "Subscription", "description": "Gói dịch vụ, thanh toán PayOS/MoMo, mã giảm giá, hóa đơn và biên nhận."},
    {"name": "Feedback", "description": "Gửi và xem phản hồi của khách hàng."},
    {"name": "Webhooks", "description": "Callback từ cổng thanh toán (xác thực bằng chữ ký, không dùng Bearer)."},
    {"name": "Admin Auth", "description": "Đăng nhập/đăng xuất khu vực quản trị."},
    {"name": "Admin Users", "description": "Quản lý người dùng, nhân viên, cấp gói tặng, đăng nhập thay, đặt lại mật khẩu."},
    {"name": "Admin Plans", "description": "Cấu hình gói dịch vụ và hạn mức."},
    {"name": "Admin Billing", "description": "Giao dịch, hoàn tiền, giao dịch thủ công, khóa kỳ báo cáo, mã giảm giá."},
    {"name": "Admin Dashboard", "description": "Số liệu tổng quan cho trang chủ quản trị."},
    {"name": "Admin Analytics", "description": "Chỉ số kinh doanh (MRR, ARR, churn, NRR/GRR…) và báo cáo CSV/XLSX/PDF."},
    {"name": "Admin Studio", "description": "Quy tắc nội dung (guardrail) và thư viện template."},
    {"name": "Admin Feedback", "description": "Xử lý phản hồi khách hàng và xuất Excel."},
    {"name": "Admin Ops", "description": "Vận hành: dự án, bake job, export, sức khỏe hệ thống, nhật ký thao tác."},
    {"name": "Quota Internal", "description": "Endpoint nội bộ cho dịch vụ quét: trừ lượt quét theo thứ tự gói → Credit (BR-23); xác thực bằng token dịch vụ."},
    {"name": "Moderation", "description": "Báo cáo vi phạm nội dung/bản quyền (công khai) và tình trạng xử lý vi phạm của tài khoản (BR-77)."},
    {"name": "Admin Moderation", "description": "Xử lý báo cáo vi phạm bản quyền: cảnh cáo → hạn chế chia sẻ 30 ngày → khoá tài khoản (BR-77, UC-24)."},
    {"name": "API Cost Internal", "description": "Ghi chi phí mỗi lần gọi API 3D/AI và kiểm tra trạng thái nhận Scan Job (SF-14); xác thực bằng token dịch vụ."},
    {"name": "Admin API Cost", "description": "Chi phí API theo ngày, ngân sách tháng và ngưỡng cảnh báo 80% / tạm ngưng 100% (SF-14, BR-108)."},
    {"name": "Health", "description": "Kiểm tra sống/sẵn sàng của dịch vụ."},
    {"name": "Monitoring", "description": "Metrics dạng Prometheus."},
]

_B = "Bearer."
_A = "Admin (Bearer)."
_AW = "Admin ghi (Bearer, staff bị 403)."
_S = "Service token (`X-Service-Token`)."
_E = "Editor session token (Bearer, cấp bởi `/auth/editor/launch/exchange`)."
_M = "Token tính toán di động (dịch vụ nội bộ)."
_P = "Công khai."

# "METHOD /path": (summary, description)
DOCS: dict[str, tuple[str, str]] = {
    # ---- Auth ----
    "POST /api/v1/auth/register": ("Đăng ký tài khoản", "Tạo tài khoản email/mật khẩu và gửi mã OTP xác minh. Bắt buộc `age_confirmed=true` (BR-02); ghi bản ghi đồng ý điều khoản, quyền riêng tư và độ tuổi (BR-89) và nguồn truy cập (UTM/mã giới thiệu). Giới hạn tần suất theo IP. " + _P),
    "POST /api/v1/auth/verify-otp": ("Xác minh email bằng OTP", "Xác minh mã OTP 6 số. Sai quá số lần cho phép sẽ khóa tạm (`OTP_LOCKED`); mã hết hạn trả `OTP_EXPIRED`. " + _P),
    "POST /api/v1/auth/resend-otp": ("Gửi lại OTP", "Gửi lại mã xác minh cho tài khoản chưa xác thực, có giới hạn tần suất. " + _P),
    "POST /api/v1/auth/login": ("Đăng nhập", "Đăng nhập email/mật khẩu. Trả access token và đặt refresh token vào cookie HttpOnly. Nếu bật 2FA trả `mfa_required` cùng challenge token để gọi `/auth/2fa/verify`. Khóa 15 phút sau 5 lần sai (BR-86); gửi email khi đăng nhập từ thiết bị mới (BR-14). " + _P),
    "POST /api/v1/auth/2fa/verify": ("Hoàn tất đăng nhập với 2FA", "Nhận challenge token và mã TOTP/email hoặc mã khôi phục. Sai mã không làm mất challenge (giới hạn số lần thử). " + _P),
    "GET /api/v1/auth/google": ("Bắt đầu đăng nhập Google", "Chuyển hướng (302) tới màn hình đồng ý của Google (OAuth 2.0, có `state` chống CSRF). " + _P),
    "GET /api/v1/auth/google/callback": ("Callback đăng nhập Google", "Google gọi về sau khi đồng ý (`code`, `state`); tạo hoặc nối tài khoản rồi trả access token (`is_new_user`, `linked`) và đặt refresh token vào cookie. " + _P),
    "POST /api/v1/auth/refresh": ("Đổi refresh token lấy access token", "Đọc refresh token từ cookie (hoặc body), xoay vòng token. Token đã dùng/không hợp lệ trả `AUTH_REFRESH_INVALID`. " + _P),
    "POST /api/v1/auth/logout": ("Đăng xuất", "Thu hồi refresh token hiện tại và xóa cookie. " + _B),
    "POST /api/v1/auth/forgot-password": ("Yêu cầu mã đặt lại mật khẩu", "Gửi mã khôi phục 15 phút tới email nếu tài khoản hợp lệ; luôn trả cùng một thông báo để không lộ email nào tồn tại. Giới hạn theo IP và email. " + _P),
    "POST /api/v1/auth/reset-password": ("Đặt lại mật khẩu", "Đổi mật khẩu bằng mã khôi phục, thu hồi mọi phiên. Sai quá 5 lần trả `AUTH_RESET_LOCKED`. " + _P),
    "GET /api/v1/auth/sessions": ("Danh sách phiên đăng nhập", "Các phiên (thiết bị) đang hoạt động của người dùng. " + _B),
    "DELETE /api/v1/auth/sessions": ("Thu hồi mọi phiên", "Đăng xuất khỏi tất cả thiết bị. " + _B),
    "DELETE /api/v1/auth/sessions/{session_id}": ("Thu hồi một phiên", "Đăng xuất một thiết bị cụ thể. Không tìm thấy trả `AUTH_SESSION_NOT_FOUND`. " + _B),
    "POST /api/v1/auth/sso-token": ("Tạo mã SSO mở editor", "Tạo mã dùng một lần (sống ngắn) gắn với một dự án để mở KusStudio mà không nhập lại mật khẩu. " + _B),
    "POST /api/v1/auth/verify-sso": ("Đổi mã SSO lấy phiên editor", "Editor đổi mã SSO thành thông tin người dùng/dự án. Mã dùng một lần. " + _S),
    "POST /api/v1/auth/desktop-session": ("Đổi mã SSO lấy phiên desktop", "Tương tự verify-sso nhưng trả access token cho ứng dụng desktop. " + _S),
    "POST /api/v1/auth/restore-account/request": ("Yêu cầu khôi phục tài khoản đã xóa", "Gửi mã 6 số tới email nếu tài khoản đã xóa còn trong 30 ngày (BR-06). Luôn trả cùng một thông báo. " + _P),
    "POST /api/v1/auth/restore-account/confirm": ("Xác nhận khôi phục tài khoản", "Nhập email + mã để hủy xóa tài khoản; sau đó đăng nhập lại. Sai/hết hạn trả `AUTH_RESTORE_INVALID`. " + _P),
    "POST /api/v1/auth/editor/launch": ("Tạo vé mở KusStudio", "Tạo vé mở editor dùng một lần, sống ngắn, gắn với một dự án; trả URL/ticket để mở ứng dụng desktop. " + _B),
    "POST /api/v1/auth/editor/launch/claim": ("Desktop nhận vé mở editor", "Ứng dụng desktop trình vé để nhận thông tin phiên khởi tạo; vé chỉ dùng được một lần. " + _P),
    "POST /api/v1/auth/editor/launch/exchange": ("Đổi vé lấy editor session", "Đổi vé đã nhận lấy editor session token (scope theo quyền của người dùng). " + _P),
    "GET /api/v1/auth/editor/session": ("Phiên editor hiện tại", "Trả thông tin và scope của editor session đang dùng. " + _E),
    # ---- Admin Auth ----
    "POST /api/v1/admin/auth/login": ("Đăng nhập quản trị", "Đăng nhập cho role admin/staff, giới hạn tần suất theo IP. " + _P),
    "POST /api/v1/admin/auth/logout": ("Đăng xuất quản trị", "Thu hồi phiên quản trị hiện tại. " + _A),
    # ---- Admin Billing ----
    "GET /api/v1/admin/billing/subscriptions": ("Danh sách đăng ký", "Lọc theo trạng thái/gói, phân trang con trỏ. " + _A),
    "GET /api/v1/admin/billing/invoices": ("Danh sách giao dịch", "Lọc theo trạng thái, hình thức thanh toán, giao dịch thủ công, cờ nội bộ, khoảng ngày; phân trang con trỏ. " + _A),
    "POST /api/v1/admin/billing/subscriptions/{user_id}/force-downgrade": ("Ép hạ về Free", "Hạ gói của người dùng về Free ngay (khóa dự án vượt hạn mức, BR-27). Ghi audit. " + _AW),
    "POST /api/v1/admin/billing/invoices/{invoice_id}/refund": ("Hoàn tiền một giao dịch", "Tạo bút toán hoàn tiền (không gọi cổng thanh toán). Tự động chỉ khi ≤7 ngày và chưa xuất file; ngoài chính sách cần `override=true` (BR-97). Hoàn toàn bộ gói hiện tại sẽ hạ về Free. Bị chặn nếu ngày thanh toán nằm trong kỳ đã khóa (`PERIOD_LOCKED`). " + _AW),
    "POST /api/v1/admin/billing/manual-transactions/proof-upload": ("Xin URL tải ảnh chứng từ", "Trả presigned URL để tải ảnh chứng từ (chuyển khoản/tiền mặt) trước khi tạo giao dịch thủ công. " + _AW),
    "POST /api/v1/admin/billing/manual-transactions": ("Tạo giao dịch thủ công", "Ghi nhận thanh toán tiền mặt/chuyển khoản trực tiếp ở trạng thái chờ duyệt; cần người thứ hai duyệt (maker/checker, BR-95). " + _AW),
    "POST /api/v1/admin/billing/invoices/{invoice_id}/approve": ("Duyệt giao dịch thủ công", "Người duyệt phải khác người tạo. Duyệt xong kích hoạt gói và sinh biên nhận KUS-xxx. " + _AW),
    "POST /api/v1/admin/billing/invoices/{invoice_id}/reject": ("Từ chối giao dịch thủ công", "Từ chối kèm lý do; giao dịch chuyển sang thất bại. " + _AW),
    "GET /api/v1/admin/billing/periods": ("Danh sách kỳ báo cáo", "Các kỳ mở/khóa dùng để khóa sổ (BR-98). " + _A),
    "POST /api/v1/admin/billing/periods": ("Tạo kỳ báo cáo", "Tạo kỳ theo khoảng ngày (GMT+7), trạng thái mở. " + _AW),
    "POST /api/v1/admin/billing/periods/{period_id}/lock": ("Khóa kỳ báo cáo", "Sau khi khóa, giao dịch thủ công và hoàn tiền trong kỳ bị từ chối. " + _AW),
    "GET /api/v1/admin/billing/coupons": ("Danh sách mã giảm giá", "Toàn bộ mã kèm số lần đã dùng. " + _A),
    "POST /api/v1/admin/billing/coupons": ("Tạo mã giảm giá", "Loại `percent`, `fixed` hoặc `fixed_price`; giới hạn gói, thời hạn, số lượt, chỉ áp cho lần thanh toán đầu (Early Bird, BR-91). " + _AW),
    "PATCH /api/v1/admin/billing/coupons/{coupon_id}": ("Cập nhật mã giảm giá", "Sửa hạn dùng, giới hạn, bật/tắt mã. " + _AW),
    # ---- Admin Dashboard ----
    "GET /api/v1/admin/dashboard/stats": ("Số liệu tổng quan", "Người dùng, MRR, lượt xuất, dự án… cho trang chủ quản trị. " + _A),
    "GET /api/v1/admin/dashboard/revenue": ("Doanh thu theo tháng", "Chuỗi doanh thu `months` tháng gần nhất (mặc định 12). " + _A),
    "GET /api/v1/admin/dashboard/user-growth": ("Tăng trưởng người dùng", "Số đăng ký mới theo tháng (mặc định 6 tháng). " + _A),
    "GET /api/v1/admin/dashboard/recent-users": ("Người dùng mới nhất", "Danh sách đăng ký gần đây. " + _A),
    # ---- Admin Users ----
    "GET /api/v1/admin/users": ("Danh sách người dùng", "Tìm kiếm, lọc theo trạng thái/role, phân trang con trỏ. " + _A),
    "GET /api/v1/admin/users/{user_id}": ("Chi tiết người dùng", "Hồ sơ, gói, hạn mức và thống kê sử dụng. " + _A),
    "POST /api/v1/admin/users/{user_id}/ban": ("Khóa tài khoản", "Đặt trạng thái `suspended` (chặn đăng nhập ngay). Không áp dụng cho admin/staff hoặc chính mình. " + _AW),
    "POST /api/v1/admin/users/{user_id}/unban": ("Mở khóa tài khoản", "Đặt lại trạng thái `active`. " + _AW),
    "POST /api/v1/admin/users/{user_id}/internal": ("Gắn/bỏ cờ tài khoản nội bộ", "Tài khoản nội bộ bị loại khỏi mọi chỉ số kinh doanh (BR-83). " + _AW),
    "POST /api/v1/admin/staff": ("Tạo tài khoản staff", "Tạo tài khoản role `staff` (chỉ xem, không ghi). " + _AW),
    "POST /api/v1/admin/users/{user_id}/grant-plan": ("Cấp gói tặng (COMP)", "Cấp gói miễn phí có thời hạn, không tạo giao dịch và không tính vào doanh thu (BR-103). " + _AW),
    "POST /api/v1/admin/users/{user_id}/impersonate": ("Đăng nhập thay người dùng", "Yêu cầu admin đã bật 2FA và nhập lý do/mã ticket (BR-80). Trả access token 30 phút, không có refresh token; phiên bị chặn thanh toán, đổi mật khẩu, xóa tài khoản, 2FA. Ghi audit và gửi email cho khách khi kết thúc. " + _AW),
    "POST /api/v1/admin/users/{user_id}/reset-password": ("Gửi mã đặt lại mật khẩu cho khách", "Admin không thấy/đặt mật khẩu; khách nhận mã khôi phục qua email. Tài khoản chỉ dùng Google trả `ADMIN_RESET_NOT_ALLOWED`. " + _AW),
    # ---- Admin Plans ----
    "GET /api/v1/admin/plans": ("Danh sách gói", "Kể cả gói đã ẩn, kèm toàn bộ hạn mức. " + _A),
    "PATCH /api/v1/admin/plans/{plan_id}": ("Cập nhật gói", "Sửa giá, hạn mức, định dạng xuất, ưu tiên bake, số phiên bản tối đa mỗi dự án. " + _AW),
    # ---- Admin Studio ----
    "GET /api/v1/admin/guardrail-rules": ("Danh sách quy tắc nội dung", "Từ cấm (`banned`) và thương hiệu (`trademark`). " + _A),
    "POST /api/v1/admin/guardrail-rules": ("Thêm quy tắc nội dung", "Từ khóa được chuẩn hóa (không dấu, chữ thường); trùng trả `GUARDRAIL_RULE_EXISTS`. Ghi audit. " + _AW),
    "PATCH /api/v1/admin/guardrail-rules/{rule_id}": ("Bật/tắt quy tắc", "Đổi `is_active`. Ghi audit. " + _AW),
    "DELETE /api/v1/admin/guardrail-rules/{rule_id}": ("Xóa quy tắc", "Xóa quy tắc khỏi danh sách áp dụng. Ghi audit. " + _AW),
    "GET /api/v1/admin/templates": ("Danh sách template (admin)", "Lọc theo trạng thái pending/approved/rejected. " + _A),
    "POST /api/v1/admin/templates": ("Tạo template", "Nội dung phải qua guardrail (từ cấm/thương hiệu bị từ chối). Tạo ở trạng thái chờ duyệt. " + _AW),
    "POST /api/v1/admin/templates/{template_id}/approve": ("Duyệt template", "Hiển thị công khai trong thư viện. " + _AW),
    "POST /api/v1/admin/templates/{template_id}/reject": ("Từ chối template", "Ẩn khỏi thư viện. " + _AW),
    # ---- Admin Feedback ----
    "GET /api/v1/admin/feedback": ("Danh sách phản hồi", "Lọc theo trạng thái, nhóm 4P, số sao; mặc định loại tài khoản nội bộ (`include_internal`). " + _A),
    "GET /api/v1/admin/feedback/summary": ("Thống kê phản hồi", "Số lượng, điểm trung bình, theo trạng thái và nhóm 4P (loại nội bộ). " + _A),
    "GET /api/v1/admin/feedback/export": ("Xuất phản hồi ra Excel", "Tệp .xlsx; mặc định loại tài khoản nội bộ. " + _A),
    "PATCH /api/v1/admin/feedback/{feedback_id}": ("Xử lý phản hồi", "Đổi trạng thái NEW→REVIEWED→PLANNED→DONE/WONT_DO và ghi 'đã thay đổi gì' hiển thị cho khách. Ghi audit. " + _AW),
    # ---- Admin Analytics ----
    "GET /api/v1/admin/analytics": ("Chỉ số kinh doanh", "MRR, ARR, ARPU, doanh thu ghi nhận (so kỳ trước), churn, NRR/GRR, Free→trả phí, tỷ lệ khách quay lại (BR-105), thanh toán lỗi, doanh thu theo gói, biến động, top khách hàng. Loại tài khoản nội bộ và gói COMP. Mặc định 30 ngày gần nhất. " + _A),
    "GET /api/v1/admin/reports/{report_type}": ("Tải báo cáo", "`report_type`: `revenue`, `users`, `transactions` (Sổ giao dịch EXE201, BR-106), `channel-funnel` (phễu theo kênh và tuần, BR-107). `format`: csv, xlsx hoặc pdf. " + _A),
    # ---- Admin Ops ----
    "GET /api/v1/admin/projects": ("Danh sách dự án", "Mọi dự án kể cả đã xóa mềm; tìm kiếm, phân trang. " + _A),
    "GET /api/v1/admin/projects/{project_id}": ("Chi tiết dự án", "Thông tin dự án, tệp và bake job. " + _A),
    "DELETE /api/v1/admin/projects/{project_id}": ("Xóa dự án", "Chuyển vào thùng rác (xóa mềm), dọn hẳn sau thời hạn lưu 30 ngày. Ghi audit. " + _AW),
    "GET /api/v1/admin/bake-jobs": ("Danh sách bake job", "Lọc theo trạng thái, ưu tiên, dự án. " + _A),
    "GET /api/v1/admin/bake-jobs/{job_id}": ("Chi tiết bake job", "Trạng thái, lỗi, thời gian xử lý. " + _A),
    "POST /api/v1/admin/bake-jobs/{job_id}/requeue": ("Xếp lại bake job lỗi", "Chỉ với job `failed`. " + _AW),
    "POST /api/v1/admin/bake-jobs/{job_id}/cancel": ("Hủy bake job đang chờ", "Chỉ với job `queued`. " + _AW),
    "GET /api/v1/admin/exports": ("Danh sách file xuất", "Lọc theo người dùng, dự án, định dạng. " + _A),
    "GET /api/v1/admin/system/health": ("Sức khỏe hệ thống", "Kiểm tra DB, Redis và độ sâu các hàng đợi (high/normal/low). " + _A),
    "GET /api/v1/admin/audit-logs": ("Nhật ký thao tác quản trị", "Lọc theo người thực hiện, hành động, đối tượng; phân trang con trỏ. " + _A),
    # ---- Users ----
    "GET /api/v1/users/me": ("Hồ sơ của tôi", "Thông tin tài khoản và gói hiện tại. " + _B),
    "DELETE /api/v1/users/me": ("Xóa tài khoản", "Xóa mềm; cần xác thực lại (mật khẩu hoặc Google). Thu hồi mọi phiên; khôi phục được trong 30 ngày (BR-06). Bị chặn trong phiên đăng nhập thay. " + _B),
    "PATCH /api/v1/users/me": ("Cập nhật hồ sơ", "Đổi tên, username (giới hạn 30 ngày/lần, BR-10, có từ khóa dành riêng). " + _B),
    "POST /api/v1/users/me/avatar": ("Xin URL tải avatar", "Trả presigned URL để tải ảnh đại diện lên. " + _B),
    "DELETE /api/v1/users/me/avatar": ("Xóa avatar", "Xóa ảnh đại diện và tệp lưu trữ tương ứng. " + _B),
    "PUT /api/v1/users/me/password": ("Đổi mật khẩu", "Yêu cầu mật khẩu hiện tại; thu hồi mọi phiên khác. Bị chặn trong phiên đăng nhập thay. " + _B),
    "GET /api/v1/users/me/usage": ("Mức sử dụng hạn mức", "Số dự án, lượt xuất, AI credit trong chu kỳ hiện tại so với hạn mức gói. " + _B),
    "GET /api/v1/users/me/privacy": ("Cài đặt quyền riêng tư", "Mặc định tắt hết (BR-15). " + _B),
    "PATCH /api/v1/users/me/privacy": ("Đổi cài đặt quyền riêng tư", "Hồ sơ công khai, hiển thị thiết kế, cho phép tìm kiếm, phân tích, cá nhân hóa quảng cáo. " + _B),
    "GET /api/v1/users/me/consents": ("Danh sách đồng ý", "Đồng ý điều khoản, marketing, báo cáo học thuật, cookie (BR-89). " + _B),
    "POST /api/v1/users/me/consents": ("Ghi/thu hồi đồng ý", "Bật hoặc thu hồi một loại đồng ý tùy chọn. " + _B),
    "GET /api/v1/users/me/login-history": ("Lịch sử đăng nhập", "Các lần đăng nhập thành công/thất bại, IP che octet cuối (BR-18); lưu 90 ngày. " + _B),
    "POST /api/v1/users/me/data-export": ("Xuất dữ liệu cá nhân", "Tạo file zip (hồ sơ, dự án, đồng ý, lịch sử đăng nhập) và trả URL tải 15 phút; tối đa 1 lần/24 giờ (BR-19). " + _B),
    "GET /api/v1/users/me/2fa": ("Trạng thái 2FA", "Phương thức đang bật, email khôi phục. Bị chặn trong phiên đăng nhập thay. " + _B),
    "POST /api/v1/users/me/2fa/recovery-email": ("Đặt email khôi phục 2FA", "Gửi mã xác nhận tới email khôi phục. " + _B),
    "POST /api/v1/users/me/2fa/recovery-email/verify": ("Xác nhận email khôi phục", "Nhập mã đã gửi. " + _B),
    "POST /api/v1/users/me/2fa/setup": ("Bắt đầu thiết lập 2FA", "Chọn `totp` (trả secret/URI để quét) hoặc `email` (gửi mã). " + _B),
    "POST /api/v1/users/me/2fa/enable": ("Bật 2FA", "Xác nhận mã đầu tiên; trả 10 mã khôi phục dùng một lần (chỉ hiện một lần). " + _B),
    "POST /api/v1/users/me/2fa/disable": ("Tắt 2FA", "Yêu cầu mật khẩu và mã 2FA. " + _B),
    "POST /api/v1/users/me/impersonation/end": ("Kết thúc phiên đăng nhập thay", "Chỉ dùng với token của phiên impersonation; ghi audit và gửi email thông báo cho khách. " + _B),
    # ---- Projects ----
    "GET /api/v1/projects": ("Danh sách dự án", "Dự án chưa xóa của người dùng, phân trang con trỏ, mới sửa gần nhất trước. " + _B),
    "POST /api/v1/projects": ("Tạo dự án", "Bị giới hạn theo `max_projects` của gói (`PROJ_QUOTA_EXCEEDED`). " + _B),
    "GET /api/v1/projects/trash": ("Thùng rác", "Dự án đã xóa, còn khôi phục được trong 30 ngày (BR-47). " + _B),
    "GET /api/v1/projects/{project_id}": ("Chi tiết dự án", "Kèm `design_config` và cờ `is_locked` (BR-27). Không phải chủ sở hữu trả 403. " + _B),
    "PATCH /api/v1/projects/{project_id}": ("Cập nhật dự án", "Đổi tên/mô tả. Dự án bị khóa trả `PROJECT_LOCKED`. " + _B),
    "DELETE /api/v1/projects/{project_id}": ("Chuyển vào thùng rác", "Xóa mềm; giải phóng hạn mức dự án. " + _B),
    "POST /api/v1/projects/{project_id}/restore": ("Khôi phục từ thùng rác", "Trong 30 ngày; ngoài hạn trả `PROJ_RESTORE_EXPIRED`; còn phụ thuộc hạn mức gói hiện tại. " + _B),
    "DELETE /api/v1/projects/{project_id}/permanent": ("Xóa vĩnh viễn", "Xóa dự án trong thùng rác và mọi tệp. " + _B),
    "PUT /api/v1/projects/{project_id}/design": ("Lưu thiết kế", "Kiểm tra giới hạn layer (BR-52), khóa khi đang xuất (`PROJECT_EXPORTING`, BR-45) và guardrail nội dung (`CONTENT_BANNED`, `CONTENT_TRADEMARK_CONFIRM_REQUIRED`, `CONTENT_TEXT_TOO_LONG`). Mỗi lần lưu khác nội dung tạo một phiên bản. Header `X-Service-Token` bắt buộc. " + _S),
    "POST /api/v1/projects/{project_id}/bake": ("Bắt đầu bake/export 3D", "Kiểm tra email đã xác thực, không trong ân hạn, hạn mức xuất; ghim phiên bản thiết kế đang gửi. Trả job (202). Đang có job trả `PROJ_BAKE_IN_PROGRESS`. " + _S),
    "GET /api/v1/projects/{project_id}/bake/{job_id}": ("Trạng thái bake job", "Trả trạng thái, thời gian, `can_retry`, `can_cancel`, `poll_after_seconds`. " + _B),
    "POST /api/v1/projects/{project_id}/bake/{job_id}/retry": ("Thử lại bake job lỗi", "Chỉ với job `failed`. " + _B),
    "POST /api/v1/projects/{project_id}/bake/{job_id}/cancel": ("Hủy bake job", "Chỉ với job đang chờ (`queued`). " + _B),
    "GET /api/v1/projects/{project_id}/exports": ("File đã xuất của dự án", "Các bản xuất (glb/obj/zip) của dự án. " + _B),
    # ---- Assets ----
    "POST /api/v1/projects/{project_id}/assets/upload-url": ("Xin URL tải tệp lên", "Trả presigned URL (15 phút) để tải model/texture; xác nhận bằng `/assets/confirm`. " + _B),
    "POST /api/v1/projects/{project_id}/assets/confirm": ("Xác nhận tệp đã tải", "Kiểm tra tệp tồn tại trong lưu trữ rồi ghi nhận vào dự án. " + _B),
    "GET /api/v1/projects/{project_id}/assets": ("Danh sách tệp của dự án", "Model gốc, texture, thumbnail… " + _B),
    "DELETE /api/v1/projects/{project_id}/assets/{asset_id}": ("Xóa tệp", "Xóa bản ghi và tệp lưu trữ. " + _B),
    # ---- Editor ----
    "GET /api/v1/editor/projects/{project_id}/context": ("Ngữ cảnh mở editor", "Người dùng, dự án, model gốc, thiết kế gần nhất và quyền. Dùng cho KusStudio desktop. " + _B),
    "GET /api/v1/editor/me": ("Người dùng của editor session", "Thông tin người dùng gắn với editor session. " + _E),
    "POST /api/v1/editor/projects/{project_id}/designs": ("Lưu thiết kế từ editor", "Cần scope `editor:write`. Kiểm tra model gốc sẵn sàng, `base_revision` khớp bản hiện tại (xung đột trả lỗi revision), khóa xuất (`PROJECT_EXPORTING`) và guardrail nội dung; mỗi lần lưu tạo revision và một phiên bản lịch sử. " + _E),
    "GET /api/v1/editor/designs/{design_id}": ("Lấy thiết kế", "Thiết kế hiện tại của dự án kèm bake job và file xuất gần nhất. " + _E),
    "POST /api/v1/editor/designs/{design_id}/bake": ("Bắt đầu bake từ editor", "Cần scope `editor:write` và thiết kế đã lưu; dùng cùng quy tắc hạn mức như bake của portal (202). " + _E),
    "GET /api/v1/editor/jobs/{job_id}": ("Trạng thái bake job", "Trạng thái xử lý của một bake job do editor tạo. " + _E),
    "POST /api/v1/editor/designs/{design_id}/export": ("Lấy gói export", "Trả các file đã xuất của thiết kế để editor tải về. " + _E),
    "POST /api/v1/editor/assets/upload-url": ("Xin URL tải tệp (editor)", "Presigned URL để editor tải model/texture lên dự án. " + _E),
    "POST /api/v1/editor/assets/confirm": ("Xác nhận tệp đã tải (editor)", "Xác nhận tệp đã có trong kho lưu trữ và ghi nhận vào dự án. " + _E),
    "GET /api/v1/editor/assets/{asset_id}/content": ("Tải nội dung tệp", "Stream nội dung một tệp của dự án; chỉ tệp thuộc phiên editor. " + _E),
    "GET /api/v1/editor/exports/{export_id}/content": ("Tải nội dung file xuất", "Stream nội dung một file đã xuất; chỉ file thuộc phiên editor. " + _E),
    # ---- Mobile ----
    "POST /api/v1/mobile/scans/bootstrap": ("Khởi tạo phiên quét", "Ứng dụng di động bắt đầu một phiên quét cho người dùng đã đăng nhập. Ngoài phạm vi web portal. " + _B),
    "POST /api/v1/internal/mobile/compute-grants/claim": ("Nhận quyền tính toán quét", "Dịch vụ tính toán nhận một compute grant. " + _M),
    "POST /api/v1/internal/mobile/scans/output-upload": ("Xin URL tải kết quả quét", "Dịch vụ tính toán xin presigned URL để tải kết quả lên. " + _M),
    "POST /api/v1/internal/mobile/scans/output-confirm": ("Xác nhận kết quả quét", "Dịch vụ tính toán xác nhận kết quả đã tải lên. " + _M),
    # ---- Studio ----
    "GET /api/v1/projects/{project_id}/versions": ("Lịch sử phiên bản", "Các phiên bản thiết kế, mới nhất trước; bản đã xuất được ghim và không bị xóa khi dọn (BR-46). " + _B),
    "GET /api/v1/projects/{project_id}/versions/{version_id}": ("Chi tiết phiên bản", "Kèm toàn bộ `design_config`. " + _B),
    "POST /api/v1/projects/{project_id}/versions/{version_id}/restore": ("Khôi phục phiên bản", "Ghi cấu hình cũ thành phiên bản mới nhất (lịch sử không bị sửa). Bị chặn khi dự án khóa hoặc đang xuất. " + _B),
    "GET /api/v1/templates": ("Thư viện template", "Template đã duyệt, lọc theo `category`. " + _B),
    "POST /api/v1/projects/{project_id}/apply-template/{template_id}": ("Áp dụng template", "Thay thiết kế bằng template, tôn trọng giới hạn layer, khóa và guardrail; tạo phiên bản mới. " + _B),
    "POST /api/v1/projects/{project_id}/artisan-links": ("Tạo link cho nghệ nhân", "Chỉ gói trả phí đang `active` (không trong ân hạn), từ một bản xuất (mặc định bản mới nhất). Hiệu lực 30 ngày, tối đa 20 lượt tải (BR-101). Token chỉ hiển thị một lần trong phản hồi này. " + _B),
    "GET /api/v1/projects/{project_id}/artisan-links": ("Danh sách link chia sẻ", "Không trả token. " + _B),
    "POST /api/v1/artisan-links/{link_id}/revoke": ("Thu hồi link", "Link ngừng hoạt động ngay. " + _B),
    "POST /api/v1/artisan-links/{link_id}/renew": ("Gia hạn link", "Đặt lại 30 ngày và số lượt tải. " + _B),
    "GET /api/v1/projects/{project_id}/reference-pack": ("Tải gói tham khảo PDF", "PDF gồm lưu ý, màu, chữ/font, danh sách layer, phiên bản và ngày; tùy chọn `token` để in mã QR tới trang xem (BR-71). Không có ảnh 4 góc. " + _B),
    # ---- Public Artisan ----
    "GET /api/v1/public/artisan/{token}": ("Xem thông tin link nghệ nhân", "Tên dự án, định dạng, hạn và số lượt tải còn lại. Link sai/hết hạn/bị thu hồi/hết lượt đều trả 410 `ARTISAN_LINK_INVALID`. Giới hạn 30 lượt/phút/IP. " + _P),
    "POST /api/v1/public/artisan/{token}/download": ("Tải bản xuất qua link", "Trừ một lượt và trả URL tải có chữ ký tối đa 15 phút. Lỗi giống endpoint xem. " + _P),
    # ---- Feedback ----
    "GET /api/v1/feedback/eligibility": ("Có được gửi phản hồi không", "Mỗi người 1 phiếu/14 ngày (BR-109); trả `next_allowed_at`. " + _B),
    "POST /api/v1/feedback": ("Gửi phản hồi", "Điểm 1–5, nội dung và nhóm 4P. Gửi sớm trả 429 `FEEDBACK_TOO_SOON` kèm `next_allowed_at`. " + _B),
    "GET /api/v1/feedback/mine": ("Phản hồi của tôi", "Kèm trạng thái xử lý và 'đã thay đổi gì'. " + _B),
    # ---- Exports ----
    "GET /api/v1/exports": ("Lịch sử xuất file", "Lọc theo dự án/định dạng, phân trang con trỏ. " + _B),
    "POST /api/v1/exports/{export_id}/download-url": ("Lấy link tải file đã xuất", "URL có chữ ký 1 giờ, tăng bộ đếm lượt tải. " + _B),
    # ---- Subscription ----
    "GET /api/v1/plans": ("Bảng giá công khai", "Gói đang bán, hạn mức và giá. " + _P),
    "GET /api/v1/subscription": ("Gói hiện tại", "Trạng thái (active/grace/…), ngày hết hạn, ân hạn 3 ngày (BR-90). " + _B),
    "GET /api/v1/subscription/invoices": ("Lịch sử hóa đơn", "Hóa đơn của người dùng kèm số biên nhận. " + _B),
    "POST /api/v1/subscription/checkout": ("Tạo thanh toán", "Tạo hóa đơn chờ và trả link PayOS hoặc MoMo. Nâng cấp giữa chu kỳ tính pro-rata (BR-24); có thể kèm `coupon_code` (không cộng dồn với pro-rata). Chỉ kích hoạt gói khi webhook hợp lệ. Bị chặn trong phiên đăng nhập thay. " + _B),
    "POST /api/v1/subscription/cancel": ("Hủy gia hạn", "Không gọi cổng thanh toán (không có tự động trừ tiền, BR-25); gói hết hạn theo chu kỳ. " + _B),
    "GET /api/v1/subscription/invoices/{invoice_id}": ("Chi tiết hóa đơn / trạng thái", "Trang thanh toán thành công gọi lặp endpoint này đến khi hết `pending` (MSG29). " + _B),
    "GET /api/v1/subscription/invoices/{invoice_id}/receipt": ("Tải biên nhận PDF", "Trả URL có chữ ký 15 phút tới biên nhận KUS-xxx bất biến; chưa phát hành trả 409. " + _B),
    "POST /api/v1/subscription/coupon/preview": ("Xem trước mã giảm giá", "Tính giá sau giảm cho một gói mà không tạo hóa đơn; mỗi tài khoản dùng một mã một lần. " + _B),
    # ---- Webhooks ----
    "POST /api/v1/webhooks/payos": ("Webhook PayOS", "Xác thực chữ ký HMAC-SHA256, khớp số tiền, idempotent. Không dùng Bearer. " + _P),
    "POST /api/v1/webhooks/momo": ("Webhook (IPN) MoMo", "Xác thực chữ ký HMAC-SHA256, khớp số tiền, idempotent. Không dùng Bearer. " + _P),
    # ---- Health / Monitoring ----
    "GET /health": ("Kiểm tra sống", "Luôn trả `ok` nếu tiến trình chạy. " + _P),
    "GET /health/ready": ("Kiểm tra sẵn sàng", "Kiểm tra kết nối DB, Redis và lưu trữ; `status` là `degraded` nếu một mục lỗi. " + _P),
    "GET /metrics": ("Metrics Prometheus", "Số request, độ trễ theo route. " + _P),
    # ---- BR-94 / UC-27 Credit (Track A) ----
    "GET /api/v1/subscription/credits": ("Số dư Credit quét", "Số Credit còn dùng được, đã dùng, đã hết hạn, số đã mua trong chu kỳ hiện tại, trần 3 Credit/chu kỳ và đơn giá 49.000đ (BR-94). " + _B),
    "GET /api/v1/subscription/credits/ledger": ("Sổ Credit quét", "Lịch sử từng Credit: ngày mua, hóa đơn, hạn dùng 12 tháng, trạng thái (còn dùng / đã dùng / hết hạn). Credit đã dùng không hoàn (BR-94). " + _B),
    "POST /api/v1/subscription/credits/checkout": ("Mua Credit quét", "Tạo hóa đơn PENDING cho 1–3 Credit và trả link thanh toán PayOS/MoMo. Chỉ mua được khi gói Basic/Pro đang ACTIVE; vượt 3 Credit trong chu kỳ trả `CREDIT_CYCLE_LIMIT` (MSG51) (BR-94, UC-27). " + _B),
    "GET /api/v1/admin/billing/tax-config": ("Cấu hình thuế VAT", "Trạng thái bật/tắt dòng VAT và thuế suất. Khi bật, VAT được tách ra từ giá niêm yết, không cộng thêm (BR-28). " + _A),
    "POST /api/v1/internal/scan-quota/consume": ("Trừ một lượt quét", "Trừ theo thứ tự: lượt của gói trước, Credit sau (BR-23). Hết cả hai trả `SCAN_QUOTA_EXHAUSTED` (MSG28). " + _S),
    "GET /api/v1/internal/scan-quota/{user_id}": ("Số lượt quét còn lại", "Lượt quét còn lại của gói trong chu kỳ và số Credit còn hiệu lực. " + _S),
    # ---- BR-65 watermark (Track B) ----
    "GET /api/v1/projects/{project_id}/preview-image": ("Ảnh render của dự án", "Trả ảnh PNG render của dự án. Tài khoản Free luôn nhận ảnh có watermark và cạnh dài ≤1080px (BR-65, BR-67); gói trả phí nhận ảnh gốc. " + _B),
    "GET /api/v1/projects/{project_id}/watermark-policy": ("Quy tắc watermark của dự án", "Cho biết bản render của dự án này có bắt buộc watermark hay không, kèm nội dung và kích thước tối đa, để trình chỉnh sửa áp dụng đúng (BR-65). " + _B),
    # ---- BR-20 data import (Track B) ----
    "POST /api/v1/users/me/data-import/upload-url": ("Xin link tải tệp sao lưu lên", "Trả presigned URL để tải tệp .zip sao lưu do KusShoes xuất lên, kèm `import_id` để xác nhận (BR-20). " + _B),
    "POST /api/v1/users/me/data-import/{import_id}/confirm": ("Xác nhận nhập dữ liệu", "Kiểm tra checksum/chữ ký của tệp sao lưu, tạo BẢN SAO MỚI (không ghi đè) và tính vào hạn mức dự án (BR-20, BR-46). Tệp sai hoặc vượt hạn mức trả `DATA_IMPORT_INVALID` (MSG08). " + _B),
    "GET /api/v1/users/me/data-imports": ("Lịch sử nhập dữ liệu", "Các lần nhập tệp sao lưu: thời điểm, trạng thái, số dự án đã tạo, lý do từ chối. " + _B),
    # ---- BR-77 / UC-24 moderation (Track C) ----
    "POST /api/v1/public/content-reports": ("Báo cáo vi phạm nội dung", "Chủ sở hữu quyền gửi khiếu nại bản quyền/nhãn hiệu về một thiết kế hoặc template, không cần đăng nhập. Giới hạn tần suất theo IP (BR-77, UC-24). " + _P),
    "GET /api/v1/moderation/me": ("Tình trạng vi phạm của tôi", "Mức xử lý hiện tại (cảnh cáo / hạn chế chia sẻ công khai / khoá) và thời điểm hết hạn chế (BR-77). " + _B),
    "GET /api/v1/admin/content-reports": ("Danh sách báo cáo vi phạm", "Hàng đợi khiếu nại bản quyền, lọc theo trạng thái, phân trang bằng con trỏ (UC-24). " + _A),
    "GET /api/v1/admin/content-reports/{report_id}": ("Chi tiết báo cáo vi phạm", "Nội dung khiếu nại, đối tượng bị báo cáo và lịch sử xử lý của tài khoản đó (UC-24, BR-78). " + _A),
    "POST /api/v1/admin/content-reports/{report_id}/uphold": ("Chấp nhận báo cáo vi phạm", "Áp mức xử lý kế tiếp theo BR-77: lần 1 cảnh cáo, lần 2 hạn chế chia sẻ công khai 30 ngày, lần 3 khoá tài khoản. Ghi AUDIT_LOG. " + _AW),
    "POST /api/v1/admin/content-reports/{report_id}/dismiss": ("Từ chối báo cáo vi phạm", "Đóng khiếu nại, không áp mức xử lý nào và không tăng bậc vi phạm. Ghi AUDIT_LOG. " + _AW),
    "GET /api/v1/admin/users/{user_id}/moderation-actions": ("Lịch sử xử lý vi phạm", "Các mức xử lý đã áp cho tài khoản theo BR-77, kèm lý do và người thực hiện. " + _A),
    # ---- SF-14 / BR-108 API cost (Track C) ----
    "POST /api/v1/internal/api-cost/calls": ("Ghi chi phí một lần gọi API", "Ghi chi phí mọi lần gọi API 3D/AI theo user và theo ngày, kể cả lần thất bại (SF-14). Vượt 80% ngân sách tháng sẽ cảnh báo Admin, vượt 100% sẽ tạm ngưng nhận Scan Job. " + _S),
    "GET /api/v1/internal/api-cost/scan-intake": ("Kiểm tra có nhận Scan Job không", "Trả `accepted=false` kèm MSG43 khi ngân sách tháng đã dùng hết 100%, hoặc khi tài khoản nội bộ đã dùng hết trần 10 lượt quét của kỳ (SF-14, BR-79, BR-83). " + _S),
    "GET /api/v1/admin/api-cost/daily": ("Chi phí API theo ngày", "Tổng chi phí, số lần gọi thành công/thất bại theo từng ngày (GMT+7) trong khoảng thời gian chọn (SF-14, BR-108). " + _A),
    "GET /api/v1/admin/api-cost/budget": ("Ngân sách API tháng", "Ngân sách đã đặt, số đã chi, phần trăm và trạng thái (`unconfigured` / `ok` / `warning` / `suspended`) (SF-14). " + _A),
    "PUT /api/v1/admin/api-cost/budget": ("Đặt ngân sách API tháng", "Đặt hoặc cập nhật ngân sách của một tháng; ngưỡng cảnh báo 80% và tạm ngưng 100% tính trên số này. Ghi AUDIT_LOG (SF-14). " + _AW),
}


def _add_error_docs(spec: dict) -> None:
    schemas = spec.setdefault("components", {}).setdefault("schemas", {})
    schemas["ErrorResponse"] = {
        "type": "object",
        "title": "ErrorResponse",
        "required": ["code", "message"],
        "properties": {
            "code": {"type": "string", "description": "Mã lỗi ổn định để frontend xử lý", "examples": ["PROJ_BAKE_IN_PROGRESS"]},
            "message": {"type": "string", "description": "Thông báo hiển thị cho người dùng (tiếng Việt)"},
        },
        "additionalProperties": True,
    }
    ref = {"application/json": {"schema": {"$ref": "#/components/schemas/ErrorResponse"}}}
    for item in spec["paths"].values():
        for op in item.values():
            responses = op.setdefault("responses", {})
            if op.get("security"):
                responses.setdefault("401", {"description": "Chưa đăng nhập hoặc token hết hạn/không hợp lệ", "content": ref})
                responses.setdefault("403", {"description": "Không đủ quyền (không phải chủ sở hữu, role không phù hợp, bị khóa…)", "content": ref})
            if any(p.get("in") == "path" for p in op.get("parameters", [])):
                responses.setdefault("404", {"description": "Không tìm thấy tài nguyên", "content": ref})


def install(app: FastAPI) -> None:
    """Replace app.openapi with a version that applies the descriptions above."""

    def custom_openapi() -> dict:
        if app.openapi_schema:
            return app.openapi_schema
        spec = get_openapi(
            title=app.title,
            version=app.version,
            description=API_DESCRIPTION,
            routes=app.routes,
            tags=TAGS,
        )
        for path, item in spec["paths"].items():
            for method, op in item.items():
                entry = DOCS.get(f"{method.upper()} {path}")
                if entry:
                    op["summary"], op["description"] = entry
        _add_error_docs(spec)
        app.openapi_schema = spec
        return spec

    app.openapi = custom_openapi
