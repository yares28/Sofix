"use client";

import { useEffect, useMemo } from "react";
import { useViewState } from "../hooks/useViewState";
import {
  LENS_COPY, MIDFIELD_ATTACK_WEIGHT, horizonSize, openingColumn, selectedColumn, windowRange, type View, type ViewState,
} from "../lib/grid";
import type { GameweekPlan } from "../lib/play";
import type { FixtureGrid, ModelNote } from "../lib/types";
import AwayWeek from "./AwayWeek";
import DifficultyGrid from "./DifficultyGrid";
import FixturesList from "./FixturesList";
import LeagueTable from "./LeagueTable";
import Overview from "./Overview";
import SegmentedControl from "./SegmentedControl";

interface Props {
  grid: FixtureGrid;
  notes: ModelNote[];
  initialView: ViewState;
  pinsInUrl: boolean; // a shared link's pins win over the ones saved in this browser
  /** Set when the week in the bar holds no LaLiga round: there is nothing of ours to draw for it. */
  away: { plan: GameweekPlan | null; dates: string } | null;
}

export default function FixtureBoard({ grid, notes, initialView, pinsInUrl, away }: Props) {
  const total = grid.matchdays.length;
  const opening = useMemo(() => openingColumn(grid), [grid]);
  const finished = useMemo(() => grid.matchdays.map((md) => md.finished), [grid]);
  const knownCodes = useMemo(() => new Set(grid.teams.map((team) => team.code)), [grid]);

  const { state, patch, togglePin } = useViewState(initialView, pinsInUrl, knownCodes);
  const { view, lens, horizon, pins } = state;

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
  const copy = LENS_COPY[lens];

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const lensNotes = notes.filter((note) => note.lens === null || note.lens === lens);

  return (
    <>
      <section className="hero">
        <div>
          <div className="eyebrow">LaLiga · Season {grid.season}</div>
          <h1>{view === "table" ? "Table" : view === "plain" ? "Fixtures" : "Fixtures & Difficulty"}</h1>
        </div>
        <div className="hero-controls">
          <div className="board-tabs">
            <SegmentedControl<View>
              label="View"
              size="lg"
              value={view}
              onChange={(next) => patch({ view: next })}
              options={[
                { value: "plain", label: "Fixtures" },
                { value: "fdr", label: "Difficulty" },
                { value: "table", label: "Table" },
              ]}
            />
          </div>
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
              <LeagueTable grid={grid} through={tableThrough} mode={state.table} onMode={(table) => patch({ table })} />
            </>
          )}
        </>
      ) : (
        <>
      {view === "plain" && <FixturesList grid={grid} column={column} />}

      {view === "table" && <LeagueTable grid={grid} through={tableThrough} mode={state.table} onMode={(table) => patch({ table })} />}

      {view === "fdr" && (
        <>
          <Overview
            grid={grid}
            column={column}
            tableThrough={tableThrough}
            finished={finished}
            lens={lens}
            horizon={horizon}
            tableMode={state.table}
            pins={pins}
            onHorizon={(next) => patch({ horizon: next })}
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

          <div className="board-stack">
            <DifficultyGrid
              grid={grid}
              start={start}
              end={end}
              lens={lens}
              horizon={horizon}
              pins={pins}
              onHorizon={(next) => patch({ horizon: next })}
              onLens={(next) => patch({ lens: next })}
              onTogglePin={togglePin}
            />
            <FixturesList grid={grid} column={column} />
          </div>

          <p className="footnote">
            Every card, the grid and the fixtures start from the selected gameweek. Totals add up game by game: blank weeks
            count 0 and double weeks count both games. Picks: forwards by expected goals, defenders and keepers by expected
            clean sheets, midfielders by both (goals weighted {Math.round(MIDFIELD_ATTACK_WEIGHT * 100)}%). Most and fewest
            points coming compare expected points per game, which mostly finds the strongest and weakest clubs; softest and
            hardest schedule compare the window with the club&rsquo;s own level over the rest of its season.
          </p>
          <p className="footnote">
            Odds (Next and Next 3): bookmaker consensus from The Odds API with the margin removed. Win, draw and loss are
            priced by bookmakers; scoring, clean-sheet, conceding and both-teams-to-score odds are implied by those prices and
            the over/under 2.5 line. A played game keeps the forecast it carried before kickoff, with the chance the board gave
            the result in the corner of its tile. {horizon === "next" ? "Match cards use the rating model." : `${copy.hint}.`} Click a club name to open
            its season, a pick or a pin to keep a club on top of the grid.
          </p>
          {(horizon === "next" ? notes : lensNotes).map((note) => (
            <p key={note.text} className="footnote note">
              Model note: {note.text}
            </p>
          ))}
        </>
      )}

      {view === "table" && state.table === "predicted" && (
        <p className="footnote">
          Predictions use the rating model’s win, draw and loss chances for every remaining fixture; postponed games without
          a new date aren’t included. Title, top-4 and relegation chances come from 5,000 simulated seasons.
        </p>
      )}
        </>
      )}
      <p className="footnote attribution">
        Model {grid.model_version ?? "not run yet"}. Fixtures, results and crests: football-data.org. Match history and
        the record at each price: football-data.co.uk. Odds: The Odds API.
      </p>
    </>
  );
}
