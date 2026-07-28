"""Inject API — Serve inject.js and receive audit pings from JS-injected sites."""

import os
from fastapi import APIRouter, Request, Response
from fastapi.responses import FileResponse

router = APIRouter()

INJECT_JS_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "inject", "inject.js"
)
INJECT_SAAS_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "inject", "inject-saas.js"
)


def _serve_js(file_paths: list[str], fallback_msg: str):
    """Serve a JS file from one of several possible paths."""
    for path in file_paths:
        real = os.path.realpath(path) if os.path.exists(path) else ""
        if real and os.path.exists(real):
            return FileResponse(
                real,
                media_type="application/javascript",
                headers={
                    "Cache-Control": "public, max-age=3600",
                    "Access-Control-Allow-Origin": "*",
                },
            )
    return Response(
        content=fallback_msg,
        media_type="application/javascript",
        headers={"Access-Control-Allow-Origin": "*"},
    )


@router.get("/inject.js")
async def serve_inject_js():
    """Serve the universal Schema injection script for ecommerce."""
    return _serve_js(
        [
            INJECT_JS_PATH,
            "D:/site/prodrank/inject/inject.js",
            os.path.join(os.getcwd(), "inject", "inject.js"),
        ],
        "/* ProdRank inject.js not found — check server configuration */",
    )


@router.get("/inject-saas.js")
async def serve_inject_saas_js():
    """Serve the universal Schema injection script for SaaS sites."""
    return _serve_js(
        [
            INJECT_SAAS_PATH,
            "D:/site/prodrank/inject/inject-saas.js",
            os.path.join(os.getcwd(), "inject", "inject-saas.js"),
        ],
        "/* ProdRank inject-saas.js not found — check server configuration */",
    )


async def _handle_ping(request: Request):
    """Shared ping handler for both /api/ping and legacy /api/inject/ping."""
    try:
        body = await request.json()
    except Exception:
        return {"status": "ignored"}

    site = body.get("site", "unknown")
    has_schema = body.get("has_schema", False)
    product = body.get("product_name", "?")

    # Persist inject status to Supabase
    try:
        from app.services.db import DB
        db = DB()
        db.update_inject_status(site, active=True)
    except Exception:
        pass

    if not has_schema:
        print(f"[ProdRank] {site} — {product} — Schema injected for first time")
    else:
        print(f"[ProdRank] {site} — {product} — already has Schema, skipped")

    return {"status": "ok"}


@router.post("/ping")
async def receive_audit_ping(request: Request):
    """Receive silent audit pings from sites using inject.js/inject-saas.js (v2 URL)."""
    return await _handle_ping(request)


@router.post("/inject/ping")
async def receive_audit_ping_legacy(request: Request):
    """Legacy compatibility: v1 inject scripts pinged to /api/inject/ping."""
    return await _handle_ping(request)
