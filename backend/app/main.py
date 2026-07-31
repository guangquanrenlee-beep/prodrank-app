"""ProdRank API — FastAPI application entry point."""

# Load .env BEFORE any other imports (so os.getenv() works in all modules)
from dotenv import load_dotenv
load_dotenv()

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import audit, rank, shopify, shopify_publish, shopify_webhook, woocommerce_publish, optimize, intelligence, recommendation, citation, detect, score, integrations, guidance, monitor, tasks, email_api, admin_api, social, marketplace, knowledge_api, reports_api, dashboard_api


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup/shutdown events."""
    yield


app = FastAPI(
    title="ProdRank API",
    description="AI Agent Commerce SEO — Monitor and optimize product visibility in AI agents",
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://prodrank.app", "https://*.prodrank.pages.dev", "http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(audit.router, prefix="/api/audit", tags=["Audit"])
app.include_router(rank.router, prefix="/api/rank", tags=["Rank"])
app.include_router(shopify.router, prefix="/api/shopify", tags=["Shopify"])
app.include_router(shopify_publish.router, prefix="/api/shopify", tags=["Shopify Publish"])
app.include_router(shopify_webhook.router, prefix="/api/shopify/webhook", tags=["Shopify Webhooks"])
app.include_router(woocommerce_publish.router, prefix="/api/woocommerce", tags=["WooCommerce Publish"])
app.include_router(optimize.router, prefix="/api/optimize", tags=["Optimize"])
app.include_router(intelligence.router, prefix="/api/intel", tags=["Intelligence"])
app.include_router(recommendation.router, prefix="/api/rec", tags=["Recommendation"])
app.include_router(citation.router, prefix="/api/cite", tags=["Citation"])
app.include_router(detect.router, prefix="/api", tags=["Detect"])
app.include_router(score.router, prefix="/api", tags=["Score"])
app.include_router(integrations.router, prefix="/api/integrations", tags=["Integrations"])
app.include_router(guidance.router, prefix="/api", tags=["Guidance"])
app.include_router(monitor.router, prefix="/api", tags=["Monitor"])
app.include_router(tasks.router, prefix="/api/tasks", tags=["Tasks"])
app.include_router(email_api.router, prefix="/api/email", tags=["Email"])
app.include_router(admin_api.router, prefix="/api/admin", tags=["Admin"])
app.include_router(social.router, prefix="/api/social", tags=["Social Listening"])
app.include_router(marketplace.router, prefix="/api/marketplace", tags=["Source Marketplace"])
app.include_router(knowledge_api.router, prefix="/api/knowledge", tags=["Knowledge Base"])
app.include_router(reports_api.router, prefix="/api/reports", tags=["Reports"])
app.include_router(dashboard_api.router, prefix="/api/dashboard", tags=["Dashboard AI"])


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "prodrank"}


@app.post("/api/dev/reset-password")
async def dev_reset_password(email: str, password: str):
    """Dev-only: reset a user password via Supabase admin. Remove before production."""
    from supabase import create_client
    from app.core.config import get_settings
    s = get_settings()
    client = create_client(s.supabase_url, s.supabase_service_key)
    users = client.auth.admin.list_users()
    for u in users:
        if u.email == email:
            client.auth.admin.update_user_by_id(u.id, {"password": password, "email_confirm": True})
            return {"ok": True, "email": email, "id": u.id}
    # Create new user if not found
    try:
        resp = client.auth.admin.create_user({"email": email, "password": password, "email_confirm": True})
        return {"ok": True, "email": email, "id": resp.user.id, "created": True}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}
