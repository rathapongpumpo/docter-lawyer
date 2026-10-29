"""Runtime settings, read from the environment (see .env.example)."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore", case_sensitive=False)

    app_env: str = "dev"
    log_level: str = "info"

    # web <-> ai shared secret (AI_SERVICE_TOKEN_PREVIOUS accepted during rotation)
    ai_service_token: str = Field(min_length=16)
    ai_service_token_previous: str = ""

    db_host: str = "postgres"
    db_port: int = 5432
    db_name: str = "legal_consult"
    db_user: str = "lc_ai"
    db_password: str = ""
    db_sslmode: str = "disable"
    db_pool_min: int = 1
    db_pool_max: int = 10

    embed_url: str = "http://embed-m3:8080"
    embed_dim: int = 1024
    # Staging preview of kb content that is still `draft` (never in prod — see validate_env below)
    kb_serve_drafts: bool = False
    rag_topk_dense: int = 40
    rag_topk_lexical: int = 40
    rag_rrf_k: int = 60

    # PromptNow company knowledge base (chatbot API) — supplementary, off by default (app/external/company_kb.py)
    pnc_enabled: bool = False
    pnc_chatbot_url: str = ""
    pnc_chatbot_key: str = ""
    pnc_timeout_s: float = 20.0
    pnc_allow_org: bool = False            # organization workspaces never reach an outside system unless this is on
    pnc_primary: bool = False              # true = company KB first; our library answers only on error / not found

    # Contract review (M12, app/contracts/review.py): off | mock (simulated, never in prod) | http (company review API)
    contract_review_backend: str = "off"
    contract_review_url: str = ""
    contract_review_key: str = ""
    contract_review_timeout_s: float = 60.0

    heartbeat_seconds: float = 15.0
    answer_chunk_delay_seconds: float = 0.03

    def model_post_init(self, _context: object) -> None:
        if self.app_env == "prod" and self.kb_serve_drafts:
            raise ValueError("KB_SERVE_DRAFTS must be false in prod: draft content is not reviewed "
                             "(CLAUDE.md §2.1 rule 4)")

    @property
    def db_conninfo(self) -> str:
        return (
            f"host={self.db_host} port={self.db_port} dbname={self.db_name} "
            f"user={self.db_user} password={self.db_password} sslmode={self.db_sslmode} "
            "application_name=lc-ai"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
