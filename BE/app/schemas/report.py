"""Reports hub payloads (GET /admin/reports)."""

from pydantic import BaseModel


class ReportColumn(BaseModel):
    label: str
    kind: str  # text | int | vnd | date | datetime | percent | bool


class ReportItem(BaseModel):
    id: str
    title: str
    description: str
    formats: list[str]
    date_scoped: bool
    sensitive: bool
    locked: bool  # sensitive report seen by staff: listed, not exportable (403)
    max_range_days: int  # effective cap in days (0 when not date-scoped)
    columns: list[ReportColumn]


class ReportDomain(BaseModel):
    key: str
    label: str
    reports: list[ReportItem]


class ReportCatalogue(BaseModel):
    max_rows: int
    domains: list[ReportDomain]
