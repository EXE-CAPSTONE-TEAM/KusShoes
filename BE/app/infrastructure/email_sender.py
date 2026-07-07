import smtplib
from email.mime.text import MIMEText

from app.config import settings


def send_otp_email(user_email: str, otp_code: str) -> None:
    body = (
        f"Xin chào,\n\nMã xác minh KusShoes của bạn là: {otp_code}\n\n"
        "Mã này sẽ hết hạn sau 15 phút.\n\n"
        "Nếu bạn không đăng ký tài khoản KusShoes, vui lòng bỏ qua email này."
    )
    message = MIMEText(body, "plain", "utf-8")
    message["Subject"] = "Mã xác minh KusShoes của bạn"
    message["From"] = settings.EMAIL_FROM
    message["To"] = user_email

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.ehlo()
        server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_PASS)
        server.sendmail(settings.EMAIL_FROM, [user_email], message.as_string())


def send_payment_confirmation_email(user_email: str, plan_tier: str, amount_vnd: int) -> None:
    body = (
        f"Xin chào,\n\nThanh toán của bạn cho gói {plan_tier} đã thành công.\n"
        f"Số tiền: {amount_vnd:,} VND\n\n"
        "Cảm ơn bạn đã sử dụng dịch vụ của KusShoes."
    )
    message = MIMEText(body, "plain", "utf-8")
    message["Subject"] = "Xác nhận thanh toán KusShoes"
    message["From"] = settings.EMAIL_FROM
    message["To"] = user_email

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.ehlo()
        server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_PASS)
        server.sendmail(settings.EMAIL_FROM, [user_email], message.as_string())


def send_password_reset_email(user_email: str, otp_code: str) -> None:
    body = (
        f"Xin chào,\n\nMã khôi phục mật khẩu KusShoes của bạn là: {otp_code}\n\n"
        "Mã này sẽ hết hạn sau 15 phút. Nếu bạn không yêu cầu đổi mật khẩu, "
        "hãy bỏ qua email này."
    )
    message = MIMEText(body, "plain", "utf-8")
    message["Subject"] = "Khôi phục mật khẩu KusShoes"
    message["From"] = settings.EMAIL_FROM
    message["To"] = user_email

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.ehlo()
        server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_PASS)
        server.sendmail(settings.EMAIL_FROM, [user_email], message.as_string())
