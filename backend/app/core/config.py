from pydantic_settings import BaseSettings
from functools import lru_cache
from dotenv import load_dotenv

# Load .env into os.environ so ALL modules can use os.getenv()
load_dotenv()


class Settings(BaseSettings):
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/prodrank"
    redis_url: str = "redis://localhost:6379/0"
    debug: bool = True
    secret_key: str = "dev-secret"
    shopify_client_id: str = ""
    shopify_client_secret: str = ""
    app_url: str = "https://prodrank.app"
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_key: str = ""
    admin_key: str = ""  # X-Admin-Key for internal data panels — set in production .env

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache()
def get_settings() -> Settings:
    return Settings()
