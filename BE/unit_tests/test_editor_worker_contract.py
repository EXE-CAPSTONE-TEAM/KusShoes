import asyncio
import json

import httpx
import pytest

from app.infrastructure import editor_worker


class FakeResponse:
    def __init__(self, status_code: int, body: bytes = b"{}") -> None:
        self.status_code = status_code
        self.body = body

    async def __aenter__(self):
        return self

    async def __aexit__(self, _exc_type, _exc, _traceback):
        return False

    def raise_for_status(self) -> None:
        request = httpx.Request("POST", "https://worker.test/bake")
        response = httpx.Response(
            self.status_code,
            request=request,
        )
        response.raise_for_status()

    async def aiter_bytes(self):
        yield self.body


class FakeClient:
    def __init__(self, response: FakeResponse) -> None:
        self.response = response
        self.request_kwargs = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, _exc_type, _exc, _traceback):
        return False

    def stream(self, method, url, **kwargs):
        self.request_kwargs = {
            "method": method,
            "url": url,
            **kwargs,
        }
        return self.response


def configure_worker(monkeypatch) -> None:
    monkeypatch.setattr(
        editor_worker.settings,
        "EDITOR_WORKER_URL",
        "https://worker.test",
    )
    monkeypatch.setattr(
        editor_worker.settings,
        "EDITOR_WORKER_SERVICE_TOKEN",
        "dedicated-worker-secret",
    )
    monkeypatch.setattr(
        editor_worker.settings,
        "EDITOR_WORKER_TIMEOUT_SECONDS",
        30,
    )


def test_request_bake_uses_dedicated_token_and_parses_bounded_json(monkeypatch):
    configure_worker(monkeypatch)
    client = FakeClient(
        FakeResponse(
            200,
            json.dumps({"exports": [{"format": "glb"}]}).encode(),
        )
    )
    monkeypatch.setattr(
        editor_worker.httpx,
        "AsyncClient",
        lambda **_kwargs: client,
    )

    result = asyncio.run(editor_worker.request_bake({"job_id": "job"}))

    assert result["exports"][0]["format"] == "glb"
    assert client.request_kwargs["headers"] == {"X-Service-Token": "dedicated-worker-secret"}


def test_request_bake_treats_permanent_worker_rejection_as_value_error(monkeypatch):
    configure_worker(monkeypatch)
    client = FakeClient(FakeResponse(422))
    monkeypatch.setattr(
        editor_worker.httpx,
        "AsyncClient",
        lambda **_kwargs: client,
    )

    with pytest.raises(ValueError, match=r"\(422\)"):
        asyncio.run(editor_worker.request_bake({}))


def test_request_bake_preserves_transient_worker_error_for_celery_retry(monkeypatch):
    configure_worker(monkeypatch)
    client = FakeClient(FakeResponse(503))
    monkeypatch.setattr(
        editor_worker.httpx,
        "AsyncClient",
        lambda **_kwargs: client,
    )

    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(editor_worker.request_bake({}))


def test_request_bake_rejects_oversized_response(monkeypatch):
    configure_worker(monkeypatch)
    client = FakeClient(
        FakeResponse(
            200,
            b"x" * (editor_worker.MAX_WORKER_RESPONSE_BYTES + 1),
        )
    )
    monkeypatch.setattr(
        editor_worker.httpx,
        "AsyncClient",
        lambda **_kwargs: client,
    )

    with pytest.raises(ValueError, match="quá lớn"):
        asyncio.run(editor_worker.request_bake({}))


def test_request_bake_fails_closed_without_dedicated_token(monkeypatch):
    monkeypatch.setattr(
        editor_worker.settings,
        "EDITOR_WORKER_URL",
        "https://worker.test",
    )
    monkeypatch.setattr(
        editor_worker.settings,
        "EDITOR_WORKER_SERVICE_TOKEN",
        "",
    )

    with pytest.raises(ValueError, match="SERVICE_TOKEN"):
        asyncio.run(editor_worker.request_bake({}))
