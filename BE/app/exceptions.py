from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.config import settings


class AppException(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        extra: dict | None = None,
        headers: dict[str, str] | None = None,
    ):
        self.status_code = status_code
        self.code = code
        self.message = message
        self.extra = extra or {}
        self.headers = headers or {}


def _vnd(amount: int) -> str:
    """Format VND the way the SRS copy writes it: 49000 -> "49.000đ"."""
    return f"{amount:,}".replace(",", ".") + "đ"


def _reset_day(resets_at: str | None) -> str:
    """MSG28's {ngày reset}: the business date (GMT+7, CR-01) the scan quota renews."""
    if not resets_at:
        return "ngày reset"
    from datetime import datetime

    from app.services.period_service import GMT7  # lazy: period_service imports this module

    return datetime.fromisoformat(resets_at).astimezone(GMT7).strftime("%d/%m/%Y")


# --- Auth ---
class AuthTokenInvalid(AppException):
    def __init__(self):
        super().__init__(401, "AUTH_TOKEN_INVALID", "Token không hợp lệ hoặc đã hết hạn")


class AuthTokenExpired(AppException):
    def __init__(self):
        super().__init__(401, "AUTH_TOKEN_EXPIRED", "Token đã hết hạn")


class AuthRefreshInvalid(AppException):
    def __init__(self):
        super().__init__(
            401, "AUTH_REFRESH_INVALID", "Refresh token không hợp lệ hoặc đã được dùng"
        )


class AuthUserSuspended(AppException):
    def __init__(self):
        super().__init__(403, "AUTH_USER_SUSPENDED", "Tài khoản đã bị khóa")


class AuthRoleForbidden(AppException):
    def __init__(self):
        super().__init__(403, "AUTH_ROLE_FORBIDDEN", "Bạn không có quyền truy cập tài nguyên này")


class AuthSSOInvalid(AppException):
    def __init__(self):
        super().__init__(401, "AUTH_SSO_INVALID", "SSO token không hợp lệ hoặc đã được dùng")


class AuthEditorLaunchInvalid(AppException):
    def __init__(self):
        super().__init__(
            401, "AUTH_EDITOR_LAUNCH_INVALID", "Phiên mở editor không hợp lệ hoặc đã được dùng"
        )


class AuthGoogleFailed(AppException):
    def __init__(self):
        super().__init__(400, "AUTH_GOOGLE_FAILED", "Đăng nhập Google thất bại")


class EmailAlreadyTaken(AppException):
    def __init__(self):
        super().__init__(409, "AUTH_EMAIL_TAKEN", "Email này đã được sử dụng")


class UsernameAlreadyTaken(AppException):
    def __init__(self):
        super().__init__(409, "AUTH_USERNAME_TAKEN", "Tên đăng nhập này đã được sử dụng")


class OTPExpired(AppException):
    def __init__(self):
        super().__init__(
            400,
            "OTP_EXPIRED",
            "Mã xác minh đã hết hạn. Vui lòng đăng ký lại hoặc yêu cầu gửi lại mã.",
        )


class OTPInvalid(AppException):
    def __init__(self, remaining: int):
        super().__init__(400, "OTP_INVALID", f"Mã xác minh không đúng. Còn {remaining} lần thử.")


class OTPLocked(AppException):
    def __init__(self, remaining_minutes: int | None = None):
        if remaining_minutes is not None:
            msg = f"Tài khoản tạm thời bị khóa. Vui lòng thử lại sau {remaining_minutes} phút."
        else:
            msg = "Quá nhiều lần thử sai. Vui lòng thử lại sau 1 giờ."
        super().__init__(429, "OTP_LOCKED", msg)


class OTPResendLimit(AppException):
    def __init__(self):
        super().__init__(
            429, "OTP_RESEND_LIMIT", "Đã đạt giới hạn gửi lại mã (2 lần). Vui lòng đăng ký lại."
        )


class OTPResendCooldown(AppException):
    def __init__(self, remaining_seconds: int):
        super().__init__(
            429, "OTP_RESEND_COOLDOWN", f"Vui lòng đợi {remaining_seconds}s trước khi gửi lại."
        )


class InvalidCredentials(AppException):
    def __init__(self):
        super().__init__(401, "AUTH_INVALID_CREDENTIALS", "Email hoặc mật khẩu không đúng")


