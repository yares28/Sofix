import { formatDay, formatKickoff } from "../lib/grid";
import type { GridCell, GridTeam } from "../lib/types";
import Crest from "./Crest";

const percent = (value: number) => `${Math.round(value * 100)}%`;

interface Props {
  team: GridTeam;
  cell: GridCell;
  matchday: number;
  teams: Map<string, GridTeam>;
}

export default function CellTooltip({ team, cell, matchday, teams }: Props) {
  const opponentTeam = teams.get(cell.opponent_code);
  const opponent = opponentTeam?.name ?? cell.opponent_code;
  const [home, away] = cell.venue === "H" ? [team.name, opponent] : [opponent, team.name];
  const [homeTeam, awayTeam] = cell.venue === "H" ? [team, opponentTeam] : [opponentTeam, team];
  const when = cell.date_confirmed ? formatKickoff(cell.kickoff_utc) : `Date TBC · weekend of ${formatDay(cell.kickoff_utc)}`;
  const p = cell.prediction;
  const w = cell.weather;
  return (
    <>
      <div className="tip-title">
        {homeTeam && <Crest team={homeTeam} size={18} />}
        <b>{home}</b> v <b>{away}</b>
        {awayTeam && <Crest team={awayTeam} size={18} />}
      </div>
      <div className="muted">
        MD{matchday} · {when}
        {cell.rescheduled && " · moved"}
      </div>
      {cell.result && (
        <div>
          Final{" "}
          {cell.venue === "H"
            ? `${cell.result.goals_for}–${cell.result.goals_against}`
            : `${cell.result.goals_against}–${cell.result.goals_for}`}
          <span className="muted">
            {" "}
            · {team.name} {cell.result.outcome === "W" ? "won" : cell.result.outcome === "D" ? "drew" : "lost"}
          </span>
        </div>
      )}
      {p && (
        <>
          <div className="tip-row">
            Win {percent(p.probabilities.win)} · Draw {percent(p.probabilities.draw)} · Loss {percent(p.probabilities.loss)}
          </div>
          <div className="tip-row">
            {p.xg_for !== null && p.xg_against !== null && (
              <>
                xG {p.xg_for.toFixed(2)} – {p.xg_against.toFixed(2)}
              </>
            )}
            {p.clean_sheet !== null && <> · Clean sheet {percent(p.clean_sheet)}</>}
          </div>
          <div className="muted">
            Difficulty {Math.round(p.difficulty)} · {p.label} · {p.expected_points.toFixed(1)} exp. pts
          </div>
        </>
      )}
      {w && w.temperature_c !== null && (
        <div className="muted">
          {Math.round(w.temperature_c)}°C · {(w.precipitation_mm ?? 0).toFixed(1)} mm rain · {Math.round(w.wind_kmh ?? 0)} km/h wind
        </div>
      )}
    </>
  );
}
