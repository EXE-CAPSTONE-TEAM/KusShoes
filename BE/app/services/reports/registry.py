"""Report registry: declarative specs for the Trung tâm báo cáo (Reports hub).

A domain module (finance.py, billing.py, ...) calls `register(ReportSpec(...))` at import time.
Each report is a thin async fetch (`build`) plus a PURE shaping function that the domain module
unit-tests without a database. Rendering, escaping, auditing and limits live elsewhere
(render.py, __init__.py) so a report author only supplies columns and rows.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import date, datetime
from typing import Literal

from sqlalchemy.ext.asyncio import AsyncSession

ColumnKind = Literal["text", "int", "vnd", "date", "datetime", "percent", "bool"]

COLUMN_KINDS: tuple[str, ...] = ("text", "int", "vnd", "date", "datetime", "percent", "bool")
ALL_FORMATS: tuple[str, ...] = ("csv", "xlsx")  # PDF is opt-in: summary reports only
WITH_PDF: tuple[str, ...] = ("csv", "xlsx", "pdf")

# Display order of the six domains of the hub (key, Vietnamese label).
DOMAINS: tuple[tuple[str, str], ...] = (
    ("tai-chinh", "Tài chính"),
    ("goi-thanh-toan", "Gói & thanh toán"),
    ("nguoi-dung", "Người dùng"),
    ("thiet-ke-3d", "Thiết kế 3D"),
    ("chi-phi-he-thong", "Chi phí hệ thống"),
    ("kiem-duyet-bao-mat", "Kiểm duyệt & bảo mật"),
)
DOMAIN_KEYS: tuple[str, ...] = tuple(key for key, _ in DOMAINS)


@dataclass(frozen=True)
class Column:
    label: str
    kind: ColumnKind = "text"

    def __post_init__(self):
        if self.kind not in COLUMN_KINDS:
            raise ValueError(f"Unknown column kind {self.kind!r}")


@dataclass(frozen=True)
class ReportContext:
    """Everything a report may depend on besides the database. Business dates are GMT+7 (CR-01);
    the *_utc pair is the half-open window [start_utc, end_utc) to pass to repository queries."""

    start: date
    end: date
    start_utc: datetime
    end_utc: datetime
    generated_at: datetime  # extraction time, GMT+7
    actor_role: str
    max_rows: int  # repositories should `.limit(ctx.max_rows + 1)` so overflow is detectable


BuildFn = Callable[[AsyncSession, ReportContext], Awaitable[list[list]]]


@dataclass(frozen=True)
class ReportSpec:
    id: str
    domain: str
    title: str
    description: str
    columns: tuple[Column, ...]
    build: BuildFn
    date_scoped: bool = True
    sensitive: bool = False  # admin-only; may expose raw PII (BR-88 exception)
    formats: tuple[str, ...] = ALL_FORMATS
    max_range_days: int | None = None  # None -> settings.REPORT_MAX_RANGE_DAYS
    source_ref: str = ""  # SRS / BR reference the definition comes from

    def __post_init__(self):
        if self.domain not in DOMAIN_KEYS:
            raise ValueError(f"Report {self.id!r}: unknown domain {self.domain!r}")
        if not self.columns:
            raise ValueError(f"Report {self.id!r}: needs at least one column")
        if not set(self.formats) <= set(WITH_PDF) or not {"csv", "xlsx"} <= set(self.formats):
            raise ValueError(f"Report {self.id!r}: formats must include csv and xlsx")


_REGISTRY: dict[str, ReportSpec] = {}


def register(spec: ReportSpec) -> ReportSpec:
    if spec.id in _REGISTRY:
        raise ValueError(f"Duplicate report id {spec.id!r}")
    _REGISTRY[spec.id] = spec
    return spec


def get(report_id: str) -> ReportSpec | None:
    return _REGISTRY.get(report_id)


def all_specs() -> list[ReportSpec]:
    """Specs in hub order: by domain, then registration order inside the domain."""
    order = {key: index for index, key in enumerate(DOMAIN_KEYS)}
    return sorted(_REGISTRY.values(), key=lambda spec: order[spec.domain])  # stable sort
