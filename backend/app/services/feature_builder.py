from __future__ import annotations
from datetime import datetime, timezone, timedelta
from statistics import mean
from sqlalchemy.orm import Session
from app.models import Fixture,Team,TeamMatchStats,OddsSnapshot,WeatherSnapshot,ContextSnapshot,AvailabilitySnapshot,Player
from app.services.features import complete_missing

def avg(xs):
    xs=[float(x) for x in xs if x is not None]
    return mean(xs) if xs else None

def prior_rows(db:Session,team_id:int,before:datetime,n=20):
    return (db.query(TeamMatchStats).join(Fixture,Fixture.id==TeamMatchStats.fixture_id).filter(TeamMatchStats.team_id==team_id,Fixture.kickoff_utc<before,Fixture.status=="FINISHED").order_by(Fixture.kickoff_utc.desc()).limit(n).all())[::-1]

def ppg(rows): return avg([r.points_earned for r in rows])
def gd(rows): return avg([(r.goals_for-r.goals_against) for r in rows if r.goals_for is not None and r.goals_against is not None])
def diff_metric(rows,a,b): return avg([(getattr(r,a)-getattr(r,b)) for r in rows if getattr(r,a) is not None and getattr(r,b) is not None])

def latest_elo(rows):
    return rows[-1].post_match_elo if rows and rows[-1].post_match_elo is not None else 1500.0

def latest_snapshot(q,ts):
    return q.filter_by().filter(getattr(q.column_descriptions[0]["entity"],"available_at")<=ts).order_by(getattr(q.column_descriptions[0]["entity"],"available_at").desc()).first()

