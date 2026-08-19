from __future__ import annotations

from collections import defaultdict
from time import monotonic

_request_count: dict[tuple[str, str, str], int] = defaultdict(int)
_request_duration_sum: dict[tuple[str, str, str], float] = defaultdict(float)


def observe_request(method: str, path: str, status_code: int, started_at: float) -> None:
    labels = (method.upper(), path, str(status_code))
    _request_count[labels] += 1
    _request_duration_sum[labels] += max(monotonic() - started_at, 0.0)


def render_prometheus() -> str:
    lines = [
        "# HELP kusshoes_http_requests_total Total HTTP requests.",
        "# TYPE kusshoes_http_requests_total counter",
    ]
    for (method, path, status), value in sorted(_request_count.items()):
        lines.append(
            'kusshoes_http_requests_total{'
            f'method="{_escape(method)}",path="{_escape(path)}",status="{_escape(status)}"'
            f"}} {value}"
        )

    lines.extend(
        [
            "# HELP kusshoes_http_request_duration_seconds_sum Total HTTP request duration.",
            "# TYPE kusshoes_http_request_duration_seconds_sum counter",
        ]
    )
    for (method, path, status), value in sorted(_request_duration_sum.items()):
        lines.append(
            'kusshoes_http_request_duration_seconds_sum{'
            f'method="{_escape(method)}",path="{_escape(path)}",status="{_escape(status)}"'
            f"}} {value:.6f}"
        )

    return "\n".join(lines) + "\n"


def _escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
