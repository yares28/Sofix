"""add teams.crest_url (football-data.org crest)

Revision ID: 0cf90ef068a8
Revises: 7b1d2e8c4a90
Create Date: 2026-09-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0cf90ef068a8"
down_revision: str | Sequence[str] | None = "7b1d2e8c4a90"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Nullable, no default: a metadata-only change on Postgres (no table rewrite, no long lock).
    with op.batch_alter_table("teams", schema=None) as batch_op:
        batch_op.add_column(sa.Column("crest_url", sa.String(length=255), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("teams", schema=None) as batch_op:
        batch_op.drop_column("crest_url")
