import { formatKickoff } from "../../lib/grid";
import { dateRange, type GameweekHead, type HeadDay, type HeadState } from "../../lib/home";
import Crest from "../Crest";

const pct = (p: number) => `${Math.round(p * 100)}%`;

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

/** The gameweek as a card: the number, the shape of the week, and the one match worth naming. */
export default function HomeHead({ head }: { head: GameweekHead }) {
  const { state, spotlight } = head;
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

      {spotlight && (
        <div className="hm-spot">
          <div className={`hm-side home${spotlight.pick === "home" ? " pick" : ""}`}>
            <Crest team={spotlight.home} size={40} />
            <div className="hm-club">
              <b>{spotlight.home.code}</b>
              <span>{spotlight.home.name}</span>
            </div>
          </div>
          <div className="hm-call">
            {spotlight.score && (
              <b className="hm-score">
                {spotlight.score[0]}–{spotlight.score[1]}
              </b>
            )}
            {spotlight.chance !== null && <b className={spotlight.score ? "hm-given" : "hm-pct"}>{pct(spotlight.chance)}</b>}
            <span className="hm-kicker">{spotlight.label}</span>
            <span className="hm-detail">{spotlight.detail}</span>
            {spotlight.bar && (
              <span className="bar3" aria-hidden="true">
                <i className="h" style={{ flexGrow: spotlight.bar.home }} />
                <i className="d" style={{ flexGrow: spotlight.bar.draw }} />
                <i className="a" style={{ flexGrow: spotlight.bar.away }} />
              </span>
            )}
          </div>
          <div className={`hm-side away${spotlight.pick === "away" ? " pick" : ""}`}>
            <Crest team={spotlight.away} size={40} />
            <div className="hm-club">
              <b>{spotlight.away.code}</b>
              <span>{spotlight.away.name}</span>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
