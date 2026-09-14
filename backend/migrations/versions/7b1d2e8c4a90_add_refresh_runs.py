"""add refresh_runs (run history and concurrency lock)

Revision ID: 7b1d2e8c4a90
Revises: 2f9351434104
Create Date: 2026-09-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "7b1d2e8c4a90"
down_revision: str | Sequence[str] | None = "2f9351434104"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "refresh_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("trigger", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("step", sa.String(length=32), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("details", sa.JSON(), nullable=True),
    )
    op.create_index("ix_refresh_runs_started_at", "refresh_runs", ["started_at"])
    op.create_index(
        "uq_refresh_runs_one_running",
        "refresh_runs",
        ["status"],
        unique=True,
        postgresql_where=sa.text("status = 'running'"),
        sqlite_where=sa.text("status = 'running'"),
    )


def downgrade() -> None:
    op.drop_index("uq_refresh_runs_one_running", table_name="refresh_runs")
    op.drop_index("ix_refresh_runs_started_at", table_name="refresh_runs")
    op.drop_table("refresh_runs")