class GoogleOnlyAccount(AppException):
    def __init__(self):
        super().__init__(400, "AUTH_GOOGLE_ONLY", "Tài khoản này chỉ đăng nhập qua Google")


class EmailNotVerified(AppException):
    def __init__(self, user_id: str):
        super().__init__(
            403,
            "AUTH_EMAIL_NOT_VERIFIED",
            "Tài khoản chưa được xác minh. Vui lòng xác minh email trước khi đăng nhập.",
            extra={"user_id": user_id},
        )


class OAuthStateMismatch(AppException):
    def __init__(self):
        super().__init__(400, "AUTH_OAUTH_STATE_INVALID", "State không hợp lệ. Vui lòng thử lại.")


class OAuthFailed(AppException):
    def __init__(self):
        super().__init__(502, "AUTH_OAUTH_FAILED", "Đăng nhập Google thất bại. Vui lòng thử lại.")


class GoogleNoEmail(AppException):
    def __init__(self):
        super().__init__(400, "AUTH_GOOGLE_NO_EMAIL", "Không thể lấy email từ tài khoản Google")


class AuthReauthenticationRequired(AppException):
    def __init__(self):
        super().__init__(401, "AUTH_REAUTH_REQUIRED", "Cần xác thực lại để thực hiện thao tác này")


class AuthPasswordInvalid(AppException):
    def __init__(self):
        super().__init__(400, "AUTH_PASSWORD_INVALID", "Mật khẩu hiện tại không đúng")


class AuthRateLimited(AppException):
    def __init__(self, retry_after: int):
        super().__init__(
            429,
            "AUTH_RATE_LIMITED",
            "Quá nhiều yêu cầu. Vui lòng thử lại sau.",
            extra={"retry_after": retry_after},
            headers={"Retry-After": str(retry_after)},
        )


class PasswordResetInvalid(AppException):
    def __init__(self):
        super().__init__(400, "AUTH_RESET_INVALID", "Mã khôi phục không hợp lệ hoặc đã hết hạn")


class PasswordResetLocked(AppException):
    def __init__(self):
        super().__init__(
            429,
            "AUTH_RESET_LOCKED",
            "Quá nhiều lần thử sai. Vui lòng yêu cầu mã mới.",
        )


class AuthSessionNotFound(AppException):
    def __init__(self):
        super().__init__(404, "AUTH_SESSION_NOT_FOUND", "Phiên đăng nhập không tồn tại")


class ProfileInvalid(AppException):
    def __init__(self, message: str):
        super().__init__(422, "PROFILE_INVALID", message)


class AccountBanned(AppException):
    def __init__(self):
        super().__init__(
            403, "AUTH_ACCOUNT_BANNED", "Tài khoản bị vô hiệu hóa. Vui lòng liên hệ quản trị viên."
        )


class AuthAccountLocked(AppException):
    def __init__(self, retry_after: int):
        super().__init__(
            429,
            "AUTH_ACCOUNT_LOCKED",
            "Sai mật khẩu quá 5 lần. Tài khoản tạm khóa 15 phút.",
            extra={"retry_after": retry_after},
            headers={"Retry-After": str(retry_after)},
        )


class AuthTwoFactorChallengeInvalid(AppException):
    def __init__(self):
        super().__init__(
            401, "AUTH_2FA_CHALLENGE_INVALID", "Phiên xác thực 2 lớp không hợp lệ hoặc đã hết hạn"
        )


class AuthTwoFactorCodeInvalid(AppException):
    def __init__(self):
        super().__init__(400, "AUTH_2FA_CODE_INVALID", "Mã xác thực 2 lớp không đúng")


class AuthTwoFactorAlreadyEnabled(AppException):
    def __init__(self):
        super().__init__(409, "AUTH_2FA_ALREADY_ENABLED", "Xác thực 2 lớp đã được bật")


class AuthTwoFactorNotEnabled(AppException):
    def __init__(self):
        super().__init__(409, "AUTH_2FA_NOT_ENABLED", "Xác thực 2 lớp chưa được bật")


class AuthTwoFactorRecoveryEmailRequired(AppException):
    def __init__(self):
        super().__init__(
            422,
            "AUTH_2FA_RECOVERY_EMAIL_REQUIRED",
            "Cần xác thực email khôi phục trước khi bật xác thực 2 lớp qua Email",
        )


