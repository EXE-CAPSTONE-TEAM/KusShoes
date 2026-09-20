"""E2E: web login -> project -> desktop PKCE launch -> import GLB thủ công -> web thấy model.

Chạy trong container api (để resolve được MinIO):

    docker compose exec -T -e SEED_USER_PASSWORD=... api python -m scripts.seed_users
    docker compose exec -T -e E2E_PASSWORD=... api python -m scripts.e2e_desktop_flow

Env: E2E_API (mặc định http://localhost:8000), E2E_EMAIL, E2E_PASSWORD.
"""
import base64
import hashlib
import json
import os
import secrets
import struct
import sys
from urllib.parse import parse_qs, urlparse

import httpx

API = os.getenv("E2E_API", "http://localhost:8000")
EMAIL = os.getenv("E2E_EMAIL", "user1@example.com")
PASSWORD = os.getenv("E2E_PASSWORD", "")

ok = True

if not PASSWORD:
    sys.exit("E2E_PASSWORD chưa được set (dùng cùng giá trị với SEED_USER_PASSWORD).")


def step(name, cond, detail=""):
    global ok
    mark = "PASS" if cond else "FAIL"
    if not cond:
        ok = False
    print(f"[{mark}] {name}{(' — ' + str(detail)) if detail else ''}")


def minimal_glb() -> bytes:
    payload = json.dumps({"asset": {"version": "2.0"}}).encode()
    payload += b" " * ((4 - len(payload) % 4) % 4)
    chunk = struct.pack("<II", len(payload), 0x4E4F534A) + payload
    return struct.pack("<4sII", b"glTF", 2, 12 + len(chunk)) + chunk


with httpx.Client(timeout=30.0) as c:
    # 1. Web login
    r = c.post(f"{API}/api/v1/auth/login", json={"email": EMAIL, "password": PASSWORD})
    step("web login", r.status_code == 200, r.status_code)
    if r.status_code != 200:
        print(r.text)
        sys.exit(1)
    web_token = r.json()["access_token"]
    web = {"Authorization": f"Bearer {web_token}"}

    # 2. Create project
    r = c.post(f"{API}/api/v1/projects", headers=web, json={"name": "E2E desktop handoff"})
    step("create project", r.status_code == 201, r.status_code)
    project_id = r.json()["id"]

    # 3. Web asks for a desktop launch ticket
    r = c.post(f"{API}/api/v1/auth/editor/launch", headers=web, json={"project_id": project_id})
    step("editor launch ticket", r.status_code == 200, r.status_code)
    desktop_url = r.json()["desktop_url"]
    parsed = urlparse(desktop_url)
    step("deep link scheme", parsed.scheme == "kusshoes-editor" and parsed.netloc == "launch", desktop_url.split("?")[0])
    ticket = parse_qs(parsed.query)["ticket"][0]

    # 4. Desktop side: PKCE claim + exchange
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode().rstrip("=")
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    r = c.post(
        f"{API}/api/v1/auth/editor/launch/claim",
        json={"launch_ticket": ticket, "code_challenge": challenge, "code_challenge_method": "S256"},
    )
    step("PKCE claim", r.status_code == 200, r.status_code)
    code = r.json()["authorization_code"]

    r = c.post(
        f"{API}/api/v1/auth/editor/launch/exchange",
        json={"authorization_code": code, "code_verifier": verifier},
    )
    step("PKCE exchange", r.status_code == 200, r.status_code)
    session = r.json()
    step("editor scopes", set(session["scopes"]) == {"editor:read", "editor:write"}, session["scopes"])
    step("session bound to project", session["project_id"] == project_id)
    editor = {"Authorization": f"Bearer {session['access_token']}"}

    # replay must fail
    r = c.post(
        f"{API}/api/v1/auth/editor/launch/claim",
        json={"launch_ticket": ticket, "code_challenge": challenge, "code_challenge_method": "S256"},
    )
    step("ticket is one-time", r.status_code == 401, r.status_code)

    # 5. Desktop reads the project
    r = c.get(f"{API}/api/v1/editor/me", headers=editor)
    step("editor /me", r.status_code == 200, r.status_code)
    r = c.get(f"{API}/api/v1/editor/projects/{project_id}/context", headers=editor)
    step("editor context", r.status_code == 200, r.status_code)
    step("project has no model yet", r.json()["modelAsset"] is None)

    # 6. Manual GLB import from the desktop editor
    glb = minimal_glb()
    r = c.post(
        f"{API}/api/v1/editor/assets/upload-url",
        headers=editor,
        json={"asset_type": "source_model", "filename": "shoe.glb", "content_type": "model/gltf-binary"},
    )
    step("import upload-url", r.status_code == 200, r.text[:200] if r.status_code != 200 else "")
    upload = r.json()
    put = c.put(upload["upload_url"], content=glb, headers={"Content-Type": "model/gltf-binary"})
    step("upload GLB to storage", put.status_code in (200, 204), put.status_code)
    r = c.post(
        f"{API}/api/v1/editor/assets/confirm",
        headers=editor,
        json={"asset_id": upload["asset_id"], "file_size_bytes": len(glb)},
    )
    step("confirm import", r.status_code == 200, r.text[:200] if r.status_code != 200 else "")
    step("asset ready", r.json()["status"] == "ready", r.json().get("status"))

    # 7. Desktop sees the model
    r = c.get(f"{API}/api/v1/editor/projects/{project_id}/context", headers=editor)
    model = r.json()["modelAsset"]
    step("editor context now has model", model is not None and model["status"] == "ready")

    # 8. Web sees the same model (duyệt trên web)
    r = c.get(f"{API}/api/v1/projects/{project_id}/assets", headers=web)
    items = r.json()["items"]
    step("web lists imported model", any(i["asset_type"] == "source_model" and i["status"] == "ready" for i in items), items and items[0]["original_filename"])
    r = c.get(f"{API}/api/v1/projects/{project_id}", headers=web)
    step("project canonical model set", r.json().get("canonical_model_asset_id") == upload["asset_id"], r.json().get("canonical_model_asset_id"))

    # 9. Second import must be refused
    r = c.post(
        f"{API}/api/v1/editor/assets/upload-url",
        headers=editor,
        json={"asset_type": "source_model", "filename": "other.glb", "content_type": "model/gltf-binary"},
    )
    step("cannot replace canonical model", r.status_code == 403 and r.json().get("code") == "EDITOR_ASSET_TYPE_FORBIDDEN", r.status_code)

print()
print("E2E RESULT:", "ALL PASSED" if ok else "FAILURES PRESENT")
sys.exit(0 if ok else 1)
