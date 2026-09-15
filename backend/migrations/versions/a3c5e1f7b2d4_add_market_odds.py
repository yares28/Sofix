"""add market_odds (bookmaker consensus per upcoming fixture)

Revision ID: a3c5e1f7b2d4
Revises: 0cf90ef068a8
Create Date: 2026-09-15
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a3c5e1f7b2d4"
down_revision: str | Sequence[str] | None = "0cf90ef068a8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # A new, empty table: no existing rows are touched.
    op.create_table(
        "market_odds",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("fixture_id", sa.Integer(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("bookmakers", sa.Integer(), nullable=False),
        sa.Column("p_home", sa.Float(), nullable=False),
        sa.Column("p_draw", sa.Float(), nullable=False),
        sa.Column("p_away", sa.Float(), nullable=False),
        sa.Column("p_over_2_5", sa.Float(), nullable=True),
        sa.Column("home_goals", sa.Float(), nullable=False),
        sa.Column("away_goals", sa.Float(), nullable=False),
        sa.ForeignKeyConstraint(["fixture_id"], ["fixtures.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("fixture_id", name="uq_market_odds_fixture_id"),
    )
    with op.batch_alter_table("market_odds", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_market_odds_fetched_at"), ["fetched_at"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("market_odds", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_market_odds_fetched_at"))
    op.drop_table("market_odds")
