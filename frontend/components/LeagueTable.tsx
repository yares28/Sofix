"use client";

import dynamic from "next/dynamic";
import Link from "./FootballLink";
import { useLayoutEffect, useMemo, useRef } from "react";
import { formatDay, formatShortKickoff, openingColumn, type TableMode } from "../lib/grid";
import { scoreColour } from "../lib/cards";
import { hasPredicted, nextGame, standings, type Split, type StandingMode, type StandingRow } from "../lib/standings";
import { zone, type Outcome } from "../lib/table";
import type { FixtureGrid, GridTeam } from "../lib/types";
import { competitionOf, isEuropean, leaguePhaseGrid, leagueName, type Competition } from "../lib/competitions";
import Crest from "./Crest";
import SegmentedControl from "./SegmentedControl";
// The chart pulls in a charting library: only the Table tab should pay for it, and only in the browser.
const TableProgression = dynamic(() => import("./TableProgression"), {
  ssr: false,
  loading: () => <div className="progression" aria-hidden="true" />,
});

interface Props {
  grid: FixtureGrid;
  through: number | null; // a gameweek picked by hand: the real table up to it. null = every result
  mode: TableMode; // Predicted only: "after" stops the chances at the week's round; anything else runs to the season's end
  onMode: (mode: TableMode) => void;
  standing: StandingMode;
  onStanding: (standing: StandingMode) => void;
  split: Split;
  onSplit: (split: Split) => void;
}

const OUTCOME_WORD: Record<Outcome, string> = { W: "won", D: "drew", L: "lost" };
const pct = (value: number) => (value >= 0.995 ? ">99%" : value > 0 && value < 0.005 ? "<1%" : `${Math.round(value * 100)}%`);

const TITLES: Record<StandingMode, string> = { actual: "LaLiga table", expected: "Expected table", predicted: "Predicted table" };
const SUBTITLES: Record<StandingMode, string> = {
  actual: "Points won so far.",
  expected: "Every game, played or not, at the strength the model gives each club today. It moves with form.",
  predicted: "The model's season before a ball was kicked. It never changes.",
};
const SPLIT_WORD: Record<Split, string> = { total: "", home: " · home games", away: " · away games" };

