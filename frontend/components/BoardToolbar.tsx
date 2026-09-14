"use client";

import { LENS_COPY, type Horizon } from "../lib/grid";
import type { GridMatchday, Lens } from "../lib/types";
import { Chevron } from "./GameweekStepper";
import SegmentedControl from "./SegmentedControl";

const HORIZONS: { value: Horizon; label: string }[] = [
  { value: "next", label: "Next" },
  { value: "3", label: "Next 3" },
  { value: "5", label: "Next 5" },
  { value: "8", label: "Next 8" },
  { value: "all", label: "All" },
];
const LENSES: { value: Lens; label: string }[] = (Object.keys(LENS_COPY) as Lens[]).map((lens) => ({
  value: lens,
  label: LENS_COPY[lens].label,
}));

interface Props {
  lens: Lens;
  horizon: Horizon;
  played: boolean;
  first: GridMatchday | undefined;
  last: GridMatchday | undefined;
  canGoBack: boolean;
  canGoForward: boolean;
  showPlayedToggle: boolean;
  query: string;
  onBack: () => void;
  onForward: () => void;
  onTogglePlayed: () => void;
  onHorizon: (horizon: Horizon) => void;
  onLens: (lens: Lens) => void;
  onQuery: (query: string) => void;
}

export default function BoardToolbar(props: Props) {
  const { lens, horizon, played, first, last, query } = props;
  const copy = LENS_COPY[lens];
  const single = horizon === "next"; // match cards: no lens, legend or team search
  const range = !first || !last ? "—" : first.number === last.number ? `GW${first.number}` : `GW${first.number} – GW${last.number}`;
  return (
    <div className={`toolbar ${single ? "single" : ""}`}>
      <div className="toolbar-nav">
        <div className="stepper">
          <button type="button" aria-label="Previous gameweek" disabled={!props.canGoBack} onClick={props.onBack}>
            <Chevron direction="left" />
          </button>
          <div className="range">{range}</div>
          <button type="button" aria-label="Next gameweek" disabled={!props.canGoForward} onClick={props.onForward}>
            <Chevron direction="right" />
          </button>
        </div>
        {props.showPlayedToggle && (
          <button type="button" className="toggle" aria-pressed={played} onClick={props.onTogglePlayed} aria-label="Show played gameweeks">
            <span className="toggle-long">Show played</span>
            <span className="toggle-short" aria-hidden="true">Played</span>
          </button>
        )}
      </div>
      <div className="toolbar-controls">
        <SegmentedControl<Horizon> label="Horizon" value={horizon} onChange={props.onHorizon} options={HORIZONS} />
        {!single && <SegmentedControl<Lens> label="Lens" value={lens} onChange={props.onLens} options={LENSES} />}
        {!single && (
          <div className="legend">
            <span className="visually-hidden">Colour key, {copy.label} lens:</span>
            {copy.easy}
            {([1, 2, 3, 4, 5] as const).map((bucket) => (
              <span key={bucket} className={`chip f${bucket}`} aria-hidden="true">
                {bucket}
              </span>
            ))}
            <span className="visually-hidden">(1 to 5)</span>
            {copy.hard}
          </div>
        )}
      </div>
      {!single && (
        <div className="search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="search"
            aria-label="Search teams"
            placeholder="Search teams"
            autoComplete="off"
            value={query}
            onChange={(event) => props.onQuery(event.target.value)}
          />
        </div>
      )}
    </div>
  );
}
