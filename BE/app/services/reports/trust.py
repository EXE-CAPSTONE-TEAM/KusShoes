"""Reports hub domain `kiem-duyet-bao-mat` -- Kiểm duyệt & bảo mật: feedback, content-reports,
moderation-actions, audit-log (sensitive), login-history (sensitive).

BR-88: customers are identified by account_code; raw email appears only in the two sensitive,
admin-only reports. Free text (feedback, notes, payload, user agent) is untrusted: the renderer
neutralises formula injection, so nothing is escaped here."""

import json
from collections.abc import Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories import login_history_repo
from app.repositories.reports import trust as repo
from app.services.reports.registry import Column, ReportContext, ReportSpec, register

DOMAIN = "kiem-duyet-bao-mat"

FEEDBACK_STATUS = {
    "new": "Mới",
    "reviewed": "Đã xem",
    "planned": "Đã lên kế hoạch",
    "done": "Hoàn thành",
    "wont_do": "Không thực hiện",
}
MARKETING_GROUP = {
    "product": "Sản phẩm",
    "price": "Giá",
    "place": "Phân phối",
    "promotion": "Khuyến mãi",
}
REPORT_REASON = {
    "copyright": "Bản quyền",
    "trademark": "Nhãn hiệu",
    "inappropriate": "Không phù hợp",
    "other": "Khác",
}
REPORT_STATUS = {
    "new": "Mới",
    "reviewing": "Đang xem xét",
    "upheld": "Chấp nhận",
    "dismissed": "Bác bỏ",
}
MODERATION_ACTION = {
    "warning": "Cảnh cáo",
    "share_restriction": "Hạn chế chia sẻ công khai",
    "ban": "Khóa tài khoản",
}


def _label(mapping: dict[str, str], key: str | None) -> str:
    return mapping.get(key or "", key or "")


def json_payload(payload) -> str:
    """Stable single-line JSON (sorted keys, UTF-8 kept readable); None/empty -> empty cell."""
    if payload in (None, {}, []):
        return ""
    return json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str
    )


# --- feedback (BR-109) ----------------------------------------------------------------------


def shape_feedback(rows: Sequence[tuple], ctx: ReportContext) -> list[list]:
    """rows: (created_at, account_code, rating, marketing_group, message, status, changed_what,
    reviewed_at)."""
    return [
        [
            created, code, rating, _label(MARKETING_GROUP, group), message,
            _label(FEEDBACK_STATUS, status), changed, reviewed,
        ]
        for created, code, rating, group, message, status, changed, reviewed in rows
    ]


async def build_feedback(db: AsyncSession, ctx: ReportContext) -> list[list]:
    return shape_feedback(
        await repo.feedback_rows(db, ctx.start_utc, ctx.end_utc, ctx.max_rows + 1), ctx
    )


register(
    ReportSpec(
        id="feedback",
        domain=DOMAIN,
        title="Phản hồi khách hàng",
        description="Phản hồi gửi trong kỳ theo mã khách, điểm đánh giá, nhóm 4P, trạng thái xử "
        "lý và nội dung đã thay đổi (BR-109). Không chứa email.",
        columns=(
            Column("Ngày gửi", "date"),
            Column("Mã khách"),
            Column("Đánh giá", "int"),
            Column("Nhóm"),
            Column("Nội dung"),
            Column("Trạng thái"),
            Column("Đã đổi gì"),
            Column("Ngày xử lý", "date"),
        ),
        build=build_feedback,
        source_ref="BR-109",
    )
)


# --- content-reports (UC-24) ----------------------------------------------------------------


def shape_content_reports(rows: Sequence[tuple], ctx: ReportContext) -> list[list]:
    """rows: (created_at, reason, project_id, template_id, reported_code, status, reviewed_at,
    resolution_note)."""
    return [
        [
            created, _label(REPORT_REASON, reason),
            "Mẫu thiết kế" if template_id else "Dự án",
            code, _label(REPORT_STATUS, status), reviewed, note,
        ]
        for created, reason, _project_id, template_id, code, status, reviewed, note in rows
    ]


async def build_content_reports(db: AsyncSession, ctx: ReportContext) -> list[list]:
    return shape_content_reports(
        await repo.content_report_rows(db, ctx.start_utc, ctx.end_utc, ctx.max_rows + 1), ctx
    )


