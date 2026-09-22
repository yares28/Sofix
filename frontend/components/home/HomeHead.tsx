import { formatKickoff, formatShortKickoff } from "../../lib/grid";
import { dateRange, type GameweekHead } from "../../lib/home";

const CLOCK = (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <circle cx="9" cy="9" r="6.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <path d="M9 5.2V9l2.6 1.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);
const TICK = (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path d="m4 9.5 3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** "Gameweek 8" and the page's one hero number: days to kickoff, games done while it's on, shocks once played. */
export default function HomeHead({ head }: { head: GameweekHead }) {
  const { state } = head;
  const weekday = formatShortKickoff(head.from).split(" ")[0];
  const count =
    state.kind === "upcoming" ? (
      <div className="hm-count">
        <span className="ic">{CLOCK}</span>
        <div>
          <div className="n">
            <b>{state.days > 0 ? state.days : state.hours}</b>
            <span>{state.days > 0 ? (state.days === 1 ? "day" : "days") : state.hours === 1 ? "hour" : "hours"}</span>
          </div>
          <small>
            to kickoff
            <br />
            {state.confirmed ? formatKickoff(state.kickoff) : `${formatKickoff(state.kickoff).split(",")[0]}, time TBC`}
          </small>
        </div>
      </div>
    ) : state.kind === "live" ? (
      <div className="hm-count live">
        <span className="ic">
          <span className="pulse" />
        </span>
        <div>
          <div className="n">
            <b>{state.played}</b>
            <span>of {state.total}</span>
          </div>
          <small>
            games played
            <br />
            gameweek under way
          </small>
        </div>
      </div>
    ) : (
      <div className="hm-count played">
        <span className="ic">{TICK}</span>
        <div>
          <div className="n">
            <b>{state.shocks}</b>
            <span>{state.shocks === 1 ? "shock" : "shocks"}</span>
          </div>
          <small>
            results we didn&rsquo;t expect
            <br />
            {state.total} games played
          </small>
        </div>
      </div>
    );
  return (
    <header className="hm-top">
      <div>
        <h1>Gameweek {head.number}</h1>
        <p className="hm-sub">
          <span>
            {weekday} {dateRange(head.from, head.to)}
          </span>
          <span className="dot" aria-hidden="true" />
          <span>{head.matches} matches</span>
        </p>
      </div>
      {count}
    </header>
  );
}
