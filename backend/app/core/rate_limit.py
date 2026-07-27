"""Simple in-memory rate limiter for free tools. 3 requests per IP per endpoint per day.
Admin users (whitelisted emails) bypass all rate limits."""

import time
from collections import defaultdict
from fastapi import Request, HTTPException

# { "ip:endpoint": [timestamp, timestamp, timestamp] }
_limits: dict[str, list[float]] = defaultdict(list)
MAX_FREE = 3
WINDOW = 86400  # 24 hours

# Admin emails — unlimited access to all features
ADMIN_EMAILS = {
    "361779519@qq.com",
}


def check_free_limit(request: Request):
    """Raise HTTPException if IP exceeded 3 requests for this endpoint today.
    Admin users (based on X-User-Email header) bypass all limits."""

    # Admin bypass — check header set by frontend
    user_email = request.headers.get("X-User-Email", "")
    if user_email in ADMIN_EMAILS:
        return  # unlimited

    ip = request.client.host if request.client else "unknown"
    endpoint = request.url.path
    key = f"{ip}:{endpoint}"

    now = time.time()
    _limits[key] = [t for t in _limits[key] if now - t < WINDOW]

    if len(_limits[key]) >= MAX_FREE:
        raise HTTPException(
            status_code=429,
            detail=f"Free limit reached: {MAX_FREE} per day. Sign up for unlimited access."
        )

    _limits[key].append(now)