class UsernameChangeCooldown(AppException):
    def __init__(self, days_remaining: int):
        super().__init__(
            429,
            "USERNAME_CHANGE_COOLDOWN",
            f"Bạn chỉ có thể đổi tên đăng nhập 1 lần/30 ngày. Còn {days_remaining} ngày.",
        )


class UsernameReserved(AppException):
    def __init__(self):
        super().__init__(409, "USERNAME_RESERVED", "Tên đăng nhập này không thể sử dụng")


class ActionRequiresVerifiedEmail(AppException):
    def __init__(self):
        super().__init__(
            403,
            "EMAIL_VERIFICATION_REQUIRED",
            "Vui lòng xác minh email trước khi thực hiện thao tác này",
        )


class ConsentNotFound(AppException):
    def __init__(self):
        super().__init__(404, "CONSENT_NOT_FOUND", "Không tìm thấy bản ghi đồng ý")


# --- Projects ---
class ProjectNotFound(AppException):
    def __init__(self):
        super().__init__(404, "PROJ_NOT_FOUND", "Project không tồn tại hoặc đã bị xóa")


class ProjectAccessDenied(AppException):
    def __init__(self):
        super().__init__(403, "PROJ_ACCESS_DENIED", "Bạn không có quyền truy cập project này")


class ProjectQuotaExceeded(AppException):
    def __init__(self):
        super().__init__(
            403, "PROJ_QUOTA_EXCEEDED", "Bạn đã đạt giới hạn số project theo gói dịch vụ"
        )


class ProjectBakeInProgress(AppException):
    def __init__(self):
        super().__init__(409, "PROJ_BAKE_IN_PROGRESS", "Đang có bake job đang xử lý, vui lòng chờ")


class DesignRevisionConflict(AppException):
    def __init__(self, project):
        super().__init__(
            409,
            "DESIGN_REVISION_CONFLICT",
            "Thiết kế đã được cập nhật ở nơi khác. Vui lòng tải lại phiên bản mới nhất.",
            extra={
                "current_revision": project.current_design_revision,
                "current_design_config": project.design_config,
                "current_updated_at": project.updated_at.isoformat(),
            },
        )


class ProjectCursorInvalid(AppException):
    def __init__(self):
        super().__init__(422, "PROJ_CURSOR_INVALID", "Cursor không hợp lệ")


class ProjectTrashNotFound(AppException):
    def __init__(self):
        super().__init__(404, "PROJ_TRASH_NOT_FOUND", "Project không tồn tại trong thùng rác")


class ProjectRestoreExpired(AppException):
    def __init__(self):
        super().__init__(410, "PROJ_RESTORE_EXPIRED", "Project đã quá thời hạn khôi phục 30 ngày")


class BakeJobNotFound(AppException):
    def __init__(self):
        super().__init__(404, "BAKE_JOB_NOT_FOUND", "Bake job không tồn tại")


class ExportNotFound(AppException):
    def __init__(self):
        super().__init__(404, "EXPORT_NOT_FOUND", "File export không tồn tại")


class ExportCursorInvalid(AppException):
    def __init__(self):
        super().__init__(422, "EXPORT_CURSOR_INVALID", "Cursor export không hợp lệ")


class AssetNotFound(AppException):
    def __init__(self):
        super().__init__(404, "ASSET_NOT_FOUND", "Asset không tồn tại")


class AssetUploadInvalid(AppException):
    def __init__(self, message: str = "Thông tin upload asset không hợp lệ"):
        super().__init__(422, "ASSET_UPLOAD_INVALID", message)


class StorageFileNotFound(AppException):
    def __init__(self):
        super().__init__(422, "STORAGE_FILE_NOT_FOUND", "File chưa tồn tại trên storage")


class DesignLayerLimitExceeded(AppException):
    def __init__(self):
        super().__init__(
            403, "DESIGN_LAYER_LIMIT_EXCEEDED", "Đã đạt giới hạn số layer cho dự án này"
        )


class ProjectLocked(AppException):
    def __init__(self):
        super().__init__(
            403,
            "PROJECT_LOCKED",
            "Dự án đang ở chế độ chỉ xem do vượt hạn mức gói. Nâng cấp gói để mở khoá.",
        )


