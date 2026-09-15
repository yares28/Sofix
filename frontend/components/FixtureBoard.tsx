"use client";

import { useEffect, useMemo } from "react";
import { useViewState } from "../hooks/useViewState";
import {
  LENS_COPY, MIDFIELD_ATTACK_WEIGHT, horizonSize, openingColumn, selectedColumn, windowRange, type View, type ViewState,
} from "../lib/grid";
import type { FixtureGrid, ModelNote } from "../lib/types";
import DifficultyGrid from "./DifficultyGrid";
import FixturesList from "./FixturesList";
import GameweekSelector from "./GameweekSelector";
import LeagueTable from "./LeagueTable";
import Overview from "./Overview";
import SegmentedControl from "./SegmentedControl";

interface Props {
  grid: FixtureGrid;
  notes: ModelNote[];
  initialView: ViewState;
  pinsInUrl: boolean; // a shared link's pins win over the ones saved in this browser
}

export default function FixtureBoard({ grid, notes, initialView, pinsInUrl }: Props) {
  const total = grid.matchdays.length;
  const opening = useMemo(() => openingColumn(grid), [grid]);
  const finished = useMemo(() => grid.matchdays.map((md) => md.finished), [grid]);
  const knownCodes = useMemo(() => new Set(grid.teams.map((team) => team.code)), [grid]);

  const { state, patch, togglePin } = useViewState(initialView, pinsInUrl, knownCodes);
  const { view, lens, horizon, pins } = state;

  // One gameweek drives every tab: the overview's window, the grid, the fixtures list and the table.
  const column = selectedColumn(grid.matchdays, state.gw, opening);
  const selectGameweek = (next: number) =>
    patch({ gw: next === opening ? null : (grid.matchdays[next]?.number ?? null) }); // the default keeps a clean URL
  const { start, end } = windowRange(total, column, horizonSize(horizon, total));
  // Standings "after" the selected gameweek only for past ones; from the opening GW on, every result so far counts
  // (including games brought forward from later gameweeks).
  const tableThrough = column < opening ? column : null;
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
          <GameweekSelector matchdays={grid.matchdays} column={column} opening={opening} onSelect={selectGameweek} />
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
      </section>

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
            clean sheets, midfielders by both (goals weighted {Math.round(MIDFIELD_ATTACK_WEIGHT * 100)}%). Kindest and
            toughest runs compare expected points per game.
          </p>
          <p className="footnote">
            Odds (Next and Next 3): bookmaker consensus from The Odds API with the margin removed. Win, draw and loss are
            priced by bookmakers; scoring, clean-sheet and conceding odds are implied by those prices and the over/under 2.5
            line. {horizon === "next" ? "Match cards use the rating model." : `${copy.hint}.`} Click a club name to open
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
      <p className="footnote attribution">
        Model {grid.model_version ?? "not run yet"}. Fixtures, results and crests: football-data.org. Match history:
        football-data.co.uk. Odds: The Odds API.{" "}
        <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Weather data by Open-Meteo.com</a>{" "}
        (<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>).
      </p>
    </>
  );
}
