"""Monthly AI generation quota — anti-abuse layer shared by both platforms.

Rule: per store (shop/domain), per calendar month. A generation consumes
one unit (product generation or batch template generation). Editing,
publishing, verification, rollback are free and unlimited.

Plan quotas (subscriptions table by user — unbound stores default to free):
  free: 3 / month   pro: 50   growth: 200   agency: 500
"""

from datetime import datetime, timezone

from app.services.db import DB

PLAN_QUOTAS: dict[str, int] = {
    "free": 3,
    "pro": 50,
    "growth": 200,
    "agency": 500,
}

# Max stores a user may connect per plan (multi-store is a paid feature).
SITE_LIMITS: dict[str, int] = {
    "free": 1,
    "pro": 1,
    "growth": 3,
    "agency": 10,
}

DEFAULT_PLAN = "free"


def current_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _plan_for_shop(shop: str) -> str:
    """Resolve the plan for a store. Subscriptions are user-bound; stores
    connected without an account binding default to free. (Binding will be
    wired when OAuth/plugin connections get linked to users.)"""
    try:
        db = DB()
        sites = db.client.table("sites").select("user_id").eq("domain", shop).limit(1).execute().data
        user_id = sites[0].get("user_id") if sites else None
        if not user_id:
            return DEFAULT_PLAN
        subs = db.client.table("subscriptions").select("plan").eq("user_id", user_id).limit(1).execute().data
        if subs and subs[0].get("plan"):
            return subs[0]["plan"]
    except Exception:
        pass
    return DEFAULT_PLAN


def quota_for_shop(shop: str) -> tuple[str, int]:
    """Return (plan, monthly_quota) for a shop."""
    plan = _plan_for_shop(shop)
    return plan, PLAN_QUOTAS.get(plan, PLAN_QUOTAS[DEFAULT_PLAN])


def plan_for_user(user_id: str) -> str:
    """Resolve a user's plan from their subscription (defaults to free)."""
    try:
        db = DB()
        subs = db.client.table("subscriptions").select("plan").eq("user_id", user_id).limit(1).execute().data
        if subs and subs[0].get("plan"):
            return subs[0]["plan"]
    except Exception:
        pass
    return DEFAULT_PLAN


def count_user_sites(user_id: str) -> int:
    """How many stores this user has already bound to their account."""
    try:
        data = DB().client.table("sites").select("id").eq("user_id", user_id).execute().data
        return len(data)
    except Exception:
        return 0


def check_site_limit(user_id: str) -> tuple[bool, str | None, int, int]:
    """Can this user bind one more store?
    Returns (allowed, error_detail, current_count, limit)."""
    plan = plan_for_user(user_id)
    limit = SITE_LIMITS.get(plan, SITE_LIMITS[DEFAULT_PLAN])
    current = count_user_sites(user_id)
    if current >= limit:
        return (False, f"Plan limit reached: {current}/{limit} stores on your {plan} plan. Upgrade to add more stores.", current, limit)
    return (True, None, current, limit)


def check_quota(shop: str) -> tuple[bool, str | None, int, int]:
    """Check if the shop can still generate this month.
    Returns (allowed, error_detail, used, quota)."""
    month = current_month()
    used = DB().get_monthly_generations(shop, month)
    plan, quota = quota_for_shop(shop)
    if used >= quota:
        return (False, f"Monthly limit reached: {quota} AI generations for your {plan} plan. Upgrade or wait until next month.", used, quota)
    return (True, None, used, quota)


def consume_generation(shop: str, amount: int = 1) -> int:
    """Increment usage. Returns new total."""
    return DB().increment_monthly_generations(shop, current_month(), amount)
