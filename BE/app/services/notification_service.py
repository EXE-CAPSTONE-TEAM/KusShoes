from app.infrastructure import email_sender


def send_verification_email(user_email: str, otp_code: str) -> None:
    email_sender.send_otp_email(user_email, otp_code)


def send_payment_confirmation_email(
    user_email: str, plan_tier: str, amount_vnd: int, receipt_number: str | None = None
) -> None:
    email_sender.send_payment_confirmation_email(user_email, plan_tier, amount_vnd, receipt_number)


def send_password_reset_email(user_email: str, otp_code: str) -> None:
    email_sender.send_password_reset_email(user_email, otp_code)


def send_renewal_reminder_email(user_email: str, days_before: int) -> None:
    email_sender.send_renewal_reminder_email(user_email, days_before)


def send_grace_period_email(user_email: str) -> None:
    email_sender.send_grace_period_email(user_email)


def send_new_device_login_email(
    user_email: str, *, ip_address: str | None, user_agent: str | None
) -> None:
    email_sender.send_new_device_login_email(
        user_email, ip_address=ip_address, user_agent=user_agent
    )


def send_account_locked_email(user_email: str) -> None:
    email_sender.send_account_locked_email(user_email)


def send_account_restore_email(user_email: str, otp_code: str) -> None:
    email_sender.send_account_restore_email(user_email, otp_code)


def send_impersonation_notice_email(user_email: str, reason: str) -> None:
    email_sender.send_impersonation_notice_email(user_email, reason)
