interface Props {
  number: number;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
}

/** ‹ GW7 › — shared by the Fixtures list and the board toolbar's single-gameweek mode. */
export default function GameweekStepper({ number, canGoBack, canGoForward, onBack, onForward }: Props) {
  return (
    <div className="stepper">
      <button type="button" aria-label="Previous gameweek" disabled={!canGoBack} onClick={onBack}>
        <Chevron direction="left" />
      </button>
      <div className="range">GW{number}</div>
      <button type="button" aria-label="Next gameweek" disabled={!canGoForward} onClick={onForward}>
        <Chevron direction="right" />
      </button>
    </div>
  );
}

export function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={direction === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
    </svg>
  );
}
