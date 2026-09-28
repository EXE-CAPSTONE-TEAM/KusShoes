"""Drive the export (bake-job) protocol against bench_server.py and measure that process.

Per export: POST /projects/{id}/bake (service token) -> POST /editor/jobs/{id}/claim (editor
token) -> POST /editor/jobs/{id}/complete (claim token). The desktop's own work (Blender bake,
upload to R2) happens off the server and is not part of this measurement.

Server CPU = utime+stime of the server PID from /proc/<pid>/stat; memory = VmRSS / VmHWM.

Run (from BE/, against a scratch database — it creates bench users and projects):

    export BE_DIR=$PWD DATABASE_URL=postgresql+asyncpg://...kusshoes_test REDIS_URL=redis://...
    APP_ENV=production python scripts/bench/export_path_server.py &   # production: SQL echo off
    SERVER_PID=$! USERS=20 python scripts/bench/export_path_client.py

Each line printed is one JSON phase result. Results of 2026-09-29 are in .spec/tasks.md (T16).
"""
import asyncio
import json
import os
import statistics
import sys
import time
import uuid
from datetime import UTC, datetime

sys.path.insert(0, os.environ["BE_DIR"])
os.chdir(os.environ["BE_DIR"])

import httpx  # noqa: E402

from app.config import settings  # noqa: E402
from app.database import AsyncSessionLocal  # noqa: E402
from app.models.project_asset import ProjectAsset  # noqa: E402
from app.repositories import (  # noqa: E402
    monthly_usage_repo,
    plan_repo,
    project_repo,
    subscription_repo,
    user_repo,
)
from app.services.auth_service import EDITOR_SCOPES  # noqa: E402
from app.utils.jwt import create_access_token, create_editor_access_token  # noqa: E402

API = f"http://127.0.0.1:{os.environ.get('BENCH_PORT', '8765')}"
PID = int(os.environ["SERVER_PID"])
OUTPUT_BYTES = int(os.environ.get("OUTPUT_BYTES", str(8 * 1024 * 1024)))
TICKS = os.sysconf("SC_CLK_TCK")
RUN = uuid.uuid4().hex[:8]


def cpu_seconds() -> float:
    fields = open(f"/proc/{PID}/stat").read().rsplit(")", 1)[1].split()
    return (int(fields[11]) + int(fields[12])) / TICKS  # utime, stime


def mem_kib() -> dict:
    out = {}
    for line in open(f"/proc/{PID}/status"):
        if line.startswith(("VmRSS", "VmHWM")):
            key, value = line.split(":")
            out[key] = int(value.split()[0])
    return out


async def make_user(index: int):
    """Verified Pro user (glb + obj per export, 300 exports/cycle) with one project + ready model."""
    async with AsyncSessionLocal() as db:
        user = await user_repo.create_email_user(
            db,
            email=f"bench-{RUN}-{index}@example.com",
            username=f"bench_{RUN}_{index}",
            password_hash=None,
            first_name="Bench",
            last_name=str(index),
        )
        user.is_verified = True
        pro = await plan_repo.get_by_tier_and_cycle(db, "pro", "monthly")
        await subscription_repo.create_free(db, user_id=user.id, plan_id=pro.id)
        sub = await subscription_repo.get_by_user(db, user.id)
        sub.plan_id, sub.plan, sub.tier = pro.id, pro, "pro_monthly"
        await monthly_usage_repo.create_for_user(db, user_id=user.id, period_start=datetime.now(UTC))
        await db.commit()
        user_id = user.id
    web = {"Authorization": f"Bearer {create_access_token(str(user_id), role='user')}"}
    async with httpx.AsyncClient(base_url=API, timeout=60) as c:
        r = await c.post("/api/v1/projects", headers=web, json={"name": f"bench {index}"})
        r.raise_for_status()
        project_id = r.json()["id"]
    # get_db commits after the response is sent: wait until the row is visible.
    for _ in range(100):
        async with AsyncSessionLocal() as db:
            if await project_repo.get_by_id(db, uuid.UUID(project_id)):
                break
        await asyncio.sleep(0.05)
    async with AsyncSessionLocal() as db:
        asset = ProjectAsset(
            project_id=uuid.UUID(project_id),
            user_id=user_id,
            asset_type="source_model",
            file_path=f"models/{project_id}/{uuid.uuid4()}.glb",
            file_size_bytes=OUTPUT_BYTES,
            mime_type="model/gltf-binary",
            status="ready",
        )
        db.add(asset)
        await db.flush()
        project = await project_repo.get_by_id(db, uuid.UUID(project_id))
        await project_repo.set_canonical_asset(db, project, asset.id)
        await db.commit()
    editor = {
        "Authorization": "Bearer "
        + create_editor_access_token(str(user_id), project_id, list(EDITOR_SCOPES))
    }
    return {"project_id": project_id, "editor": editor, "web": web}


