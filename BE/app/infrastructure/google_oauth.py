import httpx
from authlib.integrations.httpx_client import AsyncOAuth2Client

from app.config import settings


def create_authorization_url(state: str) -> str:
    client = AsyncOAuth2Client(
        client_id=settings.GOOGLE_CLIENT_ID,
        redirect_uri=settings.GOOGLE_REDIRECT_URI,
    )
    uri, _ = client.create_authorization_url(
        "https://accounts.google.com/o/oauth2/v2/auth",
        state=state,
        scope="openid email profile",
        access_type="offline",
    )
    return uri


async def fetch_user_info(code: str) -> dict:
    client = AsyncOAuth2Client(
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        redirect_uri=settings.GOOGLE_REDIRECT_URI,
    )
    await client.fetch_token("https://oauth2.googleapis.com/token", code=code)
    response = await client.get("https://www.googleapis.com/oauth2/v3/userinfo")
    return response.json()


async def verify_id_token(token: str, *, google_id: str | None, email: str) -> bool:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": token},
            )
        if response.status_code != 200:
            return False
        payload = response.json()
        return (
            payload.get("aud") == settings.GOOGLE_CLIENT_ID
            and payload.get("sub") == google_id
            and payload.get("email") == email
        )
    except httpx.HTTPError:
        return False
