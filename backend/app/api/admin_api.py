"""Admin API — Server setup and configuration (no auth, localhost only)."""

import os
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter()


class SetupEnvRequest(BaseModel):
    SHOPIFY_CLIENT_ID: str = ""
    SHOPIFY_CLIENT_SECRET: str = ""
    RESEND_API_KEY: str = ""


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
