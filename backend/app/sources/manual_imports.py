# Structured schemas for useful data that should come from an authorized source/export.

AVAILABILITY_COLUMNS=[
 "fixture_id","player_id","snapshot_ts","available_at","status","absence_reason","injury_type",
 "expected_return_date","p_available","p_start_if_available","source","source_confidence"
]
XG_COLUMNS=[
 "fixture_id","team_id","xg_for","xg_against","npxg_for","npxg_against","xpts","ppda","pressures","provider","available_at"
]
SQUAD_COLUMNS=["player_id","team_id","position_group","market_value_eur","snapshot_ts","available_at","source"]
MANAGER_COLUMNS=["team_id","manager_name","manager_start_date","snapshot_ts","available_at","source"]
