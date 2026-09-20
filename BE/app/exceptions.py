from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


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


# --- Auth ---
class AuthTokenInvalid(AppException):
    def __init__(self):
        super().__init__(401, "AUTH_TOKEN_INVALID", "Token không hợp lệ hoặc đã hết hạn")


class AuthTokenExpired(AppException):
    def __init__(self):
        super().__init__(401, "AUTH_TOKEN_EXPIRED", "Token đã hết hạn")


class AuthRefreshInvalid(AppException):
    def __init__(self):
        super().__init__(401, "AUTH_REFRESH_INVALID", "Refresh token không hợp lệ hoặc đã được dùng")


class AuthUserSuspended(AppException):
    def __init__(self):
        super().__init__(403, "AUTH_USER_SUSPENDED", "Tài khoản đã bị khóa")


class AuthRoleForbidden(AppException):
    def __init__(self):
        super().__init__(403, "AUTH_ROLE_FORBIDDEN", "Bạn không có quyền truy cập tài nguyên này")


class AuthSSOInvalid(AppException):
    def __init__(self):
        super().__init__(401, "AUTH_SSO_INVALID", "SSO token không hợp lệ hoặc đã được dùng")


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
            400, "OTP_EXPIRED", "Mã xác minh đã hết hạn. Vui lòng đăng ký lại hoặc yêu cầu gửi lại mã."
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
        super().__init__(403, "PROJ_QUOTA_EXCEEDED", "Bạn đã đạt giới hạn số project theo gói dịch vụ")


class ProjectBakeInProgress(AppException):
    def __init__(self):
        super().__init__(409, "PROJ_BAKE_IN_PROGRESS", "Đang có bake job đang xử lý, vui lòng chờ")


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
        super().__init__(502, "SUB_PAYMENT_GATEWAY_ERROR", "Lỗi khi kết nối cổng thanh toán, vui lòng thử lại")


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
        super().__init__(403, "ADMIN_FORBIDDEN", "Chỉ quản trị viên mới có quyền thực hiện thao tác này")


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
        super().__init__(409, "BAKE_JOB_NOT_REQUEUEABLE", "Chỉ có thể chạy lại bake job đã thất bại")


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
