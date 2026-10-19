import type { CSSProperties } from "react";
import { scoreColour } from "../../lib/cards";
import CardArt from "../cards/CardArt";

export type ComparisonCard = { slug: string; name: string; picture: string | null; rarity: string | null; captain: boolean; bench?: boolean; xd?: number | null;
  /** What he scored on Sorare; null until he has. */
  score: number | null;
  /** His xScore; left out for a lineup built knowing the scores. */
  x?: number | null;
  /** Why there is no score: "Not played yet", "Did not play", ... */
  why?: string };

const fill = (value: number | null): CSSProperties => value === null ? { background: "var(--track)", color: "var(--ink-2)" }
  : { background: scoreColour(value).fill, color: scoreColour(value).ink };

/** Shared by entered teams and Sofix teams so both sides of the comparison read alike. */
export function ComparisonCards({ cards }: { cards: ComparisonCard[] }) {
  return <ol className="rc-team" aria-label={`${cards.length} cards`}>
    {cards.map(card => {
      const x = card.x ?? null;
      // The card's own art names him; the name and the bench are still said for a pointer and a screen reader.
      return <li key={card.slug} className={card.bench ? "bench" : undefined} title={card.bench ? `${card.name}, bench` : card.name}>
        <span className={`rc-art ${card.rarity ?? "limited"}`}><CardArt src={card.picture} name={card.name} /></span>
        {card.captain ? <span className="rc-cap" title="Captain">C</span> : null}
        {/* what he scored, then his xScore in a smaller hexagon tucked beside it */}
        <span className="rc-hexes">
          <span className={`rc-hex sm${card.score === null ? "" : " scored"}`} style={fill(card.score)} title={card.score === null ? (card.why ?? "No score yet") : "His score"}>
            {card.score === null ? "-" : Math.round(card.score)}
          </span>
          {card.x === undefined ? null : <span className="rc-xs" style={fill(x)} title="His xScore">{x === null ? "-" : Math.round(x)}</span>}
        </span>
        {typeof card.xd === "number" ? <span className="rc-cxd" title="His expected decisive actions">{card.xd.toFixed(2)} xD</span> : null}
        <span className="visually-hidden">{card.name}{card.bench ? ", bench" : ""}{card.score === null ? `, ${card.why ?? "no score yet"}` : `, scored ${Math.round(card.score)}`}{x === null ? "" : `, xScore ${Math.round(x)}`}</span>
      </li>;
    })}
  </ol>;
}

export function ComparisonScores({ expected, actual, estimated = false, actualLabel = "Actual", entered = false, xd }: {
  /** Left out for a lineup built knowing the scores, whose xScore is what it scored. */
  expected?: number | null; actual: number | null; estimated?: boolean; actualLabel?: string; entered?: boolean;
  /** The lineup's expected decisive actions; left out where there is none to show (a team you entered). */
  xd?: number | null;
}) {
  return <div className="rc-score-pair" role="group" aria-label="Lineup scores">
    {expected === undefined ? null : <div className={entered ? "pl-entered-expected" : undefined} title={estimated
      ? "Estimate from this GW's forecasts, card bonuses, captain and substitutions, with independent playing chances. Older saved teams use their retained appearance order."
      : "The recorded Sofix forecast for this lineup and GW."}>
      <span>xScore{estimated ? " estimate" : ""}</span><b>{expected === null ? "-" : Math.round(expected)}</b>
    </div>}
    <div className={entered ? "pl-entered-result" : undefined}><span>{actualLabel}</span><b>{actual === null ? "-" : Math.round(actual)}</b></div>
    {xd === undefined ? null : <div className="rc-xd" title={xd === null ? "No xD yet: not every starter's game is worked out" : "Expected decisive actions from the starters"}>
      <span>xD</span><b>{xd === null ? "-" : xd.toFixed(1)}</b>
    </div>}
  </div>;
}
