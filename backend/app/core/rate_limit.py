"""Simple in-memory rate limiter for free tools. 3 requests per IP per endpoint per day."""
import time
from collections import defaultdict
from fastapi import Request, HTTPException

# { "ip:endpoint": [timestamp, timestamp, timestamp] }
_limits: dict[str, list[float]] = defaultdict(list)
MAX_FREE = 3
WINDOW = 86400  # 24 hours


def check_free_limit(request: Request):
    """Raise HTTPException if IP exceeded 3 requests for this endpoint today."""
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
