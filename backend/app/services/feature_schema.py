CORE = [
 "is_home","elo_team","elo_opponent","elo_diff",
 "rolling_ppg_5","rolling_ppg_10","rolling_gd_5","rolling_gd_10",
 "home_ppg_10","away_ppg_10","opponent_home_ppg_10","opponent_away_ppg_10",
 "rest_days_team","rest_days_opponent","rest_diff",
 "matches_last_7d_team","matches_last_7d_opponent","matches_last_14d_team","matches_last_14d_opponent",
 "season_progress_pct","promoted_team_flag","opponent_promoted_flag"
]
PERFORMANCE = [
 "shots_diff_5","shots_diff_10","sot_diff_5","sot_diff_10",
 "xg_diff_5","xg_diff_10","npxg_diff_10","xpts_10",
 "possession_diff_10","ppda_diff_10","pressures_diff_10",
 "finishing_overperf_10","goalkeeping_overperf_10","set_piece_proxy_diff_10"
]
AVAILABILITY = [
 "missing_minutes_share_team","missing_minutes_share_opponent",
 "missing_starts_share_team","missing_starts_share_opponent",
 "missing_market_value_share_team","missing_market_value_share_opponent",
 "missing_xg_share_team","missing_xg_share_opponent",
 "missing_xa_share_team","missing_xa_share_opponent",
 "missing_gk_strength_team","missing_gk_strength_opponent",
 "predicted_xi_strength_team","predicted_xi_strength_opponent",
 "rotation_risk_team","rotation_risk_opponent"
]
SCHEDULE = [
 "travel_km_team","travel_km_opponent","travel_km_last_7d_team","travel_km_last_7d_opponent",
 "europe_midweek_team","europe_midweek_opponent","cup_midweek_team","cup_midweek_opponent",
 "days_to_next_match_team","days_to_next_match_opponent",
 "derby_flag","manager_change_30d_team","manager_change_30d_opponent",
 "manager_tenure_days_team","manager_tenure_days_opponent",
 "squad_minutes_retained_pct_team","squad_minutes_retained_pct_opponent",
 "title_race_team","title_race_opponent","relegation_race_team","relegation_race_opponent"
]
MARKET = ["market_p_win","market_p_draw","market_p_loss","market_overround"]
WEATHER = ["temperature_c","apparent_temperature_c","humidity_pct","precipitation_mm","wind_speed_kmh","forecast_lead_hours","stadium_altitude_m"]
REF_H2H = ["referee_cards_per_match","referee_penalties_per_match","h2h_points_share_5","h2h_goal_diff_5"]
ALL_FEATURES = CORE+PERFORMANCE+AVAILABILITY+SCHEDULE+MARKET+WEATHER+REF_H2H
