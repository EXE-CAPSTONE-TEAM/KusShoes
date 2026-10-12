"""SF-16 report generator facade. Reports live in `app.services.reports` (registry-driven, six
domains); this module keeps the stable import surface for callers that predate the hub:
the shared renderers (used by feedback_service) and `generate` / `catalogue`.

Scheduled email delivery is not implemented (out of scope, spec.md)."""

from app.services.reports import CONTENT_TYPES, catalogue, generate  # noqa: F401
from app.services.reports.render import render_csv, render_pdf, render_xlsx  # noqa: F401
