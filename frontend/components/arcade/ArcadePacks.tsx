"use client";

import { useState, type CSSProperties } from "react";
import { ARCADE_PACKS_VERSION, readPackOdds, type Arcade } from "../../lib/arcade";
import { rankPacks, type PackPick } from "../../lib/arcadePlan";

const TIERS = ["All", "Bronze", "Silver", "Gold", "Special"] as const;
/** A league pack is titled just "Bronze", "Silver" or "Gold"; anything else (Live Today, Goalkeeper Pack) is special. */
export const tierOf = (title: string) => (["Bronze", "Silver", "Gold"].includes(title.trim()) ? title.trim() : "Special");

const price =(p: Pick<PackPick, "price" | "currency">) => `${p.price.toLocaleString("en-GB")} ${p.currency === "COMMON_GEM" ? "gems" : p.currency === "COMMON_ESSENCE" ? "essence" : p.currency.toLowerCase()}`;

/** Step 5, the pack lab: which pack to open, from Sorare's published odds: the most players you do not have yet. Read on a click only. */
export default function ArcadePacks({ arcade }: { arcade: Arcade }) {
  const step = arcade.board?.steps.find((s) => s.number === arcade.board?.current) ?? arcade.board?.steps[0];
  const packs = step?.packs ?? [];
  const [ranked, setRanked] = useState<PackPick[] | "reading" | "outdated" | "failed" | null>(null);
  const leagues = new Map(arcade.set.leagues.map((l) => [l.slug, l.name]));
  const work = async () => {
    setRanked("reading");
    const odds = await readPackOdds(Math.max(0, ...packs.map((p) => p.cards)));
    if (odds === null || odds === "outdated") return setRanked(odds === null ? "failed" : "outdated");
    const owned = new Set(arcade.cards.map((c) => c.player));
    setRanked(rankPacks(packs.map((p) => ({ slug: p.slug, title: p.title, league: p.league, price: p.price, currency: p.currency, cards: p.cards })), odds, owned, arcade));
  };
  const [tier, setTier] = useState<(typeof TIERS)[number]>("All");
  if (!packs.length) return null;
  const listed = Array.isArray(ranked) ? ranked.filter((p) => tier === "All" || tierOf(p.title) === tier) : null;
  const best = listed?.find((p) => p.affordable) ?? null;
  const league = (p: PackPick) => (p.league ? leagues.get(p.league) ?? p.league : null);
  const name = (p: PackPick) => `${p.title}${league(p) ? ` · ${league(p)}` : ""}`;
  const most = listed ? Math.max(0.1, ...listed.map((p) => p.fresh)) : 1;
  return (
    <section className="arc-packs" aria-labelledby="arc-packs-title">
      <h2 id="arc-packs-title">Packs</h2>
      <div className="arc-lab">
        <div className="arc-lab-card arc-open">
          <div>
            <h3>{best ? "Open next" : Array.isArray(ranked) ? "No pack within reach" : `${packs.length} packs on this step`}</h3>
            {best ? (
              <>
                <p className="arc-open-name">{name(best)}</p>
                <p role="status"><b>{best.fresh.toFixed(1)} players you do not have yet</b>, on Sorare&apos;s odds, for {price(best)}.</p>
                <p>You have {(arcade.gems ?? 0).toLocaleString("en-GB")} gems and {(arcade.essence ?? 0).toLocaleString("en-GB")} essence.</p>
              </>
            ) : Array.isArray(ranked) ? <p role="status">You cannot afford any {tier === "All" ? "" : `${tier.toLowerCase()} `}pack right now.</p> : (
              <p>{ranked === "reading" ? "Reading Sorare's odds for every pack (a few seconds)…"
                : ranked === "outdated" ? `Pack odds need extension ${ARCADE_PACKS_VERSION}: reload it on chrome://extensions.`
                : ranked === "failed" ? "Sorare did not give the odds this time; try again in a minute."
                : "Sofix reads Sorare's published odds and counts the players each pack would give you that you do not have yet."}</p>
            )}
            {!Array.isArray(ranked) ? <button type="button" className="arc-small" onClick={() => void work()} disabled={ranked === "reading"}>Work out the best pack</button> : null}
          </div>
          <div className="arc-pack" aria-hidden="true">
            <b>{best ? (league(best) ?? best.title).toUpperCase() : arcade.set.name.toUpperCase()}</b>
            <small>{best ? `${best.title.toUpperCase()} · ${best.cards} CARDS` : "COMMON PACK"}</small>
          </div>
        </div>
        {listed ? (
          <div className="arc-lab-card">
            <h3>Each pack, by new players</h3>
            <div className="arc-modes" role="group" aria-label="Pack type">
              {TIERS.map((t) => {
                const count = (ranked as PackPick[]).filter((p) => t === "All" || tierOf(p.title) === t).length;
                return <button key={t} type="button" aria-pressed={tier === t} disabled={!count} onClick={() => setTier(t)}>{t} ({count})</button>;
              })}
            </div>
            <ol className="arc-packs-list">
              {listed.map((p, i) => (
                <li key={p.slug} className={p.affordable ? undefined : "is-off"} style={{ "--i": i } as CSSProperties}>
                  <span>{name(p)}<small>{price(p)} · {p.cards} cards{p.affordable ? "" : " · not enough"}</small></span>
                  <span className="arc-packbar" aria-hidden="true"><span style={{ width: `${(p.fresh / most) * 100}%` }} /></span>
                  <b>{p.fresh.toFixed(1)}</b>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </section>
  );
}