def build_features(db:Session,fx:Fixture,perspective_team_id:int,prediction_ts:datetime|None=None):
    ts=prediction_ts or datetime.now(timezone.utc)
    home=perspective_team_id==fx.home_team_id
    tid=perspective_team_id
    oid=fx.away_team_id if home else fx.home_team_id
    t=prior_rows(db,tid,fx.kickoff_utc,20); o=prior_rows(db,oid,fx.kickoff_utc,20)
    t5,t10=t[-5:],t[-10:]; o5,o10=o[-5:],o[-10:]
    tf= [r for r in t if r.is_home==home][-10:]
    of= [r for r in o if r.is_home!=(home)][-10:]
    elo_t,elo_o=latest_elo(t),latest_elo(o)
    hfa=65.0 if home else -65.0
    last_t=(db.query(Fixture).join(TeamMatchStats,Fixture.id==TeamMatchStats.fixture_id).filter(TeamMatchStats.team_id==tid,Fixture.kickoff_utc<fx.kickoff_utc,Fixture.status=="FINISHED").order_by(Fixture.kickoff_utc.desc()).first())
    last_o=(db.query(Fixture).join(TeamMatchStats,Fixture.id==TeamMatchStats.fixture_id).filter(TeamMatchStats.team_id==oid,Fixture.kickoff_utc<fx.kickoff_utc,Fixture.status=="FINISHED").order_by(Fixture.kickoff_utc.desc()).first())
    rest_t=(fx.kickoff_utc-last_t.kickoff_utc).total_seconds()/86400 if last_t else None
    rest_o=(fx.kickoff_utc-last_o.kickoff_utc).total_seconds()/86400 if last_o else None
    season_completed=db.query(Fixture).filter(Fixture.season==fx.season,Fixture.status=="FINISHED").count()
    total=max(1,db.query(Fixture).filter(Fixture.season==fx.season).count())
    team=db.get(Team,tid); opp=db.get(Team,oid)

    f={
      "is_home":1.0 if home else 0.0,
      "elo_team":elo_t,"elo_opponent":elo_o,"elo_diff":elo_t+hfa-elo_o,
      "rolling_ppg_5":ppg(t5),"rolling_ppg_10":ppg(t10),"rolling_gd_5":gd(t5),"rolling_gd_10":gd(t10),
      "home_ppg_10":ppg([r for r in t if r.is_home][-10:]),"away_ppg_10":ppg([r for r in t if not r.is_home][-10:]),
      "opponent_home_ppg_10":ppg([r for r in o if r.is_home][-10:]),"opponent_away_ppg_10":ppg([r for r in o if not r.is_home][-10:]),
      "rest_days_team":rest_t,"rest_days_opponent":rest_o,"rest_diff":(rest_t-rest_o) if rest_t is not None and rest_o is not None else None,
      "season_progress_pct":season_completed/total,
      "promoted_team_flag":1.0 if team and team.promoted_flag else 0.0,
      "opponent_promoted_flag":1.0 if opp and opp.promoted_flag else 0.0,
      "shots_diff_5":diff_metric(t5,"shots","shots_on_target"),  # proxy until opponent shot split is stored
      "shots_diff_10":diff_metric(t10,"shots","shots_on_target"),
      "xg_diff_5":avg([(r.xg_for-r.xg_against) for r in t5 if r.xg_for is not None and r.xg_against is not None]),
      "xg_diff_10":avg([(r.xg_for-r.xg_against) for r in t10 if r.xg_for is not None and r.xg_against is not None]),
      "npxg_diff_10":avg([(r.npxg_for-r.npxg_against) for r in t10 if r.npxg_for is not None and r.npxg_against is not None]),
      "xpts_10":avg([r.xpts for r in t10]),
      "ppda_diff_10":avg([r.ppda for r in t10])-avg([r.ppda for r in o10]) if avg([r.ppda for r in t10]) is not None and avg([r.ppda for r in o10]) is not None else None,
      "pressures_diff_10":avg([r.pressures for r in t10])-avg([r.pressures for r in o10]) if avg([r.pressures for r in t10]) is not None and avg([r.pressures for r in o10]) is not None else None,
    }
    for days in (7,14):
        cut=fx.kickoff_utc-timedelta(days=days)
        ct=db.query(Fixture).join(TeamMatchStats,Fixture.id==TeamMatchStats.fixture_id).filter(TeamMatchStats.team_id==tid,Fixture.kickoff_utc>=cut,Fixture.kickoff_utc<fx.kickoff_utc).count()
        co=db.query(Fixture).join(TeamMatchStats,Fixture.id==TeamMatchStats.fixture_id).filter(TeamMatchStats.team_id==oid,Fixture.kickoff_utc>=cut,Fixture.kickoff_utc<fx.kickoff_utc).count()
        f[f"matches_last_{days}d_team"]=ct; f[f"matches_last_{days}d_opponent"]=co

    odds=(db.query(OddsSnapshot).filter(OddsSnapshot.fixture_id==fx.id,OddsSnapshot.available_at<=ts).order_by(OddsSnapshot.available_at.desc()).first())
    if odds:
        if home:
            f.update(market_p_win=odds.home_prob,market_p_draw=odds.draw_prob,market_p_loss=odds.away_prob,market_overround=odds.overround)
        else:
            f.update(market_p_win=odds.away_prob,market_p_draw=odds.draw_prob,market_p_loss=odds.home_prob,market_overround=odds.overround)

    weather=(db.query(WeatherSnapshot).filter(WeatherSnapshot.fixture_id==fx.id,WeatherSnapshot.available_at<=ts).order_by(WeatherSnapshot.available_at.desc()).first())
    if weather:
        for k in ("temperature_c","apparent_temperature_c","humidity_pct","precipitation_mm","wind_speed_kmh","forecast_lead_hours"):
            f[k]=getattr(weather,k)

    ctx_t=(db.query(ContextSnapshot).filter(ContextSnapshot.fixture_id==fx.id,ContextSnapshot.team_id==tid,ContextSnapshot.prediction_ts<=ts).order_by(ContextSnapshot.prediction_ts.desc()).first())
    ctx_o=(db.query(ContextSnapshot).filter(ContextSnapshot.fixture_id==fx.id,ContextSnapshot.team_id==oid,ContextSnapshot.prediction_ts<=ts).order_by(ContextSnapshot.prediction_ts.desc()).first())
    if ctx_t:
        f.update(travel_km_team=ctx_t.travel_km,travel_km_last_7d_team=ctx_t.travel_km_last_7d,europe_midweek_team=float(ctx_t.europe_midweek_flag or 0),cup_midweek_team=float(ctx_t.cup_midweek_flag or 0),days_to_next_match_team=ctx_t.days_to_next_match,manager_change_30d_team=float(ctx_t.manager_change_30d or 0),manager_tenure_days_team=ctx_t.manager_tenure_days,squad_minutes_retained_pct_team=ctx_t.squad_minutes_retained_pct,title_race_team=float(ctx_t.title_race_flag or 0),relegation_race_team=float(ctx_t.relegation_race_flag or 0),derby_flag=float(ctx_t.derby_flag or 0))
    if ctx_o:
        f.update(travel_km_opponent=ctx_o.travel_km,travel_km_last_7d_opponent=ctx_o.travel_km_last_7d,europe_midweek_opponent=float(ctx_o.europe_midweek_flag or 0),cup_midweek_opponent=float(ctx_o.cup_midweek_flag or 0),days_to_next_match_opponent=ctx_o.days_to_next_match,manager_change_30d_opponent=float(ctx_o.manager_change_30d or 0),manager_tenure_days_opponent=ctx_o.manager_tenure_days,squad_minutes_retained_pct_opponent=ctx_o.squad_minutes_retained_pct,title_race_opponent=float(ctx_o.title_race_flag or 0),relegation_race_opponent=float(ctx_o.relegation_race_flag or 0))

    # Availability: latest per player, point-in-time safe.
    for who,prefix in ((tid,"team"),(oid,"opponent")):
        rows=db.query(AvailabilitySnapshot).filter(AvailabilitySnapshot.fixture_id==fx.id,AvailabilitySnapshot.available_at<=ts).all()
        latest={}
        for r in rows:
            if r.player_id not in latest or r.available_at>latest[r.player_id].available_at: latest[r.player_id]=r
        missing=[r for r in latest.values() if r.player_id and db.get(Player,r.player_id) and db.get(Player,r.player_id).team_id==who and (r.p_available or 0)<0.5]
        players=db.query(Player).filter(Player.team_id==who).all()
        total_value=sum((p.market_value_eur or 0) for p in players)
        miss_value=sum((db.get(Player,r.player_id).market_value_eur or 0) for r in missing)
        f[f"missing_market_value_share_{prefix}"]=miss_value/total_value if total_value>0 else None
        f[f"missing_minutes_share_{prefix}"]=None
        f[f"missing_starts_share_{prefix}"]=None
        f[f"missing_xg_share_{prefix}"]=None
        f[f"missing_xa_share_{prefix}"]=None
        f[f"missing_gk_strength_{prefix}"]=None

    # Poisson lambdas prefer xG; fall back to goals.
    team_for=avg([r.xg_for for r in t10]) or avg([r.goals_for for r in t10]) or 1.25
    team_against=avg([r.xg_against for r in t10]) or avg([r.goals_against for r in t10]) or 1.25
    opp_for=avg([r.xg_for for r in o10]) or avg([r.goals_for for r in o10]) or 1.25
    opp_against=avg([r.xg_against for r in o10]) or avg([r.goals_against for r in o10]) or 1.25
    f["expected_goals_for"]=max(.15,(team_for+opp_against)/2)
    f["expected_goals_against"]=max(.15,(team_against+opp_for)/2)
    return complete_missing(f)
