"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  improvers,
  ownedPlayers,
  POSITIONS,
  priceLabel,
  projectionNote,
  searchMarket,
  squadBar,
  valuePer10,
  verdict,
  type Position,
  scoreColour,
} from "../../lib/cards";
import { chanceLabel, nextWeek, startChance, type MarketPlayer, type Sorare } from "../../lib/play";
import { Foil } from "../play/bits";
import SourceMark from "../SourceMark";
import CardArt from "./CardArt";
import useCountUp from "./useCountUp";

const LIMIT = 30;

/** Player search: every LaLiga player with his start chance and xScore this week, led by who would actually improve the squad. */
export default function PlayersView({ data, now }: { data: Sorare; now: string }) {
  const market = useMemo(() => data.market ?? [], [data.market]);
  const collection = useMemo(() => data.collection ?? [], [data.collection]);
  const [query, setQuery] = useState("");
  const [pos, setPos] = useState<Position | "all">("all");
  // Best: who would improve the team most. Best value: who improves it most for the money.
  const [order, setOrder] = useState<"best" | "value">("best");

  const bar = useMemo(() => squadBar(collection), [collection]);
  const owned = useMemo(() => ownedPlayers(collection), [collection]);
  const upgrades = useMemo(() => improvers(market, bar, owned).length, [market, bar, owned]);
  const results = useMemo(
    () => searchMarket(market, bar, owned, { pos, query, order }),
    [market, bar, owned, pos, query, order],
  );
  const shownImproving = results.filter((player) => verdict(player, bar, owned).kind === "up").length;
  const heroValue = useCountUp(upgrades);
  const dash = projectionNote(nextWeek(data).projectionsAt, new Date(now));
  const shownDash = results.slice(0, LIMIT).some((player) => player.projection === null);

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
          <span className="lead">of {market.length} LaLiga players · your bar to beat</span>
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
        <div className="s5-seg" role="group" aria-label="Order">
          <button type="button" aria-pressed={order === "best"} onClick={() => setOrder("best")}>
            Best
          </button>
          <button type="button" aria-pressed={order === "value"} onClick={() => setOrder("value")} title="The most improvement for the money: points over your bar per €10">
            Best value
          </button>
        </div>
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
      {shownDash ? <p className="s5-dash">{dash}</p> : null}

      <div className="s5-results">
        {results.length === 0 ? (
          <p className="s5-none">No one by that name in the LaLiga squads.</p>
        ) : (
          <>
            {results.slice(0, LIMIT).map((player, index) => (
              <ResultCard key={player.slug} player={player} index={index} bar={bar} owned={owned} dash={dash} value={order === "value"} />
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
  dash,
  value,
}: {
  value: boolean;
  player: MarketPlayer;
  index: number;
  bar: Record<Position, number>;
  owned: Set<string>;
  dash: string;
}) {
  const v = verdict(player, bar, owned);
  const isOwned = owned.has(player.slug);
  const start = typeof player.pStart === "number" ? startChance({ pStart: player.pStart, startSource: player.startSource, ffKind: player.ffKind }) : null;
  return (
    <article
      className={`s5-res${isOwned ? " owned" : ""}`}
      style={{ animationDelay: `${Math.min(index * 18, 380)}ms` }}
    >
      <span className="art">
        <CardArt src={player.pic} name={player.name} />
      </span>
      <span className="who">
        <b>
          <Link href={`/players/${player.slug}`} className="s5-who-link">
            {player.name}
          </Link>
        </b>
        <span>
          {player.pos} · {player.club}
        </span>
      </span>
      <span className={`s5-gain ${v.kind}`}>
        <b>{v.value}</b>
        <span>{value && v.kind === "up" ? `${valuePer10(player, bar).toFixed(1)} a €10` : v.note}</span>
      </span>
      <span className="s5-stats">
        <span className="s5-stat">
          <b className="sc-chip" style={{ background: scoreColour(player.average).fill, color: scoreColour(player.average).ink }}>{Math.round(player.average)}</b>
          <span>Last 10 avg</span>
        </span>
        <span className="s5-stat" title={start ? start.title : player.x === undefined ? "No game this gameweek" : undefined}>
          <b>
            {start ? (
              <>
                <SourceMark source={start.source} /> {start.percent}%
              </>
            ) : typeof player.p === "number" ? (
              chanceLabel(player.p)
            ) : (
              "—"
            )}
          </b>
          <span>{start ? "Starts" : "Plays"}</span>
        </span>
        <span className="s5-stat" title={player.x === undefined ? "No game this gameweek" : `${Math.round(player.mu ?? 0)} if he plays`}>
          <b className={player.x === undefined ? undefined : "sc-chip"} style={player.x === undefined ? undefined : { background: scoreColour(player.x).fill, color: scoreColour(player.x).ink }}>
            {player.x === undefined ? "—" : Math.round(player.x)}
          </b>
          <span>xScore</span>
        </span>
        <span className="s5-stat" title={player.projection === null ? dash : undefined}>
          <b className={player.projection === null ? undefined : "sc-chip"} style={player.projection === null ? undefined : { background: scoreColour(player.projection).fill, color: scoreColour(player.projection).ink }}>{player.projection === null ? "—" : Math.round(player.projection)}</b>
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
