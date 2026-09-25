"use client";

import { useMemo, useState } from "react";
import {
  cardWindows,
  collectionSummary,
  POSITIONS,
  POSITION_LABEL,
  scoreColour,
  shelves,
  stackCounts,
  stackKey,
  tierLabel,
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

/** One Sorare score hexagon: flat-sided, filled by band, the number centred in contrasting ink. */
function Hexagon({ score }: { score: number | null }) {
  const { fill, ink } = scoreColour(score);
  return (
    <svg className="s5-hex-svg" viewBox="0 0 34 30" width="34" height="30" aria-hidden="true">
      <polygon points="8.5,1 25.5,1 34,15 25.5,29 8.5,29 0,15" fill={fill} />
      <text x="17" y="16.5" textAnchor="middle" dominantBaseline="middle" fill={ink} className="s5-hex-num">
        {score === null ? "–" : Math.round(score)}
      </text>
    </svg>
  );
}

/** Gold stars for a card's tier, e.g. five for an Icon. */
function Stars({ n }: { n: number }) {
  return (
    <span className="s5-stars" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <svg key={i} width="10" height="10" viewBox="0 0 12 12" className={i < n ? "on" : "off"}>
          <path d="M6 0l1.5 3.9L12 4.6 8.7 7.4 9.7 12 6 9.5 2.3 12l1-4.6L0 4.6l4.5-.7z" fill="currentColor" />
        </svg>
      ))}
    </span>
  );
}

/** The small top-right "i": on hover or focus it reveals the card's level and tier. */
function InfoButton({ card }: { card: CollectionCard }) {
  const tier = tierLabel(card);
  return (
    <span className="s5-info">
      <button type="button" className="s5-info-btn" aria-label={`Details: level ${card.level}, ${tier}`}>
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
          <circle cx="6" cy="6" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="6" cy="3.6" r="0.9" fill="currentColor" />
          <path d="M6 5.4v3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      </button>
      <span className="s5-info-pop" role="tooltip">
        <span className="row">
          <span>Level</span>
          <b>Lvl {card.level}</b>
        </span>
        <span className="row">
          <span>Tier</span>
          <b className="tier">
            {card.stars ? <Stars n={card.stars} /> : null}
            {tier}
          </b>
        </span>
      </span>
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
  const windows = cardWindows(card);
  return (
    <article className="s5-pc" style={{ animationDelay: `${Math.min(index * 20, 360)}ms` }}>
      <span className="art">
        <SorareImage src={card.pic} fill />
        {stack > 1 ? <span className="dup">×{stack}</span> : null}
        <SeasonMark inSeason={card.inSeason} />
      </span>
      <InfoButton card={card} />
      <span className="nm">
        <b>{card.name}</b>
      </span>
      <span className="s5-hexrow" role="group" aria-label="Average score by window">
        {windows.map((w) => (
          <span className="s5-hex" key={w.window}>
            <small className="win">{w.window}</small>
            <Hexagon score={w.score} />
            <small className="pct">{w.started === null ? "\u00a0" : `${Math.round(w.started)}%`}</small>
          </span>
        ))}
      </span>
    </article>
  );
}
