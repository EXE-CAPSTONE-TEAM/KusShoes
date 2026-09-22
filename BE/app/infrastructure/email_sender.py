import smtplib
from email.mime.text import MIMEText

from app.config import settings


def _send(user_email: str, subject: str, body: str) -> None:
    message = MIMEText(body, "plain", "utf-8")
    message["Subject"] = subject
    message["From"] = settings.EMAIL_FROM
    message["To"] = user_email

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.ehlo()
        server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_PASS)
        server.sendmail(settings.EMAIL_FROM, [user_email], message.as_string())


def send_otp_email(user_email: str, otp_code: str) -> None:
    _send(
        user_email,
        "Mã xác minh KusShoes của bạn",
        f"Xin chào,\n\nMã xác minh KusShoes của bạn là: {otp_code}\n\n"
        "Mã này sẽ hết hạn sau 15 phút.\n\n"
        "Nếu bạn không đăng ký tài khoản KusShoes, vui lòng bỏ qua email này.",
    )


def send_payment_confirmation_email(
    user_email: str, plan_tier: str, amount_vnd: int, receipt_number: str | None = None
) -> None:
    _send(
        user_email,
        "Xác nhận thanh toán KusShoes",
        f"Xin chào,\n\nThanh toán của bạn cho gói {plan_tier} đã thành công.\n"
        f"Số tiền: {amount_vnd:,} VND\n"
        + (f"Biên nhận: {receipt_number} (tải trong mục Billing)\n" if receipt_number else "")
        + "\n"
        "Cảm ơn bạn đã sử dụng dịch vụ của KusShoes.",
    )


def send_password_reset_email(user_email: str, otp_code: str) -> None:
    _send(
        user_email,
        "Khôi phục mật khẩu KusShoes",
        f"Xin chào,\n\nMã khôi phục mật khẩu KusShoes của bạn là: {otp_code}\n\n"
        "Mã này sẽ hết hạn sau 15 phút. Nếu bạn không yêu cầu đổi mật khẩu, "
        "hãy bỏ qua email này.",
    )


def send_renewal_reminder_email(user_email: str, days_before: int) -> None:
    _send(
        user_email,
        "Gói KusShoes của bạn sắp hết hạn",
        f"Xin chào,\n\nGói dịch vụ của bạn sẽ hết hạn trong {days_before} ngày nữa.\n"
        "Hệ thống không tự động trừ tiền gia hạn — vui lòng vào Billing để gia hạn thủ công "
        "nếu bạn muốn tiếp tục sử dụng đầy đủ tính năng.\n\n"
        "Cảm ơn bạn đã sử dụng dịch vụ của KusShoes.",
    )


def send_new_device_login_email(user_email: str, *, ip_address: str | None, user_agent: str | None) -> None:
    _send(
        user_email,
        "Đăng nhập từ thiết bị mới — KusShoes",
        "Xin chào,\n\nTài khoản của bạn vừa đăng nhập từ một thiết bị/trình duyệt mới.\n"
        f"IP: {ip_address or 'không xác định'}\nThiết bị: {user_agent or 'không xác định'}\n\n"
        "Nếu đây là bạn, không cần làm gì thêm. Nếu không phải bạn, hãy đổi mật khẩu ngay "
        "và thu hồi các phiên đăng nhập trong Cài đặt → Thiết bị.",
    )


def send_account_locked_email(user_email: str) -> None:
    _send(
        user_email,
        "Cảnh báo bảo mật — Tài khoản KusShoes tạm khóa",
        "Xin chào,\n\nTài khoản của bạn vừa bị khóa đăng nhập tạm thời trong 15 phút do có "
        "5 lần đăng nhập sai mật khẩu liên tiếp.\n\n"
        "Nếu không phải bạn, hãy đổi mật khẩu ngay khi tài khoản được mở khóa.",
    )


def send_grace_period_email(user_email: str) -> None:
    _send(
        user_email,
        "Gói KusShoes của bạn đã hết hạn — còn 3 ngày ân hạn",
        "Xin chào,\n\nGói dịch vụ của bạn đã hết hạn. Bạn vẫn xem/chỉnh sửa/lưu được thiết kế "
        "trong 3 ngày ân hạn, nhưng không thể quét/xuất file trong thời gian này.\n"
        "Sau 3 ngày, tài khoản sẽ chuyển về gói Free và một số dự án có thể chuyển sang "
        "chế độ chỉ xem nếu vượt hạn mức.\n\n"
        "Vui lòng gia hạn trong Billing để giữ nguyên quyền lợi.",
    )


def send_account_restore_email(user_email: str, otp_code: str) -> None:
    _send(
        user_email,
        "Khôi phục tài khoản KusShoes",
        f"Xin chào,\n\nMã khôi phục tài khoản KusShoes của bạn là: {otp_code}\n\n"
        "Mã này sẽ hết hạn sau 15 phút. Nếu bạn không yêu cầu khôi phục, hãy bỏ qua email này.",
    )


def send_impersonation_notice_email(user_email: str, reason: str) -> None:
    _send(
        user_email,
        "Đội ngũ KusShoes đã truy cập tài khoản của bạn",
        "Xin chào,\n\nMột quản trị viên KusShoes vừa truy cập tài khoản của bạn để hỗ trợ "
        f"(lý do: {reason}). Phiên đã kết thúc.\n\nNếu bạn không yêu cầu hỗ trợ, "
        "vui lòng đổi mật khẩu và liên hệ chúng tôi.",
    )


def send_api_budget_alert_email(
    user_email: str, period_month: str, spent_vnd: int, budget_vnd: int, warn_percent: int
) -> None:
    """SF-14 (SRS_v2.2.txt:1767): the month's 3D/AI API spend reached the warn threshold."""
    _send(
        user_email,
        f"[KusShoes] Chi phí API tháng {period_month} đã đạt {warn_percent}% ngân sách",
        "Xin chào Admin,\n\n"
        f"Chi phí API 3D/AI của tháng bắt đầu {period_month} đã đạt {spent_vnd:,}đ "
        f"trên ngân sách {budget_vnd:,}đ (ngưỡng cảnh báo {warn_percent}%).\n\n"
        "Khi chạm ngưỡng tạm ngưng, hệ thống sẽ ngừng nhận Scan Job mới; lượt quét của khách "
        "được giữ nguyên và thiết kế trên phôi vẫn hoạt động.",
    )
