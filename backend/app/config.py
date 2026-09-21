from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    # "dev" enables the interactive API docs; anything deployed should run with APP_ENV=prod.
    app_env: Literal["dev", "prod"] = "dev"
    postgres_url: str = f"sqlite:///{(BACKEND_DIR / 'fixture.db').as_posix()}"
    # Direct (non-pooled) connection for schema migrations; falls back to postgres_url.
    postgres_migration_url: str = ""
    football_data_org_token: str = ""
    football_data_org_competition: str = "PD"
    # The Odds API (free Starter plan, 500 credits/month). Without it the odds step is skipped.
    odds_api_key: str = ""
    dixon_coles_config_path: str = str(BACKEND_DIR / "artifacts" / "dixon_coles.json")
    clean_sheet_calibration_path: str = str(BACKEND_DIR / "artifacts" / "clean_sheet_calibration.json")
    market_blend_path: str = str(BACKEND_DIR / "artifacts" / "market_blend.json")
    opening_projection_path: str = str(BACKEND_DIR / "artifacts" / "opening_projection.json")
    history_cache_dir: str = str(BACKEND_DIR / "data" / "raw" / "football-data-co-uk")
    # Shared secret between the Next.js server and POST /api/admin/refresh (≥ 32 bytes, or the endpoint stays off).
    refresh_token: str = ""
    # After a refresh the job asks the web app to reload its cached pages (POST {APP_URL}/api/revalidate).
    # Without APP_URL or REVALIDATE_SECRET that call is skipped; the app still picks the data up within an hour.
    app_url: str = ""
    revalidate_secret: str = ""
    # Vercel Deployment Protection locks the app to its owner; jobs pass this secret to get through.
    vercel_bypass_secret: str = ""
    # Repo-root .env first; an optional backend/.env can override it.
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", BACKEND_DIR / ".env"), case_sensitive=False, extra="ignore"
    )


settings = Settings()
