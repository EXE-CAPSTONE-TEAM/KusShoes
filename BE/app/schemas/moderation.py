"""BR-77 / UC-24 content-report and moderation DTOs (SRS_v2.2.txt:2042, :194)."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field

ReportReason = Literal["copyright", "trademark", "inappropriate", "other"]
ReportStatus = Literal["new", "reviewing", "upheld", "dismissed"]
ModerationActionKind = Literal["warning", "share_restriction", "ban"]


class ContentReportCreate(BaseModel):
    project_id: uuid.UUID | None = None
    template_id: uuid.UUID | None = None
    reason: ReportReason
    details: str = Field(min_length=20, max_length=2000)
    reporter_email: EmailStr | None = None
    # Bound mirrors the content_reports.reporter_name column so an oversized value is a 422.
    reporter_name: str | None = Field(default=None, max_length=120)
    evidence_url: str | None = None


class ContentReportAccepted(BaseModel):
    """Deliberately carries nothing about the reported content's owner."""

    report_id: uuid.UUID
    status: ReportStatus


class MyModerationStatus(BaseModel):
    level: int
    is_restricted: bool
    restricted_until: datetime | None
    is_banned: bool


class ModerationDecision(BaseModel):
    resolution_note: str = Field(min_length=5, max_length=1000)


class ModerationActionResponse(BaseModel):
    level: int
    action: ModerationActionKind
    restricted_until: datetime | None
    report_status: ReportStatus | None
    id: uuid.UUID
    report_id: uuid.UUID | None
    reason: str
    created_by: uuid.UUID | None
    created_at: datetime


class ContentReportListItem(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID | None
    template_id: uuid.UUID | None
    reported_user_id: uuid.UUID
    reason: ReportReason
    status: ReportStatus
    created_at: datetime


class ContentReportDetail(ContentReportListItem):
    details: str
    reporter_email: str | None
    reporter_name: str | None
    evidence_url: str | None
    resolution_note: str | None
    reviewed_by: uuid.UUID | None
    reviewed_at: datetime | None
    # History of every BR-77 action already applied to the reported account.
    user_actions: list[ModerationActionResponse]