register(
    ReportSpec(
        id="content-reports",
        domain=DOMAIN,
        title="Báo cáo vi phạm nội dung",
        description="Khiếu nại bản quyền/nhãn hiệu/nội dung không phù hợp trong kỳ: lý do, đối "
        "tượng, mã người bị báo cáo và kết quả xử lý. Không chứa email người báo cáo.",
        columns=(
            Column("Ngày", "date"),
            Column("Lý do"),
            Column("Đối tượng"),
            Column("Mã người bị báo cáo"),
            Column("Trạng thái"),
            Column("Ngày xử lý", "date"),
            Column("Ghi chú"),
        ),
        build=build_content_reports,
        source_ref="UC-24",
    )
)


# --- moderation-actions (BR-77) -------------------------------------------------------------


def shape_moderation_actions(rows: Sequence[tuple], ctx: ReportContext) -> list[list]:
    """rows: (created_at, user_code, level, action, reason, restricted_until, moderator_code)."""
    return [
        [created, code, level, _label(MODERATION_ACTION, action), reason, until, moderator]
        for created, code, level, action, reason, until, moderator in rows
    ]


async def build_moderation_actions(db: AsyncSession, ctx: ReportContext) -> list[list]:
    return shape_moderation_actions(
        await repo.moderation_action_rows(db, ctx.start_utc, ctx.end_utc, ctx.max_rows + 1), ctx
    )


register(
    ReportSpec(
        id="moderation-actions",
        domain=DOMAIN,
        title="Hành động kiểm duyệt",
        description="Các bậc xử lý BR-77 (cảnh cáo, hạn chế chia sẻ, khóa) áp dụng trong kỳ, kèm "
        "lý do, hạn hạn chế và mã người xử lý.",
        columns=(
            Column("Ngày", "date"),
            Column("Mã người dùng"),
            Column("Cấp", "int"),
            Column("Hành động"),
            Column("Lý do"),
            Column("Hạn chế đến", "date"),
            Column("Người xử lý"),
        ),
        build=build_moderation_actions,
        source_ref="BR-77",
    )
)


# --- audit-log (SENSITIVE: actor email, raw payload) ----------------------------------------


def shape_audit_log(rows: Sequence[tuple], ctx: ReportContext) -> list[list]:
    """rows: (created_at, actor_email, actor_role, action, target_type, target_id, payload)."""
    return [
        [created, email, role, action, target_type, target_id, json_payload(payload)]
        for created, email, role, action, target_type, target_id, payload in rows
    ]


async def build_audit_log(db: AsyncSession, ctx: ReportContext) -> list[list]:
    return shape_audit_log(
        await repo.audit_log_rows(db, ctx.start_utc, ctx.end_utc, ctx.max_rows + 1), ctx
    )


register(
    ReportSpec(
        id="audit-log",
        domain=DOMAIN,
        title="Nhật ký thao tác quản trị",
        description="Nhật ký audit trong kỳ: thời gian, email người thực hiện, vai trò, hành "
        "động, đối tượng và payload JSON. Chứa email thật nên chỉ quản trị viên được xuất.",
        columns=(
            Column("Thời gian", "datetime"),
            Column("Email người làm"),
            Column("Vai trò"),
            Column("Hành động"),
            Column("Đối tượng"),
            Column("ID"),
            Column("Payload JSON"),
        ),
        build=build_audit_log,
        sensitive=True,
        source_ref="BR-88",
    )
)


# --- login-history (SENSITIVE: email, IP, user agent) ---------------------------------------


def shape_login_history(rows: Sequence[tuple], ctx: ReportContext) -> list[list]:
    """rows: (created_at, email_attempted, success, ip_address, user_agent)."""
    return [
        [created, email, "Có" if success else "Không", ip, agent]
        for created, email, success, ip, agent in rows
    ]


async def build_login_history(db: AsyncSession, ctx: ReportContext) -> list[list]:
    return shape_login_history(
        await repo.login_history_rows(db, ctx.start_utc, ctx.end_utc, ctx.max_rows + 1), ctx
    )


register(
    ReportSpec(
        id="login-history",
        domain=DOMAIN,
        title="Lịch sử đăng nhập",
        description="Lượt đăng nhập thành công và thất bại trong kỳ kèm email thử, IP và user "
        "agent (BR-18). Chỉ lưu 90 ngày; chứa dữ liệu cá nhân nên chỉ quản trị viên được xuất.",
        columns=(
            Column("Thời gian", "datetime"),
            Column("Email thử"),
            Column("Thành công"),
            Column("IP"),
            Column("User agent"),
        ),
        build=build_login_history,
        sensitive=True,
        max_range_days=login_history_repo.RETENTION_DAYS,  # BR-18: older rows are purged
        source_ref="BR-18",
    )
)
