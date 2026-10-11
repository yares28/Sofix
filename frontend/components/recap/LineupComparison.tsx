import type { CSSProperties } from "react";
import { scoreColour } from "../../lib/cards";
import CardArt from "../cards/CardArt";

export type ComparisonCard = { slug: string; name: string; picture: string | null; rarity: string | null; captain: boolean; x: number | null; bench?: boolean };

/** Shared by entered teams and Sofix teams so both sides of the comparison read alike. */
export function ComparisonCards({ cards }: { cards: ComparisonCard[] }) {
  return <ol className="rc-team" aria-label={`${cards.length} cards`}>
    {cards.map(card => {
      const style: CSSProperties = card.x === null ? { background: "var(--track)", color: "var(--ink-2)" }
        : { background: scoreColour(card.x).fill, color: scoreColour(card.x).ink };
      return <li key={card.slug}>
        <span className={`rc-art ${card.rarity ?? "limited"}`}><CardArt src={card.picture} name={card.name} /></span>
        {card.captain ? <span className="rc-cap" title="Captain">C</span> : null}
        <span className="rc-hex sm" style={style} title="Player xScore">{card.x === null ? "-" : Math.round(card.x)}</span>
        <span className="rc-nm">{card.name}</span>
        {card.bench ? <span className="rc-bench">Bench</span> : null}
      </li>;
    })}
  </ol>;
}

export function ComparisonScores({ expected, actual, estimated = false, actualLabel = "Actual", entered = false }: {
  expected: number | null; actual: number | null; estimated?: boolean; actualLabel?: string; entered?: boolean;
}) {
  return <div className="rc-score-pair" role="group" aria-label="Lineup scores">
    <div className={entered ? "pl-entered-expected" : undefined} title={estimated
      ? "Estimate from this GW's forecasts, card bonuses, captain and substitutions, with independent playing chances. Older saved teams use their retained appearance order."
      : "The recorded Sofix forecast for this lineup and GW."}>
      <span>xScore{estimated ? " estimate" : ""}</span><b>{expected === null ? "-" : Math.round(expected)}</b>
    </div>
    <div className={entered ? "pl-entered-result" : undefined}><span>{actualLabel}</span><b>{actual === null ? "-" : Math.round(actual)}</b></div>
  </div>;
}
