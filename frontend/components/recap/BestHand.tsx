"use client";

import { useState, type CSSProperties } from "react";
import Link from "../FootballLink";
import { scoreColour } from "../../lib/cards";
import { SOURCE_NAME, SOURCE_SHORT } from "../../lib/play";
import { playerHref } from "../../lib/links";
import type { BestCard } from "../../lib/recap";
import CardArt from "../cards/CardArt";

/** One of the hand's cards and, once his game is played, what he scored ("dnp" when he did not play). */
export type HandCard = BestCard & { scored: number | "dnp" | null };

const band = (value: number | null, perfect = false): CSSProperties => {
  if (value === null) return { background: "var(--track)", color: "var(--ink-2)" };
  const { fill, ink } = scoreColour(value, { perfect });
  return { background: fill, color: ink };
};
const pct = (p: number) => `${Math.round(p * 100)}%`;
// The best card sits in the middle; the others alternate outwards, so the hand reads from its centre.
const SLOTS = [8, 6, 4, 2, 0, 1, 3, 5, 7, 9];

/** The week's best cards fanned like a hand of cards; hovering or focusing one lifts it and names him under the fan. */
export default function BestHand({ cards }: { cards: HandCard[] }) {
  const [active, setActive] = useState(0);
  if (!cards.length) return null;
  const order = SLOTS.filter((i) => i < cards.length);
  const mid = (order.length - 1) / 2;
  const on = cards[active] ?? cards[0]!;
  return (
    <div className="rx-fan" style={{ "--n": order.length } as CSSProperties}>
      <ol className="rx-hand" aria-label="Your best cards this week, by xS">
        {order.map((index, slot) => {
          const card = cards[index]!;
          const o = slot - mid;
          const style = { "--o": o, "--a": Math.abs(o), zIndex: index === active ? 40 : 20 - Math.round(Math.abs(o) * 2) } as CSSProperties;
          return (
            <li key={card.player} className={index === active ? "rx-fc on" : "rx-fc"} style={style}>
              <Link href={playerHref(card.player)} className={`rx-art ${card.rarity}`} onMouseEnter={() => setActive(index)} onFocus={() => setActive(index)}
                aria-label={`${index + 1}. ${card.name}, xS ${Math.round(card.x)}${card.scored === "dnp" ? ", did not play" : card.scored === null ? "" : `, scored ${Math.round(card.scored)}`}: open his page`}>
                <CardArt src={card.pic} name={card.name} />
                <span className="rx-foil" aria-hidden="true" />
                <span className="rx-rk" aria-hidden="true">{index + 1}</span>
                {card.start !== null ? <span className="rx-st" style={band(card.start * 100)} aria-hidden="true">{pct(card.start)}</span> : null}
                {card.scored === "dnp" ? <span className="rx-stamp dnp" aria-hidden="true"><b>DNP</b></span>
                  : card.scored !== null ? <span className="rx-stamp" style={{ borderColor: scoreColour(card.scored).fill }} aria-hidden="true"><b>{Math.round(card.scored)}</b><small>scored</small></span> : null}
                <span className="rx-hx" style={band(card.x)} aria-hidden="true">{Math.round(card.x)}</span>
              </Link>
            </li>
          );
        })}
      </ol>
      <p className="rx-plate" aria-live="polite">
        <span className="rx-rk">{active + 1}</span>
        <span className="rx-who2"><b>{on.name}</b>{on.game ? <span>{on.game}</span> : null}</span>
        {on.start !== null ? <span className="rx-ch" style={band(on.start * 100)} title={on.source ? `${SOURCE_SHORT[on.source]}: ${SOURCE_NAME[on.source]}` : undefined}>{pct(on.start)} start</span> : null}
        <span className="rx-xs">xS <b>{Math.round(on.x)}</b>{on.scored === null ? null : <> → <b style={{ color: on.scored === "dnp" ? "var(--ink-2)" : on.scored >= on.x ? "var(--win)" : "var(--loss)" }}>{on.scored === "dnp" ? "did not play" : `${Math.round(on.scored)} scored`}</b></>}</span>
      </p>
    </div>
  );
}
