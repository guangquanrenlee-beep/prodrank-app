"""In-process per-IP rate limiting middleware.

Protects expensive endpoints (AI generation, AI agent queries) from
scrapers and abuse. Client IP comes from Cloudflare's CF-Connecting-IP
header, falls back to X-Forwarded-For / remote_addr. In-memory sliding
window — resets on restart, which is acceptable for a single-process app.

Shopify webhooks are exempt (server-to-server, HMAC-verified).
"""

import time
from collections import defaultdict, deque

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# (path prefix, max requests per window, window seconds) — first match wins.
_RULES: list[tuple[str, int, int]] = [
    ("/api/shopify/publish", 5, 60),       # AI generation — expensive
    ("/api/woocommerce/publish", 5, 60),
    ("/api/batch/", 5, 60),                # batch generation — expensive
    ("/api/rank/", 5, 60),                 # AI agent queries — expensive
    ("/api/audit/", 10, 60),
    ("/api/cms", 10, 60),
    ("/api/score/", 15, 60),
    ("/api/shopify/webhook", 0, 0),        # exempt — Shopify servers, HMAC-verified
    ("/api/woocommerce/webhook", 0, 0),
]

_hits: dict[str, deque] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    return (
        request.headers.get("cf-connecting-ip")
        or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        ip = _client_ip(request)
        now = time.time()

        for prefix, limit, window in _RULES:
            if not path.startswith(prefix):
                continue
            if window <= 0:
                break  # exempt
            key = ip + prefix
            q = _hits[key]
            while q and now - q[0] > window:
                q.popleft()
            if len(q) >= limit:
                return Response(
                    status_code=429,
                    content='{"detail":"Too many requests. Please try again in a minute."}',
                    media_type="application/json",
                    headers={"Retry-After": str(window)},
                )
            q.append(now)
            break
        return await call_next(request)