class SubGracePeriodExportBlocked(AppException):
    def __init__(self):
        super().__init__(
            403,
            "SUB_GRACE_EXPORT_BLOCKED",
            "Gói đã hết hạn, đang trong thời gian ân hạn — không thể xuất file. Vui lòng gia hạn.",
        )


class SubGracePeriodScanBlocked(AppException):
    # BR-90 (SRS_v2.2.txt:1582): GRACE keeps view/edit/save but "không quét". The SRS has no
    # MSG code for this refusal, so the copy mirrors SubGracePeriodExportBlocked.
    def __init__(self):
        super().__init__(
            403,
            "SUB_GRACE_SCAN_BLOCKED",
            "Gói đã hết hạn, đang trong thời gian ân hạn — không thể quét. Vui lòng gia hạn.",
        )


# --- Subscription ---
class QuotaExportExceeded(AppException):
    def __init__(self):
        super().__init__(403, "QUOTA_EXPORT_EXCEEDED", "Bạn đã đạt giới hạn export trong tháng này")


class SubPlanNotFound(AppException):
    def __init__(self):
        super().__init__(404, "SUB_PLAN_NOT_FOUND", "Gói dịch vụ không tồn tại")


class SubPlanNotSellable(AppException):
    def __init__(self):
        super().__init__(409, "SUB_PLAN_NOT_SELLABLE", "Gói dịch vụ này không thể thanh toán trực tiếp")


class SubInvalidGateway(AppException):
    def __init__(self):
        super().__init__(422, "SUB_INVALID_GATEWAY", "Phương thức thanh toán không hợp lệ")


class SubPaymentGatewayError(AppException):
    def __init__(self):
        super().__init__(
            502, "SUB_PAYMENT_GATEWAY_ERROR", "Lỗi khi kết nối cổng thanh toán, vui lòng thử lại"
        )


class SubAlreadyActive(AppException):
    def __init__(self):
        super().__init__(409, "SUB_ALREADY_ACTIVE", "Bạn đã đăng ký gói này")


class SubWebhookInvalidSignature(AppException):
    def __init__(self):
        super().__init__(400, "SUB_WEBHOOK_INVALID_SIG", "Chữ ký webhook không hợp lệ")


class SubNotFound(AppException):
    def __init__(self):
        super().__init__(404, "SUB_NOT_FOUND", "Bạn chưa có gói đăng ký trả phí nào")


class InvoiceNotFound(AppException):
    def __init__(self):
        super().__init__(404, "INVOICE_NOT_FOUND", "Không tìm thấy giao dịch")


class ReceiptUnavailable(AppException):
    def __init__(self):
        super().__init__(409, "RECEIPT_UNAVAILABLE", "Biên nhận chỉ có cho giao dịch đã thanh toán")


class CouponInvalid(AppException):
    def __init__(self):
        super().__init__(
            422,
            "COUPON_INVALID",
            "Mã không hợp lệ, đã hết hạn, đã dùng hoặc không áp dụng cho gói này.",
        )


class PeriodLocked(AppException):
    def __init__(self):
        super().__init__(
            409,
            "PERIOD_LOCKED",
            "Kỳ báo cáo này đã khoá sổ. Hãy tạo bút toán điều chỉnh ở kỳ đang mở.",
        )


class ReportingPeriodInvalid(AppException):
    def __init__(self, message: str = "Kỳ báo cáo không hợp lệ"):
        super().__init__(422, "REPORTING_PERIOD_INVALID", message)


class ManualPaymentInvalid(AppException):
    def __init__(self, message: str):
        super().__init__(422, "MANUAL_PAYMENT_INVALID", message)


class ManualPaymentSelfApproval(AppException):
    def __init__(self):
        super().__init__(
            403, "MANUAL_PAYMENT_SELF_APPROVAL", "Người tạo giao dịch không được tự duyệt"
        )


class InvoiceNotAwaitingApproval(AppException):
    def __init__(self):
        super().__init__(409, "INVOICE_NOT_AWAITING_APPROVAL", "Giao dịch không ở trạng thái chờ duyệt")


