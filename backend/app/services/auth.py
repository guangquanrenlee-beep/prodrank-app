"""Shared auth helpers."""


def user_id_from_auth(authorization: str) -> str | None:
    """Resolve the Supabase user id from an Authorization: Bearer <jwt> header.
    None if no/invalid token (callers decide: allow or 401)."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        return None
    try:
        from app.services.db import DB
        user = DB().client.auth.get_user(token)
        return user.user.id if user and user.user else None
    except Exception:
        return None
