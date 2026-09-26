import { formatKickoff } from "../../lib/grid";
import { dateRange, type GameweekHead, type HeadCast, type HeadDay, type HeadGame, type HeadState } from "../../lib/home";
import { competitionName } from "../AwayWeek";
import SorareImage from "../play/SorareImage";

const score = (x: number) => x.toFixed(1);
const pct = (p: number) => `${Math.round(p * 100)}%`;

function gameLabel(game: HeadGame): string {
  const teams = `${game.club} ${game.venue === "H" ? "v" : "against"} ${game.opponent}`;
  if (game.win == null) return `${teams}, ${competitionName(game.competition)}`;
  const sheet = game.cleanSheet == null ? "" : `, ${pct(game.cleanSheet)} clean sheet`;
  return `${teams}, ${pct(game.win)} win${sheet}`;
}

function dayTone(day: HeadDay, state: HeadState, index: number): string {
  if (day.done === day.matches) return "done";
  if (state.kind === "live") return "now";
  if (state.kind === "upcoming" && index === 0) return "next";
  if (day.done < day.matches && state.kind === "played") return "next";
  return "";
}

function kickoffLine(state: Extract<HeadState, { kind: "upcoming" }>): string {
  const when = formatKickoff(state.kickoff);
  return state.confirmed ? when : `${when.split(",")[0]}, time TBC`;
}

/** The gameweek as a card: the number, the shape of the week, then your best cards and their best games. */
export default function HomeHead({ head, cast }: { head: GameweekHead; cast: HeadCast | "none" | null }) {
  const { state } = head;
  const unit =
    state.kind === "upcoming"
      ? state.days > 0
        ? state.days === 1
          ? "day"
          : "days"
        : state.hours === 1
          ? "hour"
          : "hours"
      : state.kind === "live"
        ? `of ${state.total}`
        : state.shocks === 1
          ? "shock"
          : "shocks";
  const figure = state.kind === "upcoming" ? (state.days > 0 ? state.days : state.hours) : state.kind === "live" ? state.played : state.shocks;

  return (
    <header className={`hm-top ${state.kind}`}>
      <div className="hm-id">
        <h1>
          <span className="hm-kicker">Gameweek </span>
          <b>{head.number}</b>
        </h1>
        <p className="hm-when">{dateRange(head.from, head.to)}</p>
      </div>

      {head.days.length > 0 && (
        <ol className="hm-days" aria-label="Matches by day">
          {head.days.map((day, index) => (
            <li key={day.label} className={dayTone(day, state, index)} aria-label={`${day.weekday} ${day.label}, ${day.matches} ${day.matches === 1 ? "match" : "matches"}`}>
              <span className="wd">{day.weekday}</span>
              <b>{day.day}</b>
              <span className="pips" aria-hidden="true">
                {Array.from({ length: day.matches }, (_, i) => (
                  <i key={i} style={{ animationDelay: `${i * 40}ms` }} />
                ))}
              </span>
            </li>
          ))}
        </ol>
      )}

      <div className="hm-count">
        <div className="n">
          <b>{figure}</b>
          <span>{unit}</span>
        </div>
        {state.kind === "upcoming" ? (
          <small>
            to kickoff
            <span className="when">{kickoffLine(state)}</span>
          </small>
        ) : state.kind === "live" ? (
          <small>
            <span className="live-tag">
              <span className="pulse" />
              games played
            </span>
          </small>
        ) : (
          <small>
            unexpected
            <span className="when">{state.total} played</span>
          </small>
        )}
      </div>

      {cast === "none" ? (
        <p className="hm-spot hm-spot-empty">None of your cards play this week.</p>
      ) : cast ? (
        <div className="hm-spot">
          <div>
            <p className="hm-kicker">
              Best cards
              {cast.named ? <span>Sorare GW{cast.gw}</span> : null}
            </p>
            <ol className="hm-cast">
              {cast.cards.map((card) => (
                <li key={card.name} aria-label={`${card.name}, projected ${score(card.x)}`}>
                  <span className={`hm-art ${card.rarity}`} aria-hidden="true">
                    <SorareImage src={card.pic} alt="" fill />
                    <span className="hm-shine" />
                  </span>
                  <span className="who" aria-hidden="true">
                    <b>{score(card.x)}</b>
                    <span>{card.short}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          {cast.games.length > 0 && (
            <div>
              <p className="hm-kicker">Best games</p>
              <ol className="hm-best">
                {cast.games.map((game) => (
                  <li key={game.key} aria-label={gameLabel(game)}>
                    <span className="sides">
                      <span className="side">
                        <SorareImage src={game.clubCrest} alt="" width={16} height={16} />
                        <b>{game.club}</b>
                      </span>
                      <span className="side opp">
                        <SorareImage src={game.opponentCrest} alt="" width={16} height={16} />
                        <span>
                          {game.venue === "H" ? "v" : "@"} {game.opponent}
                        </span>
                      </span>
                    </span>
                    {game.win == null ? (
                      <span className="comp">{competitionName(game.competition)}</span>
                    ) : (
                      <span className="rates">
                        <span>
                          <b>{pct(game.win)}</b>
                          <span>Win</span>
                        </span>
                        <span>
                          <b>{game.cleanSheet == null ? "—" : pct(game.cleanSheet)}</b>
                          <span>Clean sheet</span>
                        </span>
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      ) : null}
    </header>
  );
}