class RefundPolicyViolation(AppException):
    def __init__(self, reason: str):
        super().__init__(
            409,
            "REFUND_POLICY_VIOLATION",
            f"Không đủ điều kiện hoàn tiền tự động: {reason}. Dùng override để duyệt ngoại lệ.",
        )


class InvoiceNotRefundable(AppException):
    def __init__(self):
        super().__init__(409, "INVOICE_NOT_REFUNDABLE", "Hóa đơn không thể hoàn tiền")


class RefundInvalidAmount(AppException):
    def __init__(self):
        super().__init__(422, "REFUND_INVALID_AMOUNT", "Số tiền hoàn không hợp lệ")


# --- Admin ---
class AdminForbidden(AppException):
    def __init__(self):
        super().__init__(
            403, "ADMIN_FORBIDDEN", "Chỉ quản trị viên mới có quyền thực hiện thao tác này"
        )


class AdminUserNotFound(AppException):
    def __init__(self):
        super().__init__(404, "ADMIN_USER_NOT_FOUND", "Người dùng không tồn tại")


class AdminCannotModifyPrivileged(AppException):
    def __init__(self):
        super().__init__(
            400, "ADMIN_CANNOT_MODIFY_PRIVILEGED", "Không thể thao tác trên tài khoản quản trị"
        )


class PlanUpdateInvalid(AppException):
    def __init__(self, message: str = "Thông tin cập nhật gói không hợp lệ"):
        super().__init__(422, "PLAN_UPDATE_INVALID", message)


class BakeJobNotRequeueable(AppException):
    def __init__(self):
        super().__init__(
            409, "BAKE_JOB_NOT_REQUEUEABLE", "Chỉ có thể chạy lại bake job đã thất bại"
        )


class BakeJobNotCancellable(AppException):
    def __init__(self):
        super().__init__(409, "BAKE_JOB_NOT_CANCELLABLE", "Chỉ có thể hủy bake job đang chờ xử lý")


class AccountRestoreInvalid(AppException):
    def __init__(self):
        super().__init__(
            400, "AUTH_RESTORE_INVALID", "Mã khôi phục không hợp lệ hoặc tài khoản không thể khôi phục"
        )


class FeedbackNotFound(AppException):
    def __init__(self):
        super().__init__(404, "FEEDBACK_NOT_FOUND", "Không tìm thấy phản hồi")


class FeedbackTooSoon(AppException):
    def __init__(self, next_allowed_at):
        super().__init__(
            429,
            "FEEDBACK_TOO_SOON",
            "Bạn đã gửi phản hồi gần đây, vui lòng quay lại sau",
            extra={"next_allowed_at": next_allowed_at.isoformat()},
        )


class ImpersonationRequires2FA(AppException):
    def __init__(self):
        super().__init__(
            403,
            "IMPERSONATION_REQUIRES_2FA",
            "Chỉ Admin đã bật xác thực hai lớp mới được đăng nhập thay người dùng",
        )


class ImpersonationRestricted(AppException):
    def __init__(self):
        super().__init__(
            403,
            "IMPERSONATION_RESTRICTED",
            "Không thực hiện được trong phiên đăng nhập thay người dùng",
        )


class ImpersonationTargetInvalid(AppException):
    def __init__(self):
        super().__init__(
            400, "IMPERSONATION_TARGET_INVALID", "Chỉ có thể đăng nhập thay tài khoản người dùng"
        )


class AdminResetNotAllowed(AppException):
    def __init__(self):
        super().__init__(
            400,
            "ADMIN_RESET_NOT_ALLOWED",
            "Tài khoản này không dùng mật khẩu (đăng nhập Google) nên không đặt lại được",
        )


# --- Studio: versions, guardrail, templates, artisan links ---
class ProjectExporting(AppException):
    def __init__(self):
        super().__init__(
            409,
            "PROJECT_EXPORTING",
            "Dự án đang được xuất file, vui lòng chờ hoàn tất rồi chỉnh sửa tiếp",
        )


class ContentBanned(AppException):
    def __init__(self):
        super().__init__(
            422, "CONTENT_BANNED", "Nội dung chứa từ ngữ không được phép, vui lòng chỉnh lại"
        )


class ContentTrademarkUnconfirmed(AppException):
    def __init__(self, terms: list[str]):
        super().__init__(
            422,
            "CONTENT_TRADEMARK_CONFIRM_REQUIRED",
            "Nội dung có thể chứa thương hiệu được bảo hộ, cần xác nhận bản quyền để tiếp tục",
            extra={"terms": terms},
        )


