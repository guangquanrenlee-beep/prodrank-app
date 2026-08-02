"""App Store readiness tests — OAuth callback security + GDPR webhooks.

Run from backend/ (needs .env for Supabase + SHOPIFY_CLIENT_SECRET):
  cd backend && python ../test/test_shopify_appstore.py

Covers:
  1. verify_hmac accepts a valid signature, rejects tampered/forged ones
  2. /callback rejects requests with invalid HMAC (before any DB access)
  3. /callback rejects stale callbacks (>1h timestamp)
  4. GDPR webhooks ack with 200 (HMAC-verified, nonexistent shop → no-op)
"""

import base64
import hashlib
import hmac
import json
import os
import sys
import time
from urllib.parse import urlencode

sys.path.insert(0, os.path.dirname(__file__) + "/../backend")

os.environ.setdefault("SHOPIFY_CLIENT_SECRET", "appstore-test-secret")
os.environ.setdefault("SHOPIFY_CLIENT_ID", "test-client-id")

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
PASS, FAIL = 0, 0


def check(name: str, ok: bool, detail: str = ""):
    global PASS, FAIL
    if ok:
        PASS += 1
        print(f"  ✅ {name}")
    else:
        FAIL += 1
        print(f"  ❌ {name} — {detail}")


def oauth_hmac(params: dict) -> str:
    """Shopify-style HMAC: hexdigest over sorted k=v pairs (excluding hmac)."""
    s = "&".join(f"{k}={v}" for k, v in sorted(params.items()))
    return hmac.new(b"appstore-test-secret", s.encode(), hashlib.sha256).hexdigest()


def webhook_hmac(body: bytes) -> str:
    d = hmac.new(b"appstore-test-secret", body, hashlib.sha256).digest()
    return base64.b64encode(d).decode()


def oauth_params(**over) -> dict:
    p = {"code": "abc123", "shop": "test-store.myshopify.com",
         "state": "test-state-123", "timestamp": str(int(time.time()))}
    p.update(over)
    return p


print("── 1. verify_hmac ──")
from app.services.shopify_service import ShopifyService

params = oauth_params()
sig = oauth_hmac(params)
check("valid signature accepted", ShopifyService.verify_hmac({**params, "hmac": sig}, "appstore-test-secret"))
check("tampered param rejected",
      not ShopifyService.verify_hmac({**params, "hmac": sig, "shop": "evil.com"}, "appstore-test-secret"))
check("wrong secret rejected",
      not ShopifyService.verify_hmac({**params, "hmac": sig}, "wrong-secret"))

print("── 2. /callback — invalid HMAC rejected before DB ──")
r = client.get("/api/shopify/callback", params=oauth_params(hmac="forged"))
check("400 on forged HMAC", r.status_code == 400, f"got {r.status_code}")

print("── 3. /callback — stale timestamp rejected ──")
old = oauth_params(timestamp=str(int(time.time()) - 7200))
sig_old = oauth_hmac({k: v for k, v in old.items()})
r = client.get("/api/shopify/callback", params={**old, "hmac": sig_old})
check("400 on >1h stale callback", r.status_code == 400, f"got {r.status_code}")

print("── 4. GDPR webhooks — valid HMAC → 200 (nonexistent shop, no-op) ──")
for topic in ("customers/data_request", "customers/redact", "shop/redact"):
    body = json.dumps({"shop_domain": "no-such-shop.myshopify.com", "shop_id": 1}).encode()
    r = client.post(f"/api/shopify/webhook/{topic}",
                    content=body,
                    headers={"X-Shopify-Hmac-Sha256": webhook_hmac(body),
                             "X-Shopify-Shop-Domain": "no-such-shop.myshopify.com"})
    check(f"{topic} → {r.status_code}", r.status_code == 200, r.text)

print("── 5. GDPR webhooks — bad HMAC → 401 ──")
r = client.post("/api/shopify/webhook/shop/redact", content=b"{}",
                headers={"X-Shopify-Hmac-Sha256": "bad", "X-Shopify-Shop-Domain": "x.com"})
check("forged HMAC → 401", r.status_code == 401, f"got {r.status_code}")

# Note: /install can't be unit-tested here without a live oauth_state column
# (migration 015) — it writes the state nonce to Supabase before returning.

print(f"\n结果: {PASS} 通过 / {FAIL} 失败")
sys.exit(1 if FAIL else 0)
