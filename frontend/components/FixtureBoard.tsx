"use client";

import { useNavigationRouter } from "./navigation/NavigationProvider";

import { useEffect, useMemo } from "react";

import { useViewState } from "../hooks/useViewState";
import {
  horizonSize, openingColumn, selectedColumn, windowRange, type ViewState, type Horizon, type RunStats,
} from "../lib/grid";
import type { GameweekPlan } from "../lib/play";
import { roundBoard, tableAfter } from "../lib/recap";
import { RoundBoard, TableAfter } from "./recap/Recap";
import type { FixtureGrid, ModelNote } from "../lib/types";
import AwayWeek from "./AwayWeek";
import DifficultyGrid from "./DifficultyGrid";
import FixturesList from "./FixturesList";
import LeagueTable from "./LeagueTable";
import Overview from "./Overview";
import SeasonHero from "./SeasonHero";
import DifficultyHero, { DifficultyLegend } from "./DifficultyHero";
import { isEuropean, leagueName } from "../lib/competitions";

interface Props {
  baseline?: Record<string, RunStats>;
  grid: FixtureGrid;
  notes: ModelNote[];
  initialView: ViewState;
  pinsInUrl: boolean; // a shared link's pins win over the ones saved in this browser
  /** Set when the week in the bar holds no LaLiga round: there is nothing of ours to draw for it. */
  away: { plan: GameweekPlan | null; dates: string } | null;
}

export default function FixtureBoard({ grid, initialView, pinsInUrl, away, baseline }: Props) {
  const router = useNavigationRouter();
  const total = grid.matchdays.length;
  const opening = useMemo(() => openingColumn(grid), [grid]);
  const finished = useMemo(() => grid.matchdays.map((md) => md.finished), [grid]);
  const knownCodes = useMemo(() => new Set(grid.teams.map((team) => team.code)), [grid]);

  const { state, patch, togglePin } = useViewState(initialView, pinsInUrl, knownCodes, grid.competition);
  const { view, lens, horizon, pins } = state;
  const changeHorizon = (next: Horizon) => {
    if (grid.competition !== "ALL") return patch({ horizon: next });
    const params = new URLSearchParams(window.location.search);
    params.set("h", next);
    router.push(`/difficulty?${params}`, { scroll: false });
  };

  // One week drives every tab: the picker in the bar sets it, and the board opens on the round inside it.
  const column = selectedColumn(grid.matchdays, state.gw, opening);
  const { start, end } = windowRange(total, column, horizonSize(horizon, total));
  // The table follows the gameweek only once one is picked by hand: results up to it, and the projection
  // stopped there too. Left alone it shows every result so far and the projection to the end of the season.
  const tableThrough = state.gw === null ? null : column;
  // A link to a gameweek this season doesn't have falls back to the opening one; drop it from the URL too.
  const unknownGw = state.gw !== null && !grid.matchdays.some((md) => md.number === state.gw);
  useEffect(() => {
    if (unknownGw) patch({ gw: null });
  }, [unknownGw, patch]);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <>
      {view === "table" && !away ? <SeasonHero grid={grid} /> : null}
      {/* On the table the season hero above replaces this one; hidden, not removed, so the board keeps its layout code in one place. */}
      <section className="hero" hidden={(view === "table" || view === "fdr") && !away}>
        <div>
          <div className="eyebrow">{leagueName(grid)} · Season {grid.season}</div>
          <h1>{view === "table" ? "Table" : view === "plain" ? "Fixtures" : "Fixtures & Difficulty"}</h1>
        </div>
      </section>

      {away ? (
        <>
          {view !== "table" && <AwayWeek plan={away.plan} dates={away.dates} variant={view === "plain" ? "fixtures" : "difficulty"} />}
          {view === "table" && (
            <>
              <p className="ow-note" role="status">
                LaLiga isn&apos;t playing this week — the table is as it stands.
              </p>
              <LeagueTable
                grid={grid} through={tableThrough} mode={state.table} onMode={(table) => patch({ table })}
                standing={state.standing} onStanding={(standing) => patch({ standing })}
                split={state.split} onSplit={(split) => patch({ split })}
              />
            </>
          )}
        </>
      ) : (
        <>
      {view === "plain" && (
        <>
          {/* The round at a glance: each match as a scoreboard, and the table it leaves behind (plans/restructure.md, R4). */}
          {grid.matchdays[column] ? (
            <div className="rc-grid lg-round">
              <RoundBoard matches={roundBoard(grid, column)} />
              <TableAfter rows={tableAfter(grid, column)} round={grid.matchdays[column].number} href="/table" />
            </div>
          ) : null}
          <FixturesList grid={grid} column={column} />
        </>
      )}

      {view === "table" && <LeagueTable
                grid={grid} through={tableThrough} mode={state.table} onMode={(table) => patch({ table })}
                standing={state.standing} onStanding={(standing) => patch({ standing })}
                split={state.split} onSplit={(split) => patch({ split })}
              />}

      {view === "fdr" && (
        <>
          {/* Canvas board 5: the kindest run first, then the grid; the overview cards follow so nothing is cut. */}
          <DifficultyHero grid={grid} start={start} end={end} />
          <div className="board-stack">
            <DifficultyGrid
              grid={grid}
              start={start}
              end={end}
              lens={lens}
              horizon={horizon}
              pins={pins}
              onHorizon={changeHorizon}
              onLens={(next) => patch({ lens: next })}
              onTogglePin={togglePin}
            />
            <DifficultyLegend />
          </div>

          <Overview
            baseline={baseline}
            grid={grid}
            column={column}
            tableThrough={tableThrough}
            finished={finished}
            lens={lens}
            horizon={horizon}
            tableMode={state.table}
            pins={pins}
            onHorizon={changeHorizon}
            onLens={(next) => patch({ lens: next })}
            onTableMode={(table) => patch({ table })}
            onTogglePin={togglePin}
            onOpenMatches={() => {
              patch({ horizon: "next" });
              scrollTo("grid");
            }}
            onOpenTable={() => {
              patch({ view: "table" });
              window.scrollTo({ top: 0 });
            }}
          />
        </>
      )}

      {view === "table" && state.table !== "current" && (
        <p className="footnote">
          Predictions use the rating model’s win, draw and loss chances for every remaining fixture; postponed games without
          a new date aren’t included. {isEuropean(grid.competition) ? "League-phase first, top-eight and elimination chances come from 5,000 simulations." : "Title, top-4 and relegation chances come from 5,000 simulated seasons."}
        </p>
      )}
        </>
      )}
      {isEuropean(grid.competition) ? <p className="footnote attribution">Fixtures, regulation results and crests: UEFA. Player outcomes: Sorare. Validated model {grid.model_version}. Qualifiers excluded; no live bookmaker odds.</p> : view !== "fdr" && <p className="footnote attribution">
        Model {grid.model_version ?? "not run yet"}. Fixtures, results and crests: football-data.org. Match history and
        the record at each price: football-data.co.uk. Odds: The Odds API.
      </p>}
      {grid.competition === "ALL" && <p className="footnote" role="note">Conference forecasts are provisional. The other competitions retain their independently fitted models.</p>}
    </>
  );
}
