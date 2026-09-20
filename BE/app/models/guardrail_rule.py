import uuid

from sqlalchemy import Boolean, CheckConstraint, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.base import TimestampMixin


class GuardrailRule(Base, TimestampMixin):
    """BR-54 content guardrail: `banned` terms block the save outright,
    `trademark` terms require the user's copyright confirmation."""

    __tablename__ = "guardrail_rules"
    __table_args__ = (
        CheckConstraint("kind IN ('banned', 'trademark')", name="ck_guardrail_rules_kind"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    term: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)  # stored normalized
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
