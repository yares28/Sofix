"use client";

import { useMemo, useState } from "react";
import {
  collectionSummary,
  POSITIONS,
  POSITION_LABEL,
  shelves,
  stackCounts,
  stackKey,
  type Position,
  type Season,
} from "../../lib/cards";
import type { CollectionCard, Sorare } from "../../lib/play";
import { Foil } from "../play/bits";
import SorareImage from "../play/SorareImage";
import useCountUp from "./useCountUp";

const RARITIES: { key: string; label: string }[] = [
  { key: "all", label: "Both" },
  { key: "limited", label: "Limited" },
  { key: "rare", label: "Rare" },
];

const SEASONS: { key: Season; label: string }[] = [
  { key: "all", label: "Any season" },
  { key: "in", label: "In season" },
  { key: "out", label: "Classic" },
];

/** Sorare marks a current-season card with a spark; an older card with a clock. Icon only, corner of the art. */
function SeasonMark({ inSeason }: { inSeason: boolean }) {
  return (
    <span className={`s5-season ${inSeason ? "in" : "out"}`} title={inSeason ? "In season" : "Classic"}>
      <span className="visually-hidden">{inSeason ? "In season" : "Classic"}</span>
      {inSeason ? (
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M6 0l1.3 3.5L11 4.7 8.2 7l.9 4L6 9.1 2.9 11l.9-4L1 4.7l3.7-1.2z" fill="currentColor" />
        </svg>
      ) : (
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
          <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M6 3v3l2 1.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )}
    </span>
  );
}

/** My cards: the collection led by what he can field, then the shape, then the cards by position. */
export default function CardsView({ data }: { data: Sorare }) {
  const collection = useMemo(() => data.collection ?? [], [data.collection]);
  const [pos, setPos] = useState<Position | "all">("all");
  const [rarity, setRarity] = useState("all");
  const [season, setSeason] = useState<Season>("all");

  const summary = useMemo(() => collectionSummary(collection), [collection]);
  const stacks = useMemo(() => stackCounts(collection), [collection]);
  const groups = useMemo(
    () => shelves(collection, { pos, rarity, season }),
    [collection, pos, rarity, season],
  );
  const shown = groups.reduce((total, group) => total + group.cards.length, 0);
  const players = useCountUp(summary.players);

  return (
    <>
      <section className="s5-hero">
        <p className="s5-eyebrow">Your squad</p>
        <h1>My cards</h1>
        <p className="s5-big">
          <b>{players}</b>
          <i>players you can field</i>
        </p>
        <p className="s5-sub">
          <span>
            from <b>{summary.cards}</b> playable cards
          </span>
          <span>
            <b>{summary.duplicates}</b> a duplicate you already have
          </span>
          <span>
            across <b>{summary.clubs}</b> clubs
          </span>
          <span>
            <b>{data.cards.excluded.length}</b> left out
          </span>
        </p>
      </section>

      <section className="s5-kpis" aria-label="Collection summary">
        <div className="s5-kpi">
          <b>{summary.cards}</b>
          <span>playable</span>
        </div>
        <div className="s5-kpi">
          <b>
            <Foil rarity="limited" />
            {summary.limited}
          </b>
          <span>Limited</span>
        </div>
        <div className="s5-kpi">
          <b>
            <Foil rarity="rare" />
            {summary.rare}
          </b>
          <span>Rare</span>
        </div>
        <div className="s5-kpi">
          <b>{summary.inSeason}</b>
          <span>in season</span>
        </div>
        <div className="s5-kpi">
          <b>{summary.average}</b>
          <span>avg score</span>
        </div>
      </section>

      <div className="s5-tools">
        <div className="s5-seg" role="group" aria-label="Position">
          <button type="button" aria-pressed={pos === "all"} onClick={() => setPos("all")}>
            All
          </button>
          {POSITIONS.map((option) => (
            <button key={option} type="button" aria-pressed={pos === option} onClick={() => setPos(option)}>
              {option}
            </button>
          ))}
        </div>
        <div className="s5-seg" role="group" aria-label="Rarity">
          {RARITIES.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={rarity === option.key}
              onClick={() => setRarity(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="s5-seg" role="group" aria-label="Season">
          {SEASONS.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={season === option.key}
              onClick={() => setSeason(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="s5-count" aria-live="polite">
          {shown} {shown === 1 ? "card" : "cards"}
        </span>
      </div>

      {groups.map((group) => {
        const width = Math.round((100 * group.cards.length) / summary.maxPosition);
        return (
          <section className="s5-shelf" key={group.pos}>
            <div className="s5-shelf-head">
              <h2>{POSITION_LABEL[group.pos]}</h2>
              <em>{group.cards.length}</em>
              <span className="s5-shelf-bar" aria-hidden="true">
                <i style={{ width: `${width}%` }} />
              </span>
            </div>
            <div className="s5-grid">
              {group.cards.map((card, index) => (
                <CardTile key={card.slug} card={card} index={index} stack={stacks.get(stackKey(card)) ?? 1} />
              ))}
            </div>
          </section>
        );
      })}

      {data.cards.excluded.length ? (
        <details className="s5-fold">
          <summary>
            Left out · {data.cards.excluded.length}
            <span className="chev" aria-hidden="true">
              ›
            </span>
          </summary>
          <div className="s5-sealed">
            {data.cards.excluded.map((card, index) => (
              <span key={`${card.name}-${index}`}>
                <Foil rarity={card.rarity} />
                <b>{card.name}</b> {card.why}
              </span>
            ))}
          </div>
        </details>
      ) : null}
    </>
  );
}

function CardTile({ card, index, stack }: { card: CollectionCard; index: number; stack: number }) {
  return (
    <article className="s5-pc" style={{ animationDelay: `${Math.min(index * 20, 360)}ms` }}>
      <span className="art">
        <SorareImage src={card.pic} fill fit="contain" />
        {card.level > 0 ? <span className="lvl">Lvl {card.level}</span> : null}
        {stack > 1 ? <span className="dup">×{stack}</span> : null}
        <SeasonMark inSeason={card.inSeason} />
      </span>
      <span className="nm">
        <b>{card.name}</b>
        <span className="s5-score">
          <small>L10</small>
          <b>{Math.round(card.average)}</b>
        </span>
      </span>
    </article>
  );
}
