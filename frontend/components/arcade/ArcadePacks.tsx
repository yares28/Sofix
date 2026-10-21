"use client";

import { useState } from "react";
import { ARCADE_PACKS_VERSION, readPackOdds, type Arcade } from "../../lib/arcade";
import { rankPacks, type PackPick } from "../../lib/arcadePlan";

const price = (p: Pick<PackPick, "price" | "currency">) => `${p.price.toLocaleString("en-GB")} ${p.currency === "COMMON_GEM" ? "gems" : p.currency === "COMMON_ESSENCE" ? "essence" : p.currency.toLowerCase()}`;

/** Step 5: which pack to open, from Sorare's published odds: the most players you do not have yet. Read on a click only. */
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
  if (!packs.length) return null;
  const best = Array.isArray(ranked) ? ranked.find((p) => p.affordable) ?? null : null;
  const name = (p: PackPick) => `${p.title}${p.league ? ` · ${leagues.get(p.league) ?? p.league}` : ""}`;
  return (
    <section className="arc-packs" aria-labelledby="arc-packs-title">
      <h2 id="arc-packs-title">Packs</h2>
      {Array.isArray(ranked) ? (
        <>
          <p className="arc-best" role="status">
            {best ? <><b>Open {name(best)}</b> ({price(best)}): {best.fresh.toFixed(1)} players you do not have yet, on Sorare&apos;s odds.</> : "You cannot afford any pack right now."}
          </p>
          <table className="arc-table">
            <thead><tr><th scope="col">Pack</th><th scope="col">Price</th><th scope="col">Cards</th><th scope="col">New players</th></tr></thead>
            <tbody>
              {ranked.map((p) => (
                <tr key={p.slug} className={p.affordable ? undefined : "is-off"}>
                  <td>{name(p)}</td><td>{price(p)}{p.affordable ? "" : " · not enough"}</td><td>{p.cards}</td><td>{p.fresh.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <div className="arc-read-box">
          <p>{ranked === "reading" ? "Reading Sorare's odds for every pack (a few seconds)…"
            : ranked === "outdated" ? `Pack odds need extension ${ARCADE_PACKS_VERSION}: reload it on chrome://extensions.`
            : ranked === "failed" ? "Sorare did not give the odds this time; try again in a minute."
            : `${packs.length} packs on this step. Sofix reads Sorare's published odds and counts the players each would give you that you do not have yet.`}</p>
          <button type="button" onClick={() => void work()} disabled={ranked === "reading"}>Work out the best pack</button>
        </div>
      )}
    </section>
  );
}