async def one_export(c: httpx.AsyncClient, u: dict) -> float:
    t0 = time.perf_counter()
    r = await c.post(
        f"/api/v1/projects/{u['project_id']}/bake",
        headers={"X-Service-Token": settings.SERVICE_TOKEN},
        json={"design_config": {"color": "red", "layers": [{"id": i} for i in range(20)]}},
    )
    assert r.status_code == 202, r.text
    job_id = r.json()["job_id"]
    r = await c.post(f"/api/v1/editor/jobs/{job_id}/claim", headers=u["editor"], json={})
    assert r.status_code == 200, r.text
    claim = r.json()
    outputs = [
        {"format": o["format"], "filePath": o["file_path"], "fileSizeBytes": OUTPUT_BYTES}
        for o in claim["payload"]["outputs"]
    ]
    r = await c.post(
        f"/api/v1/editor/jobs/{job_id}/complete",
        headers={"X-Claim-Token": claim["claimToken"]},
        json={"outputs": outputs},
    )
    assert r.status_code == 200, r.text
    return time.perf_counter() - t0


async def phase(name, users, per_user, concurrency, fn):
    await asyncio.sleep(1)
    cpu0, t0 = cpu_seconds(), time.perf_counter()
    latencies = []
    sem = asyncio.Semaphore(concurrency)
    async with httpx.AsyncClient(base_url=API, timeout=120) as c:
        async def run(u):
            for _ in range(per_user):
                async with sem:
                    latencies.append(await fn(c, u))
        await asyncio.gather(*(run(u) for u in users))
    wall = time.perf_counter() - t0
    cpu = cpu_seconds() - cpu0
    n = len(latencies)
    lat = sorted(latencies)
    result = {
        "phase": name,
        "operations": n,
        "concurrency": concurrency,
        "wall_s": round(wall, 2),
        "server_cpu_s": round(cpu, 3),
        "server_cpu_ms_per_op": round(1000 * cpu / n, 2),
        "server_cpu_util_during_phase_pct_of_1_core": round(100 * cpu / wall, 1),
        "latency_ms_p50": round(1000 * statistics.median(lat), 1),
        "latency_ms_p95": round(1000 * lat[int(0.95 * (n - 1))], 1),
        **{f"{k}_mib_after": round(v / 1024, 1) for k, v in mem_kib().items()},
    }
    print(json.dumps(result), flush=True)
    return result


async def profile_get(c, u):
    t0 = time.perf_counter()
    r = await c.get("/api/v1/users/me", headers=u["web"])
    assert r.status_code == 200, r.text
    return time.perf_counter() - t0


async def main():
    print(json.dumps({"idle_before_setup": {k: round(v / 1024, 1) for k, v in mem_kib().items()}}))
    users = [await make_user(i) for i in range(int(os.environ.get("USERS", "20")))]
    print(json.dumps({"after_setup": {k: round(v / 1024, 1) for k, v in mem_kib().items()}}))
    # Warm-up so import-time / first-request costs are not billed to a phase.
    await phase("warmup", users[:2], 2, 1, one_export)
    # Baseline: an ordinary authenticated read, for scale.
    await phase("baseline GET /users/me", users, 15, 1, profile_get)
    await phase("export sequential", users, 5, 1, one_export)
    await phase("export 10 parallel", users, 5, 10, one_export)
    await phase("export 20 parallel", users, 4, 20, one_export)


asyncio.run(main())
