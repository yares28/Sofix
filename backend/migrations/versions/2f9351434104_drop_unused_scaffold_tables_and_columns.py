"""drop unused scaffold tables and columns

Removes tables and columns the live pipeline never reads (their code was deleted in the
scaffold cleanup), replaces plain indexes with named unique constraints on
fixtures.source_fixture_id and weather_snapshots.fixture_id, and re-keys source_entity_map
on source_id instead of source_name.

Data impact: every dropped table was empty except team_match_stats, which was rebuilt from
finished fixtures on each sync and read by nothing.

Revision ID: 2f9351434104
Revises: 5c4cbb29092d
Create Date: 2026-09-14
"""
from typing import Sequence, Union

from alembic import op

revision: str = "2f9351434104"
down_revision: Union[str, Sequence[str], None] = "5c4cbb29092d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Postgres named the baseline's unnamed unique constraint automatically.
OLD_ENTITY_MAP_UNIQUE_PG = "source_entity_map_entity_type_source_source_name_key"
# SQLite batch mode needs a naming convention to address reflected, unnamed constraints.
SQLITE_NAMING = {"uq": "uq_%(table_name)s_%(column_0_N_name)s"}


def is_sqlite() -> bool:
    return op.get_bind().dialect.name == "sqlite"


def upgrade() -> None:
    # Child tables first (foreign keys).
    for table in ("availability_snapshots", "player_match", "players", "context_snapshots",
                  "feature_snapshots", "odds_snapshots", "team_match_stats"):
        op.drop_table(table)

    with op.batch_alter_table("fixtures") as batch:
        batch.drop_index("ix_fixtures_source_fixture_id")
        batch.create_unique_constraint("uq_fixtures_source_fixture_id", ["source_fixture_id"])
        batch.drop_column("referee_name")
        batch.drop_column("postponed_flag")

    with op.batch_alter_table("weather_snapshots") as batch:
        batch.drop_index("ix_weather_snapshots_fixture_id")
        batch.create_unique_constraint("uq_weather_snapshots_fixture_id", ["fixture_id"])

    with op.batch_alter_table("predictions") as batch:
        batch.drop_index("ix_predictions_fixture_id")  # duplicated by the (fixture, team, model) unique key
        batch.drop_column("difficulty_percentile")

    with op.batch_alter_table("stadiums") as batch:
        batch.drop_column("city")
        batch.drop_column("altitude_m")

    with op.batch_alter_table("teams") as batch:
        batch.drop_column("promoted_flag")
        batch.drop_column("promoted_from_tier")

    if is_sqlite():
        with op.batch_alter_table("source_entity_map", recreate="always", naming_convention=SQLITE_NAMING) as batch:
            batch.drop_constraint("uq_source_entity_map_entity_type_source_source_name", type_="unique")
            batch.create_unique_constraint("uq_source_entity_map_source_id", ["entity_type", "source", "source_id"])
    else:
        op.drop_constraint(OLD_ENTITY_MAP_UNIQUE_PG, "source_entity_map", type_="unique")
        op.create_unique_constraint("uq_source_entity_map_source_id", "source_entity_map", ["entity_type", "source", "source_id"])


def downgrade() -> None:
    # Irreversible: the dropped tables and columns held no data the app uses. To go back, restore the
    # database from a Neon branch or snapshot taken before this migration.
    raise NotImplementedError("2f9351434104 drops scaffold tables and cannot be downgraded")
