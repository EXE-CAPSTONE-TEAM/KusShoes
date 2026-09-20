from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.exceptions import AuthEditorLaunchInvalid
from app.services import auth_service
from app.utils.jwt import decode_editor_access_token


class FakeRedis:
    def __init__(self):
        self.values: dict[str, str] = {}

    async def set(self, key, value, *, ex, nx=False):
        if nx and key in self.values:
            return False
        self.values[key] = value
        return True

    async def getdel(self, key):
        return self.values.pop(key, None)


@pytest.mark.asyncio
async def test_launch_ticket_and_authorization_code_are_single_use(monkeypatch):
    redis = FakeRedis()
    user_id = "11111111-1111-4111-8111-111111111111"
    project_id = "22222222-2222-4222-8222-222222222222"
    verifier = "A" * 43
    challenge = auth_service._pkce_s256(verifier)
    ticket = await auth_service._store_opaque_record(
        redis,
        prefix="editor-launch-ticket",
        payload={"user_id": user_id, "project_id": project_id},
        ttl=60,
    )

    claim = await auth_service.claim_editor_launch(
        redis,
        launch_ticket=ticket,
        code_challenge=challenge,
    )
    with pytest.raises(AuthEditorLaunchInvalid):
        await auth_service.claim_editor_launch(
            redis,
            launch_ticket=ticket,
            code_challenge=challenge,
        )

    monkeypatch.setattr(
        auth_service.user_repo,
        "get_by_id",
        AsyncMock(return_value=SimpleNamespace(id=user_id, status="active")),
    )
    monkeypatch.setattr(
        auth_service.project_repo,
        "get_owned_by_id",
        AsyncMock(return_value=SimpleNamespace(id=project_id)),
    )
    exchanged = await auth_service.exchange_editor_launch(
        object(),
        redis,
        authorization_code=claim.authorization_code,
        code_verifier=verifier,
    )
    claims = decode_editor_access_token(exchanged.access_token)
    assert claims["project_id"] == project_id
    assert claims["type"] == "editor"

    with pytest.raises(AuthEditorLaunchInvalid):
        await auth_service.exchange_editor_launch(
            object(),
            redis,
            authorization_code=claim.authorization_code,
            code_verifier=verifier,
        )


@pytest.mark.asyncio
async def test_wrong_pkce_verifier_is_rejected():
    redis = FakeRedis()
    code = await auth_service._store_opaque_record(
        redis,
        prefix="editor-auth-code",
        payload={
            "user_id": "11111111-1111-4111-8111-111111111111",
            "project_id": "22222222-2222-4222-8222-222222222222",
            "code_challenge": auth_service._pkce_s256("A" * 43),
        },
        ttl=60,
    )

    with pytest.raises(AuthEditorLaunchInvalid):
        await auth_service.exchange_editor_launch(
            object(),
            redis,
            authorization_code=code,
            code_verifier="B" * 43,
        )
