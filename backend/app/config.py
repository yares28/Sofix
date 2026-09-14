from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    postgres_url: str = f"sqlite:///{(BACKEND_DIR / 'fixture.db').as_posix()}"
    # Direct (non-pooled) connection for schema migrations; falls back to postgres_url.
    postgres_migration_url: str = ""
    football_data_org_token: str = ""
    football_data_org_competition: str = "PD"
    dixon_coles_config_path: str = str(BACKEND_DIR / "artifacts" / "dixon_coles.json")
    history_cache_dir: str = str(BACKEND_DIR / "data" / "raw" / "football-data-co-uk")
    # Repo-root .env (shared with docker compose) first; backend/.env can override it.
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", BACKEND_DIR / ".env"), case_sensitive=False, extra="ignore"
    )


settings = Settings()
