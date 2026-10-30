"use client";

import Link from "../navigation/NavigationLink";
import { useEffect, useMemo, useState } from "react";
import {
  cardWindows,
  collectionSummary,
  POSITIONS,
  POSITION_LABEL,
  scoreColour,
  seasonBadge,
  shelves,
  stackCounts,
  stackKey,
  tierLabel,
  type Position,
  type Season,
} from "../../lib/cards";
import { cardAnchor } from "../../lib/links";
import { gameLine, type NextGame } from "../../lib/nextGame";
import { SOURCE_NAME, type CollectionCard, type Sorare } from "../../lib/play";
import { Foil } from "../play/bits";
import CardArt from "./CardArt";
import useCountUp from "./useCountUp";
import SeasonIcon from "../SeasonIcon";
import type { CardReturn } from "../../lib/myWeeks";
import { cashLabel, essenceLabel } from "../../lib/play";
import DetailTip from "../ui/DetailTip";

const PAGE_SIZE = 12;

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

/** Sorare's seasonality mark: an in-season card shows its season number ("27"), a classic card shows "C". */
function SeasonMark({ card }: { card: CollectionCard }) {
  return (
    <span className={`s5-season ${card.inSeason ? "in" : "out"}`} title={card.inSeason ? "In season" : "Classic"}>
      <span className="visually-hidden">{card.inSeason ? "In season" : "Classic"}</span>
      <SeasonIcon inSeason={card.inSeason} size={10} />
      {seasonBadge(card)}
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

/** Card identity, historical windows, source chances and saved rewards, on intent. */
function InfoButton({ card, next, earned }: { card: CollectionCard; next?: NextGame; earned?: CardReturn | null }) {
  const tier = tierLabel(card);
  return (
    <DetailTip className="s5-info-btn" label={`${card.name} details: level ${card.level}, ${tier}`} content={<div className="s5-card-details">
      <b>{card.name}</b>
      <p>Level {card.level} · {tier}{card.stars ? <Stars n={card.stars} /> : null} · {card.inSeason ? "In season" : "Classic"}</p>
      <span className="s5-hexrow" role="group" aria-label="Average score by window">{cardWindows(card).map(w => <span className="s5-hex" key={w.window}><small className="win">{w.window}</small><Hexagon score={w.score} /><small className="pct">{w.started === null ? "—" : `${Math.round(w.started)}%`}</small></span>)}</span>
      {next ? <><p>{gameLine(next.game)} · Sorare GW{next.week}</p><div role="group" aria-label="Chance to start">{next.chances.list.map(one => <p key={one.source} data-used={one.source === next.chances.used ? "" : undefined}>{SOURCE_NAME[one.source]} <b>{one.percent}%</b></p>)}</div><p>Score before competition and captain bonuses. Bonuses vary by competition.</p></> : <p>No game yet</p>}
      <p>{earned ? <><b>{essenceLabel(earned.essence)} essence · {cashLabel(earned.cash)}</b><br />In {earned.lineups} saved lineup{earned.lineups === 1 ? "" : "s"}. Rewards belong to the whole lineup; do not add them across cards.</> : earned === null ? "Saved rewards unavailable" : "No saved lineup yet"}</p>
    </div>}>
        <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
          <circle cx="6" cy="6" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="6" cy="3.6" r="0.9" fill="currentColor" />
          <path d="M6 5.4v3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
    </DetailTip>
  );
}

const SHAPE: [string, string][] = [["GK", "Goalkeepers"], ["DEF", "Defenders"], ["MID", "Midfielders"], ["FWD", "Forwards"]];

/** The squad's shape: one strip, a segment per position, in shades of ink. */
function Shape({ byPosition }: { byPosition: Record<string, Record<string, number>> }) {
  const counts = SHAPE.map(([key]) => Object.values(byPosition).reduce((total, group) => total + (group[key] ?? 0), 0));
  const shades = [1, 0.72, 0.46, 0.24];
  return (
    <div className="gl-shape" role="img" aria-label={`Cards by position: ${SHAPE.map(([, label], i) => `${counts[i]} ${label.toLowerCase()}`).join(", ")}`}>
      <div className="gl-strip">
        {counts.map((count, i) => (
          <i key={SHAPE[i]![0]} style={{ flex: count, opacity: shades[i], animationDelay: `${i * 0.08}s` }} />
        ))}
      </div>
      <div className="gl-legend">
        {counts.map((count, i) => (
          <div key={SHAPE[i]![0]}>
            <b><em style={{ opacity: shades[i] }} />{count}</b>
            <span>{SHAPE[i]![1]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** My cards: the collection led by what he can field, then the shape, then the cards by position. */
export default function CardsView({ data, upcoming, initialPage = 0, returns = {} }: { data: Pick<Sorare, "cards" | "collection">; upcoming: Record<string, NextGame>; initialPage?: number; returns?: Record<string, CardReturn> | null }) {
  const collection = useMemo(() => data.collection ?? [], [data.collection]);
  const [pos, setPos] = useState<Position | "all">("all");
  const [rarity, setRarity] = useState("all");
  const [season, setSeason] = useState<Season>("all");
  const [find, setFind] = useState("");
  const [page, setPage] = useState(Number.isFinite(initialPage) ? Math.max(0, Math.floor(initialPage)) : 0);

  const summary = useMemo(() => collectionSummary(collection), [collection]);
  // The tile a link names is marked. The browser does it itself (:target) for a page loaded at its address, but not when the page was
  // reached by a client navigation from another page of the app, so the address is read here as well.
  const [target, setTarget] = useState("");
  useEffect(() => {
    const read = () => {
      const hash = window.location.hash.slice(1);
      setTarget(hash);
      if (hash) {
        const all = shelves(collection, { pos: "all", rarity: "all", season: "all" }).flatMap(g => g.cards);
        const index = all.findIndex(c => cardAnchor(c.player) === hash);
        if (index >= 0) { setPos("all"); setRarity("all"); setSeason("all"); setFind(""); setPage(Math.floor(index / PAGE_SIZE)); }
      }
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [collection]);
  const stacks = useMemo(() => stackCounts(collection), [collection]);
  const groups = useMemo(() => {
    const q = find.trim().toLowerCase();
    const all = shelves(collection, { pos, rarity, season });
    if (!q) return all;
    return all
      .map((group) => ({ ...group, cards: group.cards.filter((card) => `${card.name} ${card.club ?? ""}`.toLowerCase().includes(q)) }))
      .filter((group) => group.cards.length > 0);
  }, [collection, pos, rarity, season, find]);
  const shown = groups.reduce((total, group) => total + group.cards.length, 0);
  const pages = Math.max(1, Math.ceil(shown / PAGE_SIZE)), at = Math.min(page, pages - 1);
  let offset = 0;
  const visibleGroups = groups.flatMap(group => {
    const cards = group.cards.slice(Math.max(0, at * PAGE_SIZE - offset), Math.max(0, (at + 1) * PAGE_SIZE - offset));
    offset += group.cards.length;
    return cards.length ? [{ ...group, cards }] : [];
  });
  const go = (value: number) => {
    setPage(value); setTarget("");
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("page", String(value + 1)); else url.searchParams.delete("page");
    url.hash = "";
    window.history.replaceState(null, "", url);
  };
  useEffect(() => { if (target) document.getElementById(target)?.scrollIntoView({ block: "center" }); }, [target, at]);
  // a link from another page opens one tile per player: the first card of his that is on the page
  const anchored = useMemo(() => {
    const first = new Map<string, string>();
    for (const group of groups) for (const card of group.cards) if (!first.has(card.player)) first.set(card.player, card.slug);
    return new Set(first.values());
  }, [groups]);
  const players = useCountUp(summary.players);

  return (
    <>
      {/* Canvas board "6 · Gallery · Cards": what you can play, the facts as chips, the squad's shape by position. */}
      <section className="gl-hero">
        <div className="gl-lead">
          <h1>Your gallery</h1>
          <p className="gl-sub">Every Sorare card you hold, as it stands today</p>
          <p className="gl-big">
            <b>{data.cards.usable}</b>
            <span>cards you can play, of {data.cards.total}</span>
          </p>
          <ul className="gl-facts" aria-label="Collection summary">
            <li><Foil rarity="limited" /><strong>{summary.limited}</strong> Limited</li>
            <li><Foil rarity="rare" /><strong>{summary.rare}</strong> Rare</li>
            <li><SeasonIcon inSeason /><strong>{summary.inSeason}</strong> in season</li>
            <li><strong>{players}</strong> players you can field</li>
            <li><strong>{summary.duplicates}</strong> duplicates · <strong>{summary.clubs}</strong> clubs</li>
            <li><strong>{summary.average}</strong> average score</li>
            <li><strong>{data.cards.excluded.length}</strong> left out</li>
          </ul>
          {/* Moved here from the old home's cards tile: without a Rare goalkeeper no Rare lineup can be entered. */}
        {data.cards.rareGoalkeepers === 0 && (data.cards.byRarity.rare ?? 0) > 0 ? (
          <p className="s5-warn" role="note">
            <Foil rarity="rare" />
            <span>
              <b>No Rare goalkeeper.</b> Rare competitions stay locked; your {data.cards.byRarity.rare} Rares play in Limited ones.
            </span>
          </p>
        ) : null}
        </div>
        <Shape byPosition={data.cards.byPosition} />
      </section>

      <div className="s5-tools">
        <div className="s5-seg" role="group" aria-label="Position">
          <button type="button" aria-pressed={pos === "all"} onClick={() => { setPos("all"); go(0); }}>
            All
          </button>
          {POSITIONS.map((option) => (
            <button key={option} type="button" aria-pressed={pos === option} onClick={() => { setPos(option); go(0); }}>
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
              onClick={() => { setRarity(option.key); go(0); }}
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
              onClick={() => { setSeason(option.key); go(0); }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="gl-find">
          <span>Find</span>
          <input type="search" name="gallery-search" autoComplete="off" value={find} onChange={(e) => { setFind(e.target.value); go(0); }} aria-label="Find a player or club" />
        </label>
        <span className="s5-count" aria-live="polite">
          {shown} {shown === 1 ? "card" : "cards"}
        </span>
      </div>
      {visibleGroups.map((group) => {
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
                <CardTile key={card.slug} card={card} index={index} stack={stacks.get(stackKey(card)) ?? 1} anchor={anchored.has(card.slug)} target={target === cardAnchor(card.player)} next={upcoming[card.player] ?? upcoming[card.name]} earned={returns === null ? null : returns[card.slug]} />
              ))}
            </div>
          </section>
        );
      })}

      {pages > 1 ? <nav className="s5-pager" aria-label="Gallery pages"><button type="button" onClick={() => go(at - 1)} disabled={at === 0}>Previous</button><span>Page {at + 1} of {pages}</span><button type="button" onClick={() => go(at + 1)} disabled={at === pages - 1}>Next</button></nav> : null}
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

function CardTile({ card, index, stack, anchor, target, next, earned }: { card: CollectionCard; index: number; stack: number; anchor: boolean; target: boolean; next: NextGame | undefined; earned?: CardReturn | null }) {
  const score = next?.forecast?.x ?? null, colour = scoreColour(score);
  return (
    <article className={`s5-pc${anchor && target ? " is-target" : ""}`} data-card={card.slug} id={anchor ? cardAnchor(card.player) : undefined} style={{ animationDelay: `${Math.min(index * 20, 360)}ms` }}>
      {/* The card and the name open his player page. */}
      <Link className="art" href={`/players/${card.player}`} prefetch={false} aria-label={`${card.name}: open his page`}>
        <CardArt src={card.pic} name={card.name} />
        {stack > 1 ? <span className="dup">×{stack}</span> : null}
        <SeasonMark card={card} />
        <span className="s5-card-ratings">
          <span className={`s5-card-fdr${next?.fdr ? ` f${next.fdr.bucket}` : ""}`} title={next?.fdr?.difficulty != null ? `${gameLine(next.game)} · ${next.fdr.label} · FDR ${Math.round(next.fdr.difficulty)} of 100 (lower is easier)` : "FDR unavailable for this fixture"}><small>FDR</small><b>{next?.fdr?.difficulty == null ? "—" : Math.round(next.fdr.difficulty)}</b></span>
          <span className="s5-card-score" style={{ background: colour.fill, color: colour.ink }} aria-label={score === null ? "xScore unavailable for this fixture" : `xScore ${Math.round(score)}`} title="Published player xScore, before competition and captain bonuses"><b>{score === null ? "—" : Math.round(score)}</b></span>
        </span>
      </Link>
      <InfoButton card={card} next={next} earned={earned} />
      <Next next={next} />
    </article>
  );
}

/** His next game and what each source says of his chance to start it; the one Sofix uses is darker. */
function Next({ next }: { next: NextGame | undefined }) {
  if (!next) return <span className="s5-next">No game yet</span>;
  const { list, used } = next.chances;
  const chance = list.find(one => one.source === used)?.percent;
  const description = `${gameLine(next.game)} · Sorare GW${next.week}`;
  return (
    <span className="s5-next">
      {used === "futbolfantasy" && next.game.ffMatch ? <a className="s5-card-start" aria-label={`Start chance ${chance === undefined ? "unknown" : `${chance}%`}`} href={next.game.ffMatch.url} target="_blank" rel="noreferrer" title={`${description} · Futbol Fantasy`}>{chance === undefined ? "—" : `${chance}%`}</a> : <DetailTip className="s5-card-start" label={`Start chance ${chance === undefined ? "unknown" : `${chance}%`}`} content={<><b>{description}</b>{list.map(one => <p key={one.source}>{SOURCE_NAME[one.source]} <b>{one.percent}%</b>{one.source === used ? " · used" : ""}</p>)}</>}>{chance === undefined ? "—" : `${chance}%`}</DetailTip>}
      <span className="s5-card-evidence">
        <DetailTip className="s5-card-fixture" label={description} content={<><b>{next.game.team ?? "Team TBC"} {next.game.venue === "H" ? "v" : "at"} {next.game.opponent}</b><p>{description}</p>{next.forecast ? null : <p>Individual fixture forecast unavailable. A double’s best-game score is kept separate.</p>}</>}>
          {[{ name: next.game.team ?? "Team TBC", crest: next.game.teamCrest }, { name: next.game.opponent, crest: next.game.opponentCrest }].map((team, i) => team.crest
            // eslint-disable-next-line @next/next/no-img-element -- Hot-linked source crests, personal use.
            ? <img key={i} src={team.crest} alt="" width={22} height={22} loading="lazy" /> : <span key={i} aria-hidden="true">{team.name.slice(0, 2)}</span>)}
        </DetailTip>
        <span className="s5-card-xd" title="Expected decisive contribution in this fixture">xD {next.forecast?.xd == null ? "—" : next.forecast.xd.toFixed(2)}</span>
      </span>
    </span>
  );
}