export default function LeagueTable({ grid, through, mode, onMode, standing, onStanding, split, onSplit }: Props) {
  const european = isEuropean(grid.competition);
  grid = leaguePhaseGrid(grid);
  const last = grid.matchdays.length - 1;
  const round = through ?? openingColumn(grid);
  const predictedReady = useMemo(() => hasPredicted(grid), [grid]);
  const shown: StandingMode = standing === "predicted" && !predictedReady ? "actual" : standing;
  const chances = shown !== "actual"; // the real table carries no forecasts
  const xdReady = grid.teams.some((team) => team.decisives); // an older payload, from before the field, has none
  // Only the pre-season prediction stops at a gameweek: the expected table is already today's form, after the last round.
  const afterRound = shown === "predicted" && mode === "after" && round < last;
  const stop = afterRound ? round : null;
  const rows = useMemo(() => standings(grid, { mode: shown, split, through, stop }), [grid, shown, split, through, stop]);
  const teams = useMemo(() => new Map(grid.teams.map((team) => [team.code, team])), [grid]);
  const size = rows.length;
  const maxPoints = Math.max(...rows.map((row) => Math.max(row.xPts, row.points)), 1);
  const gameweek = through === null ? undefined : grid.matchdays[through];
  const roundNumber = grid.matchdays[round]?.number;
  const by = afterRound ? `after GW${roundNumber}` : "at the end of the season";
  const body = useReorder(rows.map((row) => row.team.code).join());

  return (
    <section className="card league lt" aria-labelledby="table-title">
      <header className="lt-head">
        <div className="lt-title">
          <h2 id="table-title">
            {european ? `${leagueName(grid)} league phase${shown === "expected" ? " · expected finish" : ""}` : shown === "actual" ? tableTitle(gameweek).replace("LaLiga", leagueName(grid)) : TITLES[shown]}
            <span className="lt-split">{SPLIT_WORD[split]}</span>
          </h2>
          <p className="insight-meta">
            {european ? "League-phase results only. Expected finish adds remaining validated forecasts to points already won. Simulation ties use expected goal difference; discipline and coefficient ties remain shared in the actual table." : standing === "predicted" && !predictedReady
              ? "The pre-season prediction arrives with the next data refresh. Showing the real table until then."
              : SUBTITLES[shown]}
            {!european && !xdReady && " The xD per game arrives with the next data refresh."}
          </p>
        </div>
        <div className="lt-controls">
          <SegmentedControl<StandingMode>
            label="Which table"
            value={standing}
            onChange={onStanding}
            options={[
              { value: "actual", label: "Actual" },
              { value: "expected", label: "Expected" },
              ...(!european ? [{ value: "predicted" as const, label: "Predicted" }] : []),
            ]}
          />
          <SegmentedControl<Split>
            label="Games counted"
            value={split}
            onChange={onSplit}
            options={[
              { value: "total", label: "Total" },
              { value: "home", label: "Home" },
              { value: "away", label: "Away" },
            ]}
          />
          {shown === "predicted" && round < last && (
            <SegmentedControl<TableMode>
              label="Chances to"
              value={afterRound ? "after" : "current"}
              onChange={onMode}
              options={[
                { value: "current", label: "Season end" },
                { value: "after", label: `After GW${roundNumber}` },
              ]}
            />
          )}
        </div>
      </header>

      <div className="table-scroll">
        <table className={`standings lt-table ${shown}`}>
          <caption className="visually-hidden">
            {`${TITLES[shown].replace("LaLiga", leagueName(grid))}, ${leagueName(grid)} ${grid.season}${SPLIT_WORD[split]}, with ${chances ? `each club's chances ${by}, ` : ""}its next game`}
          </caption>
          <thead>
            <tr className="lt-groups" aria-hidden="true">
              <th colSpan={10} />
              {chances && <th colSpan={7} className="lt-group">Chances {by}</th>}
              <th colSpan={3} className="lt-group">xD per game</th>
              <th colSpan={2} className="lt-group">Next game</th>
            </tr>
            <tr>
              <th scope="col" className="num pos">#</th>
              <th scope="col" className="club">Club</th>
              <th scope="col" className="num"><abbr title="Played">P</abbr></th>
              <th scope="col" className="num"><abbr title="Won">W</abbr></th>
              <th scope="col" className="num"><abbr title="Drawn">D</abbr></th>
              <th scope="col" className="num"><abbr title="Lost">L</abbr></th>
              <th scope="col" className="num wide"><abbr title="Goals for and against">Goals</abbr></th>
              <th scope="col" className="num"><abbr title="Goal difference">GD</abbr></th>
              <th scope="col" className="num strong"><abbr title="Points">Pts</abbr></th>
              <th scope="col" className="form-col">Form</th>
              {chances && (
                <>
                  <th scope="col" className="num xpts lt-start">
                    <abbr title={`Expected points ${by}${SPLIT_WORD[split] ? `, ${split} games only` : ""}`}>xPts</abbr>
                  </th>
                  <th scope="col" className="num"><abbr title="Expected goal difference">xGD</abbr></th>
                  <th scope="col" className="num"><abbr title={`Chance of finishing first ${by}`}>{european ? "1st" : "Title"}</abbr></th>
                  <th scope="col" className="num"><abbr title={`Chance of finishing in the top ${european ? "eight" : "four"} ${by}`}>{european ? "Top 8" : competitionOf(grid.competition) === "PD" ? "UCL" : "Top 4"}</abbr></th>
                  <th scope="col" className="num"><abbr title={`Chance of finishing ${european ? "9th–24th" : "fifth"} ${by}`}>{european ? "9–24" : competitionOf(grid.competition) === "PD" ? "UEL" : "5th"}</abbr></th>
                  <th scope="col" className="num"><abbr title={`Chance of finishing ${european ? "in the top 24" : "sixth"} ${by}`}>{european ? "Top 24" : competitionOf(grid.competition) === "PD" ? "UECLQ" : "6th"}</abbr></th>
                  <th scope="col" className="num"><abbr title={european ? "Chance of finishing 25th–36th and elimination" : `Chance of direct relegation (bottom ${grid.competition === "BL1" ? "two" : "three"}) ${by}`}>{european ? "Out" : "REL"}</abbr></th>
                </>
              )}
              <th scope="col" className="num lt-start"><abbr title={`${XD_TITLE}. Attack: goals, assists, penalties won`}>Att</abbr></th>
              <th scope="col" className="num"><abbr title={`${XD_TITLE}. Defence: clearances off the line, last-man tackles`}>Def</abbr></th>
              <th scope="col" className="num"><abbr title={`${XD_TITLE}. Keeper: penalties saved, clean sheets`}>GK</abbr></th>
              <th scope="col" className="next-col lt-start">Next</th>
              <th scope="col" className="num"><abbr title="Fixture difficulty of the next game: lower is kinder">FDR</abbr></th>
            </tr>
          </thead>
          <tbody ref={body}>
            {rows.map((row, i) => (
              <Row
                key={row.team.code}
                row={row}
                size={size}
                index={i}
                moves={shown !== "actual"}
                maxPoints={maxPoints}
                chances={chances}
                teams={teams}
                competition={competitionOf(grid.competition)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <ul className="zone-key" aria-label="Table colours">
        <li className="zone-ucl">{european ? "1–8: Round of 16" : grid.competition && grid.competition !== "PD" ? "Top four" : "Champions League"}</li>
        {(!grid.competition || grid.competition === "PD") && <><li className="zone-uel">Europa League</li><li className="zone-uecl">Conference League play-off</li></>}
        {grid.competition === "BL1" && <li className="zone-uecl">Relegation play-off</li>}
        {european && <li className="zone-uel">9–24: Knockout play-off</li>}
        <li className="zone-rel">{european ? "25–36: Eliminated" : "Relegation"}</li>
      </ul>

      <TableProgression grid={grid} through={through} />
    </section>
  );
}

function Row({
  row, size, index, moves, maxPoints, chances, teams, competition,
}: {
  row: StandingRow;
  size: number;
  index: number;
  moves: boolean;
  maxPoints: number;
  chances: boolean;
  teams: Map<string, GridTeam>;
  competition: Competition;
}) {
  const z = zone(row.position, size, competition);
  const move = row.actualPosition - row.position;
  const next = nextGame(row.team);
  const opponent = next ? teams.get(next.opponent_code) : undefined;
  return (
    <tr data-code={row.team.code} className={z?.className} style={{ ["--i" as string]: index }}>
      <Position position={row.position} zoneLabel={z?.label} move={moves ? move : undefined} from={row.actualPosition} />
      <th scope="row" className="club"><ClubLink team={row.team} /></th>
      <td className="num">{row.played}</td>
      <td className="num">{row.won}</td>
      <td className="num">{row.drawn}</td>
      <td className="num">{row.lost}</td>
      <td className="num wide">{row.goalsFor}–{row.goalsAgainst}</td>
      <td className="num">{signed(row.goalDifference)}</td>
      <td className="num strong">{row.points}</td>
      <td className="form-col">
        <span className="form">
          {row.form.map((outcome, i) => (
            <span key={i} className={`form-chip ${outcome}`} aria-hidden="true">{outcome}</span>
          ))}
          <span className="visually-hidden">
            Last {row.form.length}: {row.form.map((o) => OUTCOME_WORD[o]).join(", ") || "no games"}
          </span>
        </span>
      </td>
      {chances && (
        <>
          <td className="num xpts lt-start">
            <span className="lt-xpts">
              <span className="st-track" aria-hidden="true">
                <i className="come" style={{ width: `${(row.xPts / maxPoints) * 100}%` }} />
              </span>
              <b>{row.xPts.toFixed(1)}</b>
            </span>
          </td>
          <td className="num">{signed(Math.round(row.xGD))}</td>
          <td className="num"><Chance value={row.title} /></td>
          <td className="num"><Chance value={row.ucl} /></td>
          <td className="num"><Chance value={row.uel} /></td>
          <td className="num"><Chance value={row.uecl} /></td>
          <td className="num"><Chance value={row.rel} bad /></td>
        </>
      )}
      <Decisives value={row.team.decisives} />
      <td className="next-col lt-start">
        {next && opponent ? (
          <Link
            href={`/team/${opponent.code}`}
            prefetch={false}
            className="lt-next"
            title={opponent.name}
            aria-label={`${next.venue === "H" ? "At home to" : "Away to"} ${opponent.name}, ${next.date_confirmed ? `${formatShortKickoff(next.kickoff_utc)} ${formatDay(next.kickoff_utc)}` : `${formatDay(next.kickoff_utc)}, date to be confirmed`}`}
          >
            <Crest team={opponent} size={22} />
          </Link>
        ) : (
          <span className="muted">Season over</span>
        )}
      </td>
      <td className="num">
        {next?.prediction ? (
          <span className={`difficulty-chip lt-fdr f${next.prediction.bucket}`} title={next.prediction.label}>
            {Math.round(next.prediction.difficulty)}
            <span className="visually-hidden">, {next.prediction.label}</span>
          </span>
        ) : (
          <span className="muted">–</span>
        )}
      </td>
    </tr>
  );
}

/**
 * Rows glide to their new place when the table is re-ranked (another reading, split or gameweek), so the eye can
 * follow a club. FLIP: measure before, measure after, animate the difference. Nothing moves under reduced motion.
 */
function useReorder(order: string) {
  const ref = useRef<HTMLTableSectionElement>(null);
  const tops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const rows = [...(ref.current?.querySelectorAll<HTMLTableRowElement>("tr[data-code]") ?? [])];
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    for (const row of rows) {
      const code = row.dataset.code!;
      const before = tops.current.get(code);
      const now = row.offsetTop;
      tops.current.set(code, now);
      if (still || before === undefined || before === now) continue;
      row.animate([{ transform: `translateY(${before - now}px)` }, { transform: "none" }], {
        duration: 420,
        easing: "cubic-bezier(.2,.8,.2,1)",
      });
    }
  }, [order]);
  return ref;
}

/** "Table after GW5" for a past gameweek that's done; "LaLiga table" otherwise. */
export function tableTitle(gameweek: { number: number; finished: boolean } | undefined): string {
  return gameweek?.finished ? `Table after GW${gameweek.number}` : "LaLiga table";
}

/** The badge is empty in Actual; elsewhere it says how far the club is from its real place. */
function Position({ position, zoneLabel, move, from }: { position: number; zoneLabel?: string; move?: number; from?: number }) {
  return (
    <td className="num pos">
      {position}
      <span className={`move ${move && move > 0 ? "up" : move && move < 0 ? "down" : ""}`} aria-hidden="true">
        {move === undefined ? "" : move > 0 ? `▲${move}` : move < 0 ? `▼${-move}` : ""}
      </span>
      {move !== undefined && (
        <span className="visually-hidden">{move ? `, ${Math.abs(move)} ${move > 0 ? "above" : "below"} its real place, ${from}` : ", same as its real place"}</span>
      )}
      {zoneLabel && <span className="visually-hidden">, {zoneLabel}</span>}
    </td>
  );
}

function ClubLink({ team }: { team: GridTeam }) {
  return (
    <Link href={`/team/${team.code}`} prefetch={false} className="club-link">
      <Crest team={team} size={22} />
      <span className="club-name">{team.name}</span>
    </Link>
  );
}

function Chance({ value, bad = false }: { value: number; bad?: boolean }) {
  const strength = Math.min(1, value);
  const band = !bad && value >= 0.36 ? scoreColour(value * 100) : null;
  return (
    <span
      className={`chance ${bad ? "bad" : ""} ${value < 0.005 ? "none" : ""} ${band ? "banded" : ""}`}
      style={{ ["--p" as string]: strength, ...(band ? { background: band.fill, color: band.ink } : {}) }}
    >
      {value < 0.005 ? "–" : pct(value)}
    </span>
  );
}

const XD_TITLE = "Decisive actions per game in Sorare's stats of every LaLiga game it has, whatever the split";

/** A club's decisive actions per game in Sorare's stats, by kind; a dash when Sorare's file does not have the club. */
function Decisives({ value }: { value: GridTeam["decisives"] }) {
  return (
    <>
      {[value?.attack, value?.defence, value?.keeper].map((n, i) => (
        <td key={i} className={`num${i === 0 ? " lt-start" : ""}`} title={value ? `Over ${value.games} games` : "No Sorare stats for this club"}>
          {n === undefined ? <span className="muted">–</span> : n.toFixed(2)}
        </td>
      ))}
    </>
  );
}

const signed = (value: number) => (value > 0 ? `+${value}` : String(value));
