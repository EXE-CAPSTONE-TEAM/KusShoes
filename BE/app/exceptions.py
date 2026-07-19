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
        super().__init__(410, "PROJ_RESTORE_EXPIRED", "Project đã quá thời hạn khôi phục 7 ngày")


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


# --- Subscription ---
class QuotaExportExceeded(AppException):
    def __init__(self):
        super().__init__(403, "QUOTA_EXPORT_EXCEEDED", "Bạn đã đạt giới hạn export trong tháng này")


class SubPlanNotFound(AppException):
    def __init__(self):
        super().__init__(404, "SUB_PLAN_NOT_FOUND", "Gói dịch vụ không tồn tại")


class SubPlanNotMappedToPolar(AppException):
    def __init__(self):
        super().__init__(
            502, "SUB_PLAN_GATEWAY_UNAVAILABLE", "Gói dịch vụ chưa được cấu hình thanh toán"
        )


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


class SubNoPolarCustomer(AppException):
    def __init__(self):
        super().__init__(
            404,
            "SUB_NO_POLAR_CUSTOMER",
            "Bạn chưa từng thanh toán, chưa có tài khoản trên cổng thanh toán",
        )


class InvoiceNotRefundable(AppException):
    def __init__(self):
        super().__init__(409, "INVOICE_NOT_REFUNDABLE", "Hóa đơn không thể hoàn tiền")


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
