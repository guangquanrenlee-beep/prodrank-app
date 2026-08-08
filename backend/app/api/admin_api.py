"""Admin API — Server setup, configuration, and internal data panels.

Data panel endpoints require X-Admin-Key matching ADMIN_KEY env var —
the question library is the company's moat data, never shown to users.
"""

import os
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from app.core.config import get_settings

router = APIRouter()


def _check_admin(request: Request):
    """X-Admin-Key must match ADMIN_KEY env var."""
    key = get_settings().admin_key
    if not key:
        raise HTTPException(status_code=503, detail="ADMIN_KEY not configured on server")
    sent = request.headers.get("X-Admin-Key", "")
    if sent != key:
        raise HTTPException(status_code=401, detail="Invalid admin key")


class SetupEnvRequest(BaseModel):
    SHOPIFY_CLIENT_ID: str = ""
    SHOPIFY_CLIENT_SECRET: str = ""
    RESEND_API_KEY: str = ""


@router.post("/deploy")
async def trigger_deploy():
    """Pull latest code and rebuild Docker (instant deploy after git push)."""
    import subprocess, os
    try:
        project_dir = "/opt/prodrank"
        r1 = subprocess.run(["git", "pull"], cwd=project_dir, capture_output=True, text=True, timeout=30)
        if r1.returncode != 0:
            return {"status": "error", "message": f"git pull failed: {r1.stderr}"}
        r2 = subprocess.run(["docker", "compose", "up", "-d", "--build"], cwd=project_dir, capture_output=True, text=True, timeout=120)
        return {"status": "deployed", "git": r1.stdout.strip(), "build": r2.stdout.strip()[-200:]}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/setup-env")
async def setup_env(req: SetupEnvRequest, request: Request):
    """Write API keys to .env file on the server. Restarts the server after."""
    # Find .env file
    env_paths = [
        os.path.join(os.path.dirname(__file__), "..", "..", ".env"),
        os.path.join(os.getcwd(), ".env"),
        "/app/.env",
    ]
    env_path = None
    for p in env_paths:
        if os.path.exists(os.path.dirname(p)):
            env_path = p
            break

    if not env_path:
        return {"status": "error", "message": "Could not find .env directory"}

    try:
        # Read existing
        existing_lines = []
        if os.path.exists(env_path):
            with open(env_path, "r") as f:
                existing_lines = f.read().split("\n")

        # Remove existing Shopify/Resend lines
        existing_lines = [l for l in existing_lines if l and not l.startswith("SHOPIFY_") and not l.startswith("RESEND_")]

        # Add new values
        if req.SHOPIFY_CLIENT_ID:
            existing_lines.append(f"SHOPIFY_CLIENT_ID={req.SHOPIFY_CLIENT_ID}")
        if req.SHOPIFY_CLIENT_SECRET:
            existing_lines.append(f"SHOPIFY_CLIENT_SECRET={req.SHOPIFY_CLIENT_SECRET}")
        if req.RESEND_API_KEY:
            existing_lines.append(f"RESEND_API_KEY={req.RESEND_API_KEY}")

        with open(env_path, "w") as f:
            f.write("\n".join(existing_lines) + "\n")

        # Trigger docker compose restart (background)
        import subprocess, threading
        def restart():
            import time
            time.sleep(2)
            subprocess.run(["docker", "compose", "restart"], cwd=os.path.dirname(env_path), capture_output=True)

        threading.Thread(target=restart, daemon=True).start()

        return {"status": "saved", "message": f"Written to {env_path}, restarting..."}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/data/summary")
async def data_summary(request: Request):
    """Internal data asset panel — question library stats.
    Requires X-Admin-Key. Returns: totals, per-category dimension
    distribution, last collection time, 7-day growth."""
    _check_admin(request)
    from app.services.db import DB
    db = DB()

    # Pull category + added_at for aggregation. A single .limit(50000) call
    # is silently truncated by PostgREST's db-max-rows (1000 on Supabase) —
    # the summary would always read "1000" no matter the real size. Fetch
    # paginated and use an exact count instead.
    def fetch_all(select: str, page_size: int = 1000):
        first = db.client.table("questions").select(select, count="exact").range(0, page_size - 1).execute()
        total = first.count or 0
        rows = list(first.data or [])
        start = page_size
        while start < total:
            chunk = db.client.table("questions").select(select).range(start, start + page_size - 1).execute()
            rows += (chunk.data or [])
            start += page_size
            if not chunk.data:
                break
        return rows, total

    rows, total = fetch_all("category,added_at")

    # Per category dimension distribution: category = "fashion:Size"
    by_category: dict[str, dict] = {}
    for r in rows:
        cat_full = r.get("category", "")
        if ":" in cat_full:
            cat, dim = cat_full.split(":", 1)
        else:
            cat, dim = cat_full, "other"
        c = by_category.setdefault(cat, {"total": 0, "dimensions": Counter()})
        c["total"] += 1
        c["dimensions"][dim] += 1

    # 7-day growth
    today = datetime.now(timezone.utc).date()
    days = defaultdict(int)
    for r in rows:
        ts = r.get("added_at", "")
        if ts:
            try:
                d = datetime.fromisoformat(ts.replace("Z", "+00:00")).date()
                diff = (today - d).days
                if 0 <= diff < 7:
                    days[str(d)] += 1
            except Exception:
                pass

    return {
        "total_questions": total,
        "categories": {
            cat: {"total": c["total"], "dimensions": dict(sorted(c["dimensions"].items(), key=lambda x: -x[1]))}
            for cat, c in by_category.items()
        },
        "last_7_days": dict(sorted(days.items())),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
