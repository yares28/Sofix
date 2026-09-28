import { formatKickoff } from "../../lib/grid";
import { dateRange, type GameweekHead, type HeadCast, type HeadDay, type HeadGame, type HeadState } from "../../lib/home";
import { competitionName } from "../AwayWeek";
import SorareImage from "../play/SorareImage";

const score = (x: number) => x.toFixed(1);
const pct = (p: number) => `${Math.round(p * 100)}%`;

function gameLabel(game: HeadGame): string {
  const teams = `${game.team} ${game.venue === "H" ? "v" : "against"} ${game.opponent}`;
  const cards = game.players.map((player) => `${player.name}, ${pct(player.p)} chance to play`).join("; ");
  if (game.win == null) return `${teams}, ${competitionName(game.competition)}. Your cards: ${cards}`;
  const sheet = game.cleanSheet == null ? "" : `, ${pct(game.cleanSheet)} clean sheet`;
  return `${teams}, ${pct(game.win)} win${sheet}. Your cards: ${cards}`;
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
                <li key={card.name} aria-label={`${card.name}, ${pct(card.p)} chance to play, ${score(card.x)} xScore`}>
                  <span className={`hm-art ${card.rarity}`} aria-hidden="true">
                    <SorareImage src={card.pic} alt="" fill />
                    {card.cards > 1 ? <i className="hm-card-count">{card.cards}</i> : null}
                    <span className="hm-shine" />
                  </span>
                  <span className="who" aria-hidden="true">
                    <b>{score(card.x)}</b>
                    <span>{card.short} · xScore</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          {cast.games.length > 0 && (
            <div>
              <p className="hm-kicker">Your fixtures</p>
              <ol className="hm-best">
                {cast.games.map((game) => {
                  const best = game.players[0]!;
                  return (
                    <li key={game.key} aria-label={gameLabel(game)}>
                      <span className="hm-game-main">
                        <span className="sides">
                          <span className="side">
                            <SorareImage src={game.teamCrest} alt="" width={16} height={16} />
                            <b>{game.team}</b>
                          </span>
                          <span className="side opp">
                            <SorareImage src={game.opponentCrest} alt="" width={16} height={16} />
                            <span>
                              {game.venue === "H" ? "v" : "@"} {game.opponent}
                            </span>
                            <em>{competitionName(game.competition)}</em>
                          </span>
                        </span>
                        <span className="hm-game-cards" aria-hidden="true">
                          <span className="hm-mini-stack">
                            {game.players.slice(0, 3).map((player) => (
                              <span className={`hm-mini-card ${player.rarity}`} key={player.name}>
                                <SorareImage src={player.pic} alt="" fill />
                              </span>
                            ))}
                          </span>
                          <span className="hm-game-names">
                            {game.players.map((player) => player.short).join(", ")}
                            <small>{game.players.length === 1 ? "1 owned player" : `${game.players.length} owned players`}</small>
                          </span>
                        </span>
                      </span>
                      <span className="rates">
                        <span>
                          <b>{game.win == null ? pct(best.p) : pct(game.win)}</b>
                          <span>{game.win == null ? "Play" : "Win"}</span>
                        </span>
                        <span>
                          <b>{game.win == null ? score(best.x) : game.cleanSheet == null ? "–" : pct(game.cleanSheet)}</b>
                          <span>{game.win == null ? "xScore" : "Clean sheet"}</span>
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}
        </div>
      ) : null}
    </header>
  );
}
