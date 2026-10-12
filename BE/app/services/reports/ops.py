"""Reports hub domain `chi-phi-he-thong` -- Chi phí hệ thống: api-cost, api-cost-by-operation,
api-cost-by-user, api-budget, scan-unit-economics.

Register each report with `registry.register(ReportSpec(domain=DOMAIN, ...))` (see
services/reports/__init__.py for the contract)."""

from collections.abc import Sequence

from sqlalchemy.ext.asyncio import AsyncSession

from app.services import api_cost_service
from app.services.reports.registry import Column, ReportContext, ReportSpec, register

DOMAIN = "chi-phi-he-thong"


def shape_api_cost(days: Sequence) -> list[list]:
    """BR-108 (SRS_v2.2.txt:2112): one row per GMT+7 day, zero-filled, then a total row.
    Failed calls are counted and costed too (SF-14, SRS_v2.2.txt:1767)."""
    table = [
        [row.day, row.calls, row.success_calls, row.failed_calls, row.cost_vnd] for row in days
    ]
    table.append(
        [
            "Tổng",
            sum(row.calls for row in days),
            sum(row.success_calls for row in days),
            sum(row.failed_calls for row in days),
            sum(row.cost_vnd for row in days),
        ]
    )
    return table


async def build_api_cost(db: AsyncSession, ctx: ReportContext) -> list[list]:
    return shape_api_cost(await api_cost_service.daily_rows(db, ctx.start, ctx.end))


register(
    ReportSpec(
        id="api-cost",
        domain=DOMAIN,
        title="Chi phí API theo ngày",
        description="Số lần gọi API 3D/AI (thành công, thất bại) và chi phí theo từng ngày GMT+7, "
        "kèm dòng tổng (SF-14, BR-108).",
        columns=(
            Column("Ngày", "date"),
            Column("Số lần gọi", "int"),
            Column("Thành công", "int"),
            Column("Thất bại", "int"),
            Column("Chi phí (VND)", "vnd"),
        ),
        build=build_api_cost,
        source_ref="BR-108, SF-14",
    )
)
