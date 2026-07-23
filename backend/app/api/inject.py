"""Inject API — Serve inject.js and receive audit pings from JS-injected sites."""

import os
from fastapi import APIRouter, Request, Response
from fastapi.responses import FileResponse

router = APIRouter()

INJECT_JS_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "inject", "inject.js"
)


@router.get("/inject.js")
async def serve_inject_js():
    """Serve the universal Schema injection script."""
    # Try absolute path first, then relative
    paths = [
        INJECT_JS_PATH,
        "D:/site/prodrank/inject/inject.js",
        os.path.join(os.getcwd(), "inject", "inject.js"),
    ]
    for path in paths:
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
        content="/* ProdRank inject.js not found — check server configuration */",
        media_type="application/javascript",
        headers={"Access-Control-Allow-Origin": "*"},
    )


@router.post("/ping")
async def receive_audit_ping(request: Request):
    """Receive silent audit pings from sites using inject.js.
    Records which sites have Schema injected and which still need it."""
    try:
        body = await request.json()
    except Exception:
        return {"status": "ignored"}

    # In production: store ping data for analytics
    # For now: log and acknowledge
    site = body.get("site", "unknown")
    has_schema = body.get("has_schema", False)
    product = body.get("product_name", "?")

    if not has_schema:
        print(f"[ProdRank] {site} — {product} — Schema injected for first time")
    else:
        print(f"[ProdRank] {site} — {product} — already has Schema, skipped")

    return {"status": "ok"}
