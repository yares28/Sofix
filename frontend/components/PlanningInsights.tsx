import { LENS_COPY, bestTargets, formatTotal, rotationPair, type RunStats } from "../lib/grid";
import type { GridMatchday, GridTeam, Lens } from "../lib/types";
import Crest from "./Crest";

interface Props {
  teams: GridTeam[];
  stats: Map<string, RunStats>;
  matchdays: GridMatchday[];
  start: number;
  end: number;
  lens: Lens;
  pins: readonly string[];
  onTogglePin: (code: string) => void;
  onPin: (codes: string[]) => void;
}

const MAX_CHIPS = 6;

interface ScheduleNote {
  team: GridTeam;
  kind: "blank" | "double";
  matchday: number;
}

/** Three compact, clickable answers for the visible window; they follow the lens and the pins. */
export default function PlanningInsights({ teams, stats, matchdays, start, end, lens, pins, onTogglePin, onPin }: Props) {
  const copy = LENS_COPY[lens];
  const finished = matchdays.map((md) => md.finished);
  const windowLabel = end - start === 1 ? "next matchday" : `next ${end - start}`;
  const targets = bestTargets(teams, stats, 3);
  const pair = rotationPair(teams, start, end, lens, finished, pins);

  const schedule = teams.flatMap((team) =>
    team.cells.slice(start, end).flatMap<ScheduleNote>((cells, i) => {
      const md = matchdays[start + i];
      if (!md || md.finished) return [];
      if (cells.length === 0) return [{ team, kind: "blank", matchday: md.number }];
      if (cells.length > 1) return [{ team, kind: "double", matchday: md.number }];
      return [];
    }),
  );

  if (targets.length === 0) {
    return (
      <section className="insights single" aria-label="Planning insights">
        <article className="card insight">
          <div className="insight-label">No upcoming fixtures in this window</div>
          <div className="insight-meta">Move the window forward to see predictions.</div>
        </article>
      </section>
    );
  }

  return (
    <section className="insights" aria-label="Planning insights">
      <article className="card insight">
        <h2 className="insight-label">Best targets · {windowLabel}</h2>
        <ol className="chip-list">
          {targets.map(({ team, stats: s }) => (
            <li key={team.code}>
              <button
                type="button"
                className="team-chip"
                aria-pressed={pins.includes(team.code)}
                onClick={() => onTogglePin(team.code)}
                aria-label={`${team.name}: ${formatTotal(s.total!)} ${copy.totalLong}. ${pins.includes(team.code) ? "Unpin" : "Pin"}`}
              >
                <Crest team={team} size={20} />
                <span className="chip-name">{team.name}</span>
                <span className="chip-value">{formatTotal(s.total!)}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className="insight-meta">{copy.total} over the window · blanks count 0</div>
      </article>

      <article className="card insight">
        <h2 className="insight-label">Blanks &amp; doubles</h2>
        {schedule.length === 0 ? (
          <div className="insight-empty">Every team plays once per matchday in this window.</div>
        ) : (
          <ul className="chip-list wrap">
            {schedule.slice(0, MAX_CHIPS).map(({ team, kind, matchday }) => (
              <li key={`${team.code}-${kind}-${matchday}`}>
                <button
                  type="button"
                  className={`team-chip small ${kind}`}
                  aria-pressed={pins.includes(team.code)}
                  onClick={() => onTogglePin(team.code)}
                  aria-label={`${team.name} ${kind === "blank" ? "has no game" : "plays twice"} in matchday ${matchday}. ${pins.includes(team.code) ? "Unpin" : "Pin"}`}
                >
                  <Crest team={team} size={18} />
                  {team.code}
                  <span className="chip-value">{kind === "blank" ? "blank" : "×2"} MD{matchday}</span>
                </button>
              </li>
            ))}
            {schedule.length > MAX_CHIPS && <li className="chip-more">+{schedule.length - MAX_CHIPS} more</li>}
          </ul>
        )}
      </article>

      <article className="card insight">
        <h2 className="insight-label">Rotation pair{pins.length ? " · with your pins" : ""}</h2>
        {pair ? (
          <>
            <button
              type="button"
              className="team-chip pair"
              onClick={() => onPin([pair.first.code, pair.second.code])}
              aria-label={`${pair.first.name} and ${pair.second.name}: ${formatTotal(pair.total)} ${copy.totalLong} playing the better fixture each week. Pin both`}
            >
              <Crest team={pair.first} size={20} />
              <span className="chip-name">{pair.first.name}</span>
              <span className="pair-plus" aria-hidden="true">+</span>
              <Crest team={pair.second} size={20} />
              <span className="chip-name">{pair.second.name}</span>
            </button>
            <div className="insight-meta">
              {formatTotal(pair.total)} {copy.total} starting the better fixture each week
            </div>
          </>
        ) : (
          <div className="insight-empty">Pin fewer teams to find a pair.</div>
        )}
      </article>
    </section>
  );
}
