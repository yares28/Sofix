import { cellLabel, formatDay } from "../lib/grid";
import { pointsTrend, seasonEntries, venueSplit, type TrendPoint, type VenueSplit } from "../lib/team";
import type { FixtureGrid, GridTeam } from "../lib/types";

interface Props {
  grid: FixtureGrid;
  team: GridTeam;
}

/** Full-season strip, points trend and home/away split for one team (server-rendered, no client JS). */
export default function TeamSeason({ grid, team }: Props) {
  const entries = seasonEntries(grid, team);
  const names = new Map(grid.teams.map((t) => [t.code, t.name]));
  const trend = pointsTrend(entries);
  const split = venueSplit(entries);
  const nextFive = trend.filter((p) => p.kind === "expected").slice(0, 5);
  const played = trend.filter((p) => p.kind === "actual");

  return (
    <>
      <section className="team-stats" aria-label="Summary">
        <Stat label="Points so far" value={String(played.reduce((s, p) => s + p.value, 0))} detail={`${played.length} played`} />
        <Stat
          label="Expected, next 5"
          value={nextFive.length ? nextFive.reduce((s, p) => s + p.value, 0).toFixed(1) : "—"}
          detail={nextFive.length ? `${nextFive.length} games · max ${nextFive.length * 3}` : "No games left"}
        />
        <Stat
          label="Home · away difficulty"
          value={`${formatDifficulty(split.H.averageDifficulty)} · ${formatDifficulty(split.A.averageDifficulty)}`}
          detail="Average of games to come, 0–100"
        />
      </section>

      <section className="card team-section">
        <h2>Season</h2>
        <ol className="season-strip">
          {entries.map(({ matchday, cell }, i) => {
            const opponent = cell ? (names.get(cell.opponent_code) ?? cell.opponent_code) : "";
            if (!cell) {
              return (
                <li key={`${matchday.number}-blank-${i}`} className="season-tile blank">
                  <span className="season-md">GW{matchday.number}</span>
                  <span className="season-opp">—</span>
                  <span className="visually-hidden">Gameweek {matchday.number}: no game</span>
                </li>
              );
            }
            const label = cellLabel(cell, team.name, matchday.number, opponent, "overall");
            const tone = cell.status === "finished" && cell.result
              ? `result ${cell.result.outcome}`
              : cell.prediction
                ? `f${cell.prediction.bucket}`
                : "muted";
            return (
              <li key={cell.fixture_id} className={`season-tile ${tone}`} title={label}>
                <span className="season-md" aria-hidden="true">GW{matchday.number}</span>
                <span className="season-opp" aria-hidden="true">
                  {cell.opponent_code}
                  <small>{cell.venue}</small>
                </span>
                <span className="season-sub" aria-hidden="true">
                  {cell.result ? `${cell.result.goals_for}–${cell.result.goals_against}` : cell.prediction ? `${cell.prediction.expected_points.toFixed(1)} pts` : formatDay(cell.kickoff_utc)}
                </span>
                <span className="visually-hidden">{label}</span>
              </li>
            );
          })}
        </ol>
        <p className="team-note">Played games show the score; games to come show expected points and the difficulty colour.</p>
      </section>

      <section className="card team-section">
        <h2>Points per game</h2>
        <TrendChart points={trend} />
      </section>

      <section className="card team-section">
        <h2>Home and away</h2>
        <div className="table-scroll">
          <table className="split-table">
            <caption className="visually-hidden">{team.name} record so far and outlook, home and away</caption>
            <thead>
              <tr>
                <th scope="col">Venue</th>
                <th scope="col">Played</th>
                <th scope="col">W–D–L</th>
                <th scope="col">Goals</th>
                <th scope="col">Points</th>
                <th scope="col">To come</th>
                <th scope="col">Exp. pts</th>
                <th scope="col">Avg difficulty</th>
              </tr>
            </thead>
            <tbody>
              {(["H", "A"] as const).map((venue) => (
                <SplitRow key={venue} row={split[venue]} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function formatDifficulty(value: number | null): string {
  return value === null ? "—" : String(Math.round(value));
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="card team-stat">
      <div className="insight-label">{label}</div>
      <div className="team-stat-value">{value}</div>
      <div className="insight-meta">{detail}</div>
    </div>
  );
}

function SplitRow({ row }: { row: VenueSplit }) {
  return (
    <tr>
      <th scope="row">{row.venue === "H" ? "Home" : "Away"}</th>
      <td>{row.played}</td>
      <td>
        {row.won}–{row.drawn}–{row.lost}
      </td>
      <td>
        {row.goalsFor}–{row.goalsAgainst}
      </td>
      <td>{row.points}</td>
      <td>{row.upcoming}</td>
      <td>{row.upcoming ? row.expectedPoints.toFixed(1) : "—"}</td>
      <td>{formatDifficulty(row.averageDifficulty)}</td>
    </tr>
  );
}

const CHART = { width: 760, height: 200, left: 30, right: 12, top: 12, bottom: 28 };

/** Points won per played game (dots) and expected points per game to come (line), on a 0–3 scale. */
function TrendChart({ points }: { points: TrendPoint[] }) {
  if (points.length === 0) return <p className="team-note">No games yet.</p>;
  const innerW = CHART.width - CHART.left - CHART.right;
  const innerH = CHART.height - CHART.top - CHART.bottom;
  const x = (i: number) => CHART.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (value: number) => CHART.top + innerH - (value / 3) * innerH;
  const expected = points.map((p, i) => ({ p, i })).filter(({ p }) => p.kind === "expected");
  const path = expected.map(({ p, i }, k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const everyNth = Math.ceil(points.length / 12);
  const summary = `${points.filter((p) => p.kind === "actual").length} played games and ${expected.length} expected.`;

  return (
    <div className="chart-scroll">
      <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} className="trend-chart" role="img" aria-label={`Points per game this season. ${summary}`}>
        {[0, 1, 2, 3].map((tick) => (
          <g key={tick}>
            <line x1={CHART.left} x2={CHART.width - CHART.right} y1={y(tick)} y2={y(tick)} className="grid-line" />
            <text x={CHART.left - 8} y={y(tick) + 4} textAnchor="end" className="axis-label">
              {tick}
            </text>
          </g>
        ))}
        {path && <path d={path} className="trend-line" />}
        {points.map((p, i) => (
          <circle key={`${p.matchday}-${i}`} cx={x(i)} cy={y(p.value)} r={p.kind === "actual" ? 4.5 : 3} className={`trend-dot ${p.kind}`}>
            <title>
              GW{p.matchday} {p.venue === "H" ? "v" : "at"} {p.opponent}: {p.kind === "actual" ? `${p.value} pts won` : `${p.value.toFixed(2)} expected pts`}
            </title>
          </circle>
        ))}
        {points.map((p, i) =>
          i % everyNth === 0 ? (
            <text key={`label-${i}`} x={x(i)} y={CHART.height - 8} textAnchor="middle" className="axis-label">
              {p.matchday}
            </text>
          ) : null,
        )}
      </svg>
      <div className="chart-legend" aria-hidden="true">
        <span><i className="trend-dot actual" /> Points won</span>
        <span><i className="trend-line-key" /> Expected points</span>
        <span className="muted">Gameweek along the bottom</span>
      </div>
    </div>
  );
}