class ContentTextTooLong(AppException):
    def __init__(self, max_length: int):
        super().__init__(
            422, "CONTENT_TEXT_TOO_LONG", f"Văn bản trên thiết kế tối đa {max_length} ký tự"
        )


class GuardrailRuleNotFound(AppException):
    def __init__(self):
        super().__init__(404, "GUARDRAIL_RULE_NOT_FOUND", "Không tìm thấy quy tắc")


class GuardrailRuleExists(AppException):
    def __init__(self):
        super().__init__(409, "GUARDRAIL_RULE_EXISTS", "Từ khóa này đã có trong danh sách")


class DesignVersionNotFound(AppException):
    def __init__(self):
        super().__init__(404, "DESIGN_VERSION_NOT_FOUND", "Không tìm thấy phiên bản thiết kế")


class TemplateNotFound(AppException):
    def __init__(self):
        super().__init__(404, "TEMPLATE_NOT_FOUND", "Không tìm thấy template")


class ArtisanLinkPlanRequired(AppException):
    def __init__(self):
        super().__init__(
            403,
            "ARTISAN_LINK_PLAN_REQUIRED",
            "Chia sẻ link cho nghệ nhân chỉ dành cho gói trả phí đang hoạt động",
        )


class ArtisanLinkNotFound(AppException):
    def __init__(self):
        super().__init__(404, "ARTISAN_LINK_NOT_FOUND", "Không tìm thấy link chia sẻ")


class ArtisanLinkInvalid(AppException):
    def __init__(self):
        super().__init__(
            410,
            "ARTISAN_LINK_INVALID",
            "Link không hợp lệ hoặc đã hết hạn. Vui lòng liên hệ chủ thiết kế để lấy link mới",
        )


class ExportNotReady(AppException):
    def __init__(self):
        super().__init__(409, "EXPORT_NOT_READY", "Dự án chưa có bản xuất nào để chia sẻ")


class MobileComputeUnavailable(AppException):
    def __init__(self):
        super().__init__(503, "MOBILE_COMPUTE_UNAVAILABLE", "Dịch vụ scan 3D chưa được cấu hình")


class MobileScanGrantInvalid(AppException):
    def __init__(self):
        super().__init__(
            401, "MOBILE_SCAN_GRANT_INVALID", "Quyền khởi tạo scan không hợp lệ hoặc đã hết hạn"
        )


class MobileScanCompletionInvalid(AppException):
    def __init__(self):
        super().__init__(
            401,
            "MOBILE_SCAN_COMPLETION_INVALID",
            "Quyền hoàn tất scan không hợp lệ hoặc đã hết hạn",
        )


class MobileScanPublishConflict(AppException):
    def __init__(self):
        super().__init__(
            409,
            "MOBILE_SCAN_PUBLISH_CONFLICT",
            "Một tiến trình publish khác đang xử lý project này",
        )


# --- BR-94 / BR-23: scan Credit (Track A) ---
class CreditRequiresPaidPlan(AppException):
    def __init__(self):
        super().__init__(
            403,
            "CREDIT_REQUIRES_PAID_PLAN",
            "Chỉ mua được Credit khi đang có gói Basic/Pro còn hiệu lực",
        )


class CreditCycleLimitExceeded(AppException):
    def __init__(self, purchased: int, limit: int):
        super().__init__(
            409,
            "CREDIT_CYCLE_LIMIT",
            f"Mỗi chu kỳ mua tối đa {limit} Credit quét.",  # MSG51 (SRS_v2.2.txt:2494)
            {"purchased": purchased, "limit": limit},
        )


class ScanQuotaExhausted(AppException):
    def __init__(self, resets_at: str | None = None):
        super().__init__(
            409,
            "SCAN_QUOTA_EXHAUSTED",
            "Bạn đã dùng hết lượt quét của chu kỳ. "
            f"Mua Credit ({_vnd(settings.CREDIT_PRICE_VND)}/lượt) "
            f"hoặc chờ đến {_reset_day(resets_at)}.",  # MSG28 (SRS_v2.2.txt:2356)
            {"resets_at": resets_at},
        )


