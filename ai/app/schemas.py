"""Request / header models shared by the API layer (docs/03-technical-spec.md §3.5)."""

from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

ScopeCode = Annotated[str, StringConstraints(pattern=r"^[A-Z]+(\.[A-Z0-9_]+)*$")]


class UserContext(BaseModel):
    """Parsed `X-LC-User` header. The web tier is the trust boundary; ai trusts these values."""

    model_config = ConfigDict(extra="ignore")

    user_id: int | None = None
    guest_id: UUID | None = None
    role: Literal["guest", "member", "editor", "reviewer", "admin"] = "member"
    is_anonymous: bool = False
    locale: Literal["th", "en"] = "th"
    explain_level: Literal["simple", "normal", "expert"] | None = None
    org_id: UUID | None = None

    @field_validator("user_id", mode="before")
    @classmethod
    def _user_id_from_string(cls, v: object) -> object:
        # Better Auth serialises ids as strings; bigint ids arrive as "42".
        if isinstance(v, str):
            if not v.isdigit():
                raise ValueError("user_id must be numeric")
            return int(v)
        return v

    @model_validator(mode="after")
    def _one_owner(self) -> "UserContext":
        if (self.user_id is None) == (self.guest_id is None):
            raise ValueError("exactly one of user_id or guest_id is required")
        if self.org_id is not None and self.user_id is None:
            raise ValueError("org_id requires user_id")
        return self


class ChatContext(BaseModel):
    source_type: Literal["lesson", "article", "law_section", "guide", "template", "case", "court_tool", "contract"]
    source_id: str = Field(min_length=1, max_length=200)


class ChatStreamRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    chat_id: UUID | None = None
    regenerate: bool = False
    scope: Literal["auto"] | list[ScopeCode] = "auto"
    explain_level: Literal["simple", "normal", "expert"] | None = None
    context: ChatContext | None = None
    as_of: date | None = None

    @field_validator("chat_id", mode="before")
    @classmethod
    def _empty_chat_id(cls, v: object) -> object:
        return None if v in ("", None) else v

    @field_validator("message")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("message must not be blank")
        return v
