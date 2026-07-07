from app.infrastructure import email_sender


def send_verification_email(user_email: str, otp_code: str) -> None:
    email_sender.send_otp_email(user_email, otp_code)


def send_payment_confirmation_email(user_email: str, plan_tier: str, amount_vnd: int) -> None:
    email_sender.send_payment_confirmation_email(user_email, plan_tier, amount_vnd)


def send_password_reset_email(user_email: str, otp_code: str) -> None:
    email_sender.send_password_reset_email(user_email, otp_code)
