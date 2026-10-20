"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { CollectionCard } from "../../lib/play";
import {
  euro,
  prices,
  signedEuro,
  sortPriced,
  type PriceOrder,
  type Priced,
} from "../../lib/prices";
import CardArt from "./CardArt";

const ORDERS: { key: PriceOrder; label: string }[] = [
  { key: "gain", label: "biggest gain" },
  { key: "loss", label: "biggest loss" },
  { key: "value", label: "what it is worth" },
];
const tone = (profit: number) =>
  profit > 0.005 ? "up" : profit < -0.005 ? "down" : "flat";
const percent = (ratio: number) =>
  `${ratio > 0 ? "+" : ratio < 0 ? "−" : ""}${Math.round(Math.abs(ratio) * 100)}%`;

/** The headline number counts up from nought (at once under reduced motion). */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return setShown(value);
    let frame = 0;
    const from = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - from) / 800);
      setShown(value * (1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{signedEuro(shown)}</>;
}

/**
 * Prices: one sentence says how far the gallery is up or down on what was paid; a tide line puts every bought card on what it cost,
 * risen by its gain or sunk by its loss; a wall lists them by gain, loss or worth; the cards not bought come last at their worth.
 */
export default function PricesView({
  collection,
}: {
  collection: CollectionCard[];
}) {
  const p = useMemo(() => prices(collection), [collection]);
  const [order, setOrder] = useState<PriceOrder>("gain");
  const tide = useMemo(() => sortPriced(p.bought, "gain"), [p.bought]);
  const wall = useMemo(() => sortPriced(p.bought, order), [p.bought, order]);
  const reach = Math.max(0.01, ...p.bought.map((c) => Math.abs(c.profit)));
  const overall = tone(p.profit);

  return (
    <div className={`px px-${overall}`}>
      <section className="px-hero">
        <p className="s5-eyebrow">Prices</p>
        <h1>
          <span>Your gallery is</span>{" "}
          <b className="px-total">
            {overall === "flat" ? "level" : overall === "up" ? "up" : "down"}{" "}
            <span aria-live="polite">
              <CountUp value={p.profit} />
            </span>
          </b>
        </h1>
        <p className="px-sub">
          <span>
            paid <b>{euro(p.paid)}</b> for {p.bought.length} cards
          </span>
          <span>
            worth <b>{euro(p.worth)}</b> now
          </span>
          <span className="px-count">
            <i className="up">{p.up} up</i>{" "}
            <i className="down">{p.down} down</i>
          </span>
        </p>
      </section>

      {tide.length ? (
        <>
          <p className="px-legend" aria-hidden="true">
            <span>
              <i className="line" />
              what you paid
            </span>
            <span>
              <i className="up" />
              gained since
            </span>
            <span>
              <i className="down" />
              lost since
            </span>
          </p>
          <figure
            className="px-tide"
            aria-label="Every bought card on what it cost: above the line it gained, below it lost"
          >
            <ol>
              {tide.map((card, i) => (
                <li
                  key={card.slug}
                  className={tone(card.profit)}
                  style={
                    {
                      "--h": Math.abs(card.profit) / reach,
                      "--i": Math.min(i, 40),
                    } as CSSProperties
                  }
                  title={`${card.name}: paid ${euro(card.paid)}, worth ${euro(card.value)} (${signedEuro(card.profit)})`}
                >
                  <Link
                    className="px-hit"
                    href={`/players/${card.player}`}
                    prefetch={false}
                    aria-label={`${card.name}: ${signedEuro(card.profit)}`}
                  />
                  <span className="px-bar" aria-hidden="true" />
                  {/* the best gain and the worst loss carry their card, the rest are bars that name themselves on hover */}
                  {(i === 0 && card.profit > 0) ||
                  (i === tide.length - 1 && card.profit < 0) ? (
                    <span
                      className={`px-flag${i === 0 ? "" : " end"}`}
                      aria-hidden="true"
                    >
                      <span className="art">
                        <CardArt src={card.pic} name={card.name} />
                      </span>
                      <span>
                        <b>{signedEuro(card.profit)}</b>
                        <small>{card.name}</small>
                      </span>
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </figure>
        </>
      ) : null}

      {wall.length ? (
        <>
          <h2 className="px-next">
            <span>Sorted by</span>
            <select
              className="sx-word"
              aria-label="Order"
              value={order}
              onChange={(e) => setOrder(e.target.value as PriceOrder)}
            >
              {ORDERS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </h2>
          <ol className="px-wall" key={order}>
            {wall.map((card, i) => (
              <Tile key={card.slug} card={card} order={i} />
            ))}
          </ol>
        </>
      ) : null}

      {p.free.length ? (
        <>
          <h2 className="px-next">
            Not bought <span>crafted or won · worth {euro(p.freeWorth)}</span>
          </h2>
          <ol className="px-wall">
            {p.free.map((card, i) => (
              <li
                key={card.slug}
                className="px-tile"
                style={{ "--i": Math.min(i, 30) } as CSSProperties}
              >
                <Link
                  className="art"
                  href={`/players/${card.player}`}
                  prefetch={false}
                  aria-label={`${card.name}: open his page`}
                >
                  <CardArt src={card.pic} name={card.name} />
                  <b className="px-badge">{euro(card.value)}</b>
                </Link>
                <span className="px-name">{card.name}</span>
                <span className="px-trade">cost you nothing</span>
              </li>
            ))}
          </ol>
        </>
      ) : null}

      {p.unvalued ? (
        <p className="px-note">
          {p.unvalued} {p.unvalued === 1 ? "card has" : "cards have"} no Sorare
          value yet and {p.unvalued === 1 ? "is" : "are"} left out.
        </p>
      ) : null}
    </div>
  );
}

function Tile({ card, order }: { card: Priced; order: number }) {
  return (
    <li
      className={`px-tile ${tone(card.profit)}`}
      style={{ "--i": Math.min(order, 30) } as CSSProperties}
    >
      <Link
        className="art"
        href={`/players/${card.player}`}
        prefetch={false}
        aria-label={`${card.name}: open his page`}
      >
        <CardArt src={card.pic} name={card.name} />
        <b className="px-badge">{signedEuro(card.profit)}</b>
      </Link>
      <span className="px-name">{card.name}</span>
      <span className="px-trade">
        {euro(card.paid)} <span aria-hidden="true">→</span>
        <span className="visually-hidden">now</span> {euro(card.value)}{" "}
        <i>{percent(card.ratio)}</i>
      </span>
    </li>
  );
}
