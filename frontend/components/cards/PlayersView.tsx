"use client";

import { useMemo, useState } from "react";
import {
  improvers,
  ownedPlayers,
  POSITIONS,
  priceLabel,
  searchMarket,
  squadBar,
  verdict,
  type Position,
} from "../../lib/cards";
import type { MarketPlayer, Sorare } from "../../lib/play";
import { Foil } from "../play/bits";
import CardArt from "./CardArt";
import useCountUp from "./useCountUp";

const LIMIT = 30;

/** Player search: the LaLiga players priced now, led by who would actually improve the squad. */
export default function PlayersView({ data }: { data: Sorare }) {
  const market = useMemo(() => data.market ?? [], [data.market]);
  const collection = useMemo(() => data.collection ?? [], [data.collection]);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<Position | "all">("all");

  const bar = useMemo(() => squadBar(collection), [collection]);
  const owned = useMemo(() => ownedPlayers(collection), [collection]);
  const upgrades = useMemo(() => improvers(market, bar, owned).length, [market, bar, owned]);
  const results = useMemo(
    () => searchMarket(market, bar, owned, { pos, query }),
    [market, bar, owned, pos, query],
  );
  const shownImproving = results.filter((player) => verdict(player, bar, owned).kind === "up").length;
  const heroValue = useCountUp(upgrades);

  return (
    <>
      <section className="s5-hero green">
        <p className="s5-eyebrow">Player search</p>
        <h1>Who is worth buying</h1>
        <p className="s5-big">
          <b>{heroValue}</b>
          <i>would improve your team</i>
        </p>
        <p className="s5-bars">
          <span className="lead">of {market.length} priced now · your bar to beat</span>
          {POSITIONS.map((position) => (
            <span className="s5-bar" key={position}>
              {position} <b>{Math.round(bar[position])}</b>
            </span>
          ))}
        </p>
      </section>

      <div className="s5-find">
        <svg className="mag" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
          <path d="M20 20l-3.2-3.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          placeholder="Search a player or a club"
          aria-label="Search a player or a club"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
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
      </div>
      <p className="s5-results-count" aria-live="polite">
        {results.length
          ? `${shownImproving} would improve your team · ${results.length} shown`
          : ""}
      </p>

      <div className="s5-results">
        {results.length === 0 ? (
          <p className="s5-none">No one by that name in the LaLiga squads.</p>
        ) : (
          <>
            {results.slice(0, LIMIT).map((player, index) => (
              <ResultCard key={player.slug} player={player} index={index} bar={bar} owned={owned} />
            ))}
            {results.length > LIMIT ? (
              <p className="s5-more">
                {results.length - LIMIT} more, further from your team — narrow it above.
              </p>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}

function ResultCard({
  player,
  index,
  bar,
  owned,
}: {
  player: MarketPlayer;
  index: number;
  bar: Record<Position, number>;
  owned: Set<string>;
}) {
  const v = verdict(player, bar, owned);
  const isOwned = owned.has(player.slug);
  return (
    <article
      className={`s5-res${isOwned ? " owned" : ""}`}
      style={{ animationDelay: `${Math.min(index * 18, 380)}ms` }}
    >
      <span className="art">
        <CardArt src={player.pic} name={player.name} />
      </span>
      <span className="who">
        <b>{player.name}</b>
        <span>
          {player.pos} · {player.club}
        </span>
      </span>
      <span className={`s5-gain ${v.kind}`}>
        <b>{v.value}</b>
        <span>{v.note}</span>
      </span>
      <span className="s5-stats">
        <span className="s5-stat">
          <b>{Math.round(player.average)}</b>
          <span>Last 10 avg</span>
        </span>
        <span className="s5-stat">
          <b>{player.projection === null ? "—" : Math.round(player.projection)}</b>
          <span>Projected</span>
        </span>
        <span className="s5-stat">
          <b>
            <Foil rarity="limited" />
            {priceLabel(player.eur)}
          </b>
          <span>Limited price</span>
        </span>
      </span>
    </article>
  );
}
