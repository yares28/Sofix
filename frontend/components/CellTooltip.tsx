import { SHOCK, formatDay, formatKickoff, recordCopy } from "../lib/grid";
import type { CellRecord, GridCell, GridTeam } from "../lib/types";
import Crest from "./Crest";

const percent = (value: number) => `${Math.round(value * 100)}%`;

/**
 * What this club has done before at the price this fixture gives it, counted from five seasons of
 * bookmaker closing odds: the sentence first, then the counts and the band it covers.
 */
function RecordBlock({ record, chance, priced }: { record: CellRecord | null | undefined; chance: number | null; priced: boolean }) {
  const copy = recordCopy(record, chance, priced);
  return (
    <>
      <div className="tip-record">{copy.headline}</div>
      {copy.evidence && <div className="muted tip-note">{copy.evidence}</div>}
    </>
  );
}

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
  // A played game keeps the forecast it had before kickoff, and the review says how that forecast did.
  // `surprise` is 1 for an utterly ordinary result, so the number shown is the other way round.
  const review = cell.review;
  return (
    <>
      <div className="tip-title">
        {homeTeam && <Crest team={homeTeam} size={18} />}
        <b>{home}</b> v <b>{away}</b>
        {awayTeam && <Crest team={awayTeam} size={18} />}
      </div>
      <div className="muted">
        GW{matchday} · {when}
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
      {review && (
        <>
          <div className="tip-row">
            We gave this result {percent(review.outcome_chance)} · won {review.points} {review.points === 1 ? "pt" : "pts"}, expected{" "}
            {review.expected_points.toFixed(1)}
          </div>
          <div className="muted tip-note">
            Surprise {Math.round((1 - review.surprise) * 100)} of 100{review.surprise < SHOCK ? " · a shock" : ""}
          </div>
        </>
      )}
      {p && (
        <>
          <div className="tip-row">
            {review ? "We said: " : ""}Win {percent(p.probabilities.win)} · Draw {percent(p.probabilities.draw)} · Loss{" "}
            {percent(p.probabilities.loss)}
          </div>
          <div className="tip-row">
            {p.xg_for !== null && p.xg_against !== null && (
              <>
                xG {p.xg_for.toFixed(2)} – {p.xg_against.toFixed(2)}
              </>
            )}
            {p.clean_sheet !== null && <> · Clean sheet {percent(p.clean_sheet)}</>}
            {p.both_score !== null && p.both_score !== undefined && <> · Both score {percent(p.both_score)}</>}
          </div>
          <div className="muted">
            Difficulty {Math.round(p.difficulty)} · {p.label} · {p.expected_points.toFixed(1)} exp. pts
          </div>
        </>
      )}
      {p && <RecordBlock record={cell.record} chance={p.probabilities.win} priced={false} />}
      {cell.record_price && <RecordBlock record={cell.record_price} chance={cell.market?.win ?? null} priced />}
    </>
  );
}
