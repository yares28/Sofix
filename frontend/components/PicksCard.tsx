"use client";

import { useState } from "react";
import { MIDFIELD_ATTACK_WEIGHT, type Position, type PositionPick } from "../lib/grid";
import type { FixtureGrid, Lens } from "../lib/types";
import Crest from "./Crest";
import FixtureChips from "./FixtureChips";
import SegmentedControl from "./SegmentedControl";

interface Props {
  grid: FixtureGrid;
  picks: Record<Position, PositionPick[]>;
  start: number;
  end: number;
  windowLabel: string; // "GW6–GW10"
  pins: readonly string[];
  onTogglePin: (code: string) => void;
}

const POSITIONS: Record<Position, { label: string; lens: Lens; measure: string; value: (p: PositionPick) => string }> = {
  forwards: { label: "Forwards", lens: "attack", measure: "Forwards by expected goals", value: (p) => `${p.xg.toFixed(1)} xG` },
  midfielders: {
    label: "Midfielders",
    lens: "overall",
    measure: `Midfielders by goals (${Math.round(MIDFIELD_ATTACK_WEIGHT * 100)}%) and clean sheets`,
    value: (p) => `${p.xg.toFixed(1)} xG · ${p.cleanSheets.toFixed(1)} CS`,
  },
  defenders: { label: "Defenders", lens: "defence", measure: "Defenders and keepers by expected clean sheets", value: (p) => `${p.cleanSheets.toFixed(1)} CS` },
};

/** Which clubs to buy players from over the window, one position at a time. Clicking a club pins it. */
export default function PicksCard({ grid, picks, start, end, windowLabel, pins, onTogglePin }: Props) {
  const [position, setPosition] = useState<Position>("forwards");
  const config = POSITIONS[position];
  const rows = picks[position];

  return (
    <section className="card bento-card picks-card" aria-labelledby="picks-title">
      <header className="bento-head">
        <h2 id="picks-title" className="bento-title">Who to pick</h2>
        <span className="bento-meta">{windowLabel}</span>
      </header>
      <SegmentedControl<Position>
        label="Position"
        value={position}
        onChange={setPosition}
        options={(Object.keys(POSITIONS) as Position[]).map((value) => ({ value, label: POSITIONS[value].label }))}
      />
      {rows.length === 0 ? (
        <p className="bento-sub picks-empty">No games to rate in this window.</p>
      ) : (
        <ol className="pick-list">
          {rows.map((pick, rank) => {
            const pinned = pins.includes(pick.team.code);
            return (
              <li key={pick.team.code}>
                <button
                  type="button"
                  className="pick"
                  aria-pressed={pinned}
                  onClick={() => onTogglePin(pick.team.code)}
                  aria-label={`${rank + 1}. ${pick.team.name}: ${config.value(pick)} over ${pick.fixtures} ${pick.fixtures === 1 ? "game" : "games"}, pin`}
                >
                  <span className="pick-rank" aria-hidden="true">{rank + 1}</span>
                  <Crest team={pick.team} size={22} />
                  <span className="pick-name">{pick.team.name}</span>
                  <span className="pick-value">{config.value(pick)}</span>
                  <FixtureChips grid={grid} cells={pick.team.cells.slice(start, end)} lens={config.lens} className="pick-strip" />
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <p className="bento-sub">{config.measure} · click a club to pin it</p>
    </section>
  );
}