# --- BR-20: data import (Track B) ---
class DataImportInvalid(AppException):
    def __init__(self, reason: str, extra: dict | None = None):
        super().__init__(
            400,
            "DATA_IMPORT_INVALID",
            "Tệp sao lưu không hợp lệ hoặc vượt hạn mức dự án của gói hiện tại.",  # MSG08 (:2236)
            {"reason": reason, **(extra or {})},
        )


class DataImportNotFound(AppException):
    def __init__(self):
        super().__init__(404, "DATA_IMPORT_NOT_FOUND", "Không tìm thấy phiên nhập dữ liệu")


# --- BR-65: watermark (Track B) ---
class RenderImageUnavailable(AppException):
    def __init__(self):
        super().__init__(
            409, "RENDER_IMAGE_UNAVAILABLE", "Dự án chưa có ảnh render để tải về"
        )


# --- BR-77 / UC-24: moderation (Track C) ---
class ContentReportNotFound(AppException):
    def __init__(self):
        super().__init__(404, "CONTENT_REPORT_NOT_FOUND", "Không tìm thấy báo cáo vi phạm")


class ContentReportAlreadyResolved(AppException):
    def __init__(self):
        super().__init__(409, "CONTENT_REPORT_RESOLVED", "Báo cáo này đã được xử lý")


class ContentReportTargetInvalid(AppException):
    def __init__(self):
        super().__init__(
            400,
            "CONTENT_REPORT_TARGET_INVALID",
            "Phải chỉ đúng một đối tượng bị báo cáo (dự án hoặc template) và đối tượng phải tồn tại",
        )


class ModerationTargetProtected(AppException):
    def __init__(self):
        super().__init__(
            403,
            "MODERATION_TARGET_PROTECTED",
            "Không áp dụng xử lý vi phạm cho tài khoản quản trị",
        )


class PublicSharingRestricted(AppException):
    def __init__(self, restricted_until: str):
        super().__init__(
            403,
            "PUBLIC_SHARING_RESTRICTED",
            "Tài khoản đang bị hạn chế chia sẻ công khai do vi phạm nội dung",
            {"restricted_until": restricted_until},
        )


# --- SF-14 / BR-79: API cost (Track C) ---
class ScanIntakeSuspended(AppException):
    def __init__(self, reason: str):
        super().__init__(
            503,
            "SCAN_INTAKE_SUSPENDED",
            "Hệ thống tạm ngưng nhận yêu cầu quét mới. "
            "Lượt quét của bạn được giữ nguyên; bạn vẫn có thể thiết kế trên phôi chuẩn.",  # MSG43
            {"reason": reason},
        )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
        content = {"code": exc.code, "message": exc.message, **exc.extra}
        return JSONResponse(status_code=exc.status_code, content=content, headers=exc.headers)

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        from loguru import logger

        logger.exception("Unhandled exception")
        return JSONResponse(
            status_code=500,
            content={"code": "INTERNAL_ERROR", "message": "Lỗi hệ thống, vui lòng thử lại sau"},
        )


# --- Client-executed 3D jobs (spec §A, prd §3) ---


class JobAlreadyClaimed(AppException):
    def __init__(self):
        super().__init__(409, "JOB_ALREADY_CLAIMED", "Job đang được xử lý trên một máy khác.")


class JobNotClaimable(AppException):
    def __init__(self):
        super().__init__(409, "JOB_NOT_CLAIMABLE", "Job này đã kết thúc. Vui lòng chạy lại.")


class JobClaimSuperseded(AppException):
    def __init__(self):
        super().__init__(409, "JOB_CLAIM_SUPERSEDED", "Job đã được chạy lại trên máy khác.")


class JobClaimMismatch(AppException):
    def __init__(self):
        super().__init__(403, "JOB_CLAIM_MISMATCH", "Phiên xử lý không hợp lệ.")


class JobOutputInvalid(AppException):
    def __init__(self, reason: str):
        super().__init__(
            422, "JOB_OUTPUT_INVALID", f"Kết quả tải lên không hợp lệ: {reason}"
        )


class EditorModelChanged(AppException):
    def __init__(self):
        super().__init__(409, "EDITOR_MODEL_CHANGED", "Model đã thay đổi. Vui lòng chạy lại.")
