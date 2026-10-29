"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ARCADE_PACKS_VERSION, ARCADE_TIERS_VERSION, readArcadeCollection, readPackOdds, type Arcade, type ArcadeCollection, type ArcadePack } from "../../lib/arcade";
import { ICON, packRow, packsToFinish, spendGems, STAR_OR_BETTER, type Goal, type PackRow, type TierOdds } from "../../lib/arcadePacks";

const TIERS = ["All", "Bronze", "Silver", "Gold", "Special"] as const;
/** A league pack is titled just "Bronze", "Silver" or "Gold"; anything else (Live Today, Goalkeeper Pack) is special. */
export const tierOf = (title: string) => (["Bronze", "Silver", "Gold"].includes(title.trim()) ? title.trim() : "Special");
const PAGE = 12;
const price = (p: { price: number; currency: string }) => `${p.price.toLocaleString("en-GB")} ${p.currency === "COMMON_GEM" ? "gems" : p.currency === "COMMON_ESSENCE" ? "essence" : p.currency.toLowerCase()}`;
const pct = (x: number) => (x > 0 && x < 0.001 ? "<0.1%" : `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`);
const num = (x: number) => x.toLocaleString("en-GB", { maximumFractionDigits: x < 1 ? 2 : 1 });

type GoalKey = "new" | "icon" | "star" | `mission:${string}`;

/**
 * Gems and packs (owner, 29 Oct 2026): which packs to buy with your gems for an Icon or a Star, for players you do not have yet, or to
 * finish a collection mission, worked out from the odds Sorare publishes for every slot of every pack, with the maths in view.
 * Read on a click only (a few large answers).
 */
export default function ArcadePacks({ arcade }: { arcade: Arcade }) {
  const step = arcade.board?.steps.find((s) => s.number === arcade.board?.current) ?? arcade.board?.steps[0];
  const packs: ArcadePack[] = useMemo(() => step?.packs ?? [], [step]);
  const [odds, setOdds] = useState<TierOdds | "reading" | "outdated" | "failed" | null>(null);
  const [missions, setMissions] = useState<ArcadeCollection[] | "outdated" | null>(null);
  useEffect(() => { void readArcadeCollection().then(setMissions); }, [arcade]); // once per read
  const [goal, setGoal] = useState<GoalKey>("icon");
  const [tier, setTier] = useState<(typeof TIERS)[number]>("All");
  const [page, setPage] = useState(0);
  const owned = useMemo(() => new Set(arcade.cards.map((c) => c.player)), [arcade.cards]);
  const leagueOf = useMemo(() => new Map(arcade.cards.flatMap((c) => (c.teamSlug && c.league ? [[c.teamSlug, c.league.slug] as const] : []))), [arcade.cards]);
  const open = Array.isArray(missions) ? missions.filter((m) => !m.done && !m.expired) : [];
  const mission = goal.startsWith("mission:") ? open.find((m) => m.id === goal.slice(8)) ?? null : null;

  // The goal as Sorare's odds can count it. A mission naming players counts each new one once; one naming clubs or leagues counts
  // cards of them (a club's league read from your own cards of that club, or the pack's own league).
  const goalFor = (pack: ArcadePack): Goal => {
    if (goal === "new") return { label: "players you do not have", need: 1, distinct: true, owned };
    if (goal === "star") return { label: "Star or better", need: 1, distinct: false, tiers: STAR_OR_BETTER, owned };
    if (!mission) return { label: "Icon", need: 1, distinct: false, tiers: ICON, owned };
    const need = Math.max(0, mission.target - mission.progress);
    if (mission.players.length) return { label: mission.title, need, distinct: true, players: new Set(mission.players), owned };
    const teams = new Set(mission.teams.map((t) => t.slug));
    if (mission.leagues.length) {
      if (pack.league && mission.leagues.includes(pack.league)) return { label: mission.title, need, distinct: false, owned };
      for (const [team, league] of leagueOf) if (mission.leagues.includes(league)) teams.add(team);
    }
    return { label: mission.title, need, distinct: false, teams, owned };
  };

  const tierOdds = odds && typeof odds === "object" ? odds : null;
  const rows: PackRow[] = tierOdds
    ? packs.filter((p) => tierOdds[p.slug]?.length).map((p) => packRow(p, tierOdds[p.slug]!, goalFor(p))).sort((a, b) => (a.perHit ?? Infinity) - (b.perHit ?? Infinity))
    : [];
  const gems = arcade.gems ?? 0;
  const listed = rows.filter((r) => tier === "All" || tierOf(r.title) === tier);
  const plan = rows.length ? spendGems(rows, gems) : null;
  const best = plan?.buys[0] ? rows.find((r) => r.slug === plan.buys[0]!.slug) ?? null : null;
  const finish = mission && best && tierOdds ? packsToFinish(tierOdds[best.slug]!, goalFor(packs.find((p) => p.slug === best.slug)!), Math.floor(gems / best.price)) : null;
  const work = async () => {
    setOdds("reading");
    const read = await readPackOdds(Math.max(0, ...packs.map((p) => p.cards)));
    setOdds(read === null ? "failed" : read === "outdated" ? "outdated" : Object.keys(read.tiers).length ? read.tiers : "outdated");
  };
  const name = (r: { title: string; league: string | null }) => `${r.title}${r.league ? ` · ${arcade.set.leagues.find((l) => l.slug === r.league)?.name ?? r.league}` : ""}`;
  if (!packs.length) return null;
  const pages = Math.max(1, Math.ceil(listed.length / PAGE));
  const at = Math.min(page, pages - 1);
  const label = mission ? mission.title : goal === "new" ? "a player you do not have" : goal === "star" ? "a Star or better" : "an Icon";

  return (
    <section className="arc-gems" aria-labelledby="arc-gems-title">
      <div className="arc-plan-head">
        <h2 id="arc-gems-title">Gems and packs</h2>
        <span className="arc-gems-wallet"><b>{gems.toLocaleString("en-GB")}</b> gems · <b>{(arcade.essence ?? 0).toLocaleString("en-GB")}</b> essence</span>
      </div>
      <div className="arc-modes" role="group" aria-label="What to buy for">
        {([["icon", "Icon"], ["star", "Star or better"], ["new", "New players"]] as const).map(([key, text]) => <button key={key} type="button" aria-pressed={goal === key} onClick={() => setGoal(key)}>{text}</button>)}
        {open.map((m) => <button key={m.id} type="button" aria-pressed={goal === `mission:${m.id}`} onClick={() => setGoal(`mission:${m.id}`)}>{m.title} · {m.progress}/{m.target}</button>)}
      </div>
      {missions === "outdated" ? <p className="arc-sub">Collection missions need extension {ARCADE_TIERS_VERSION}: reload it on chrome://extensions.</p> : null}
      {!rows.length ? (
        <div className="arc-lab-card arc-gems-ask">
          <p>{odds === "reading" ? "Reading Sorare's odds for every slot of every pack (a few seconds)…"
            : odds === "outdated" ? `Tier odds need extension ${ARCADE_TIERS_VERSION} (packs ${ARCADE_PACKS_VERSION}): reload it on chrome://extensions.`
            : odds === "failed" ? "Sorare did not give the odds this time; try again in a minute."
            : `${packs.length} packs on this step. Sofix reads the odds Sorare publishes for each slot and works out what your ${gems.toLocaleString("en-GB")} gems buy.`}</p>
          <button type="button" className="arc-small" onClick={() => void work()} disabled={odds === "reading"}>Read the odds</button>
        </div>
      ) : (
        <div className="arc-gems-grid">
          <div className="arc-lab-card arc-gems-answer">
            <small>For {label}, with {gems.toLocaleString("en-GB")} gems</small>
            {plan && plan.buys.length ? (
              <>
                <p className="arc-gems-buy">{plan.buys.map((b) => `${b.count} × ${name(b)}`).join(" + ")}</p>
                <p className="arc-gems-big"><b>{pct(plan.atLeastOne)}</b> at least one{mission ? " card for it" : ""} · <b>{num(plan.expected)}</b> on average · {plan.spent.toLocaleString("en-GB")} gems</p>
                {finish ? <p className="arc-sub">The mission needs {Math.max(0, mission!.target - mission!.progress)} more: with {name(best!)}, half the time in {finish.half ?? "200+"} packs, 9 times in 10 in {finish.nine ?? "200+"}; your gems buy {Math.floor(gems / best!.price)}, which finish it {pct(finish.withinBudget)} of the time.</p> : null}
                {mission ? <p className="arc-sub">{mission.players.length ? "Counts each listed player you do not have once." : "Counts every card of its clubs or league, as Sorare's card count does; only cards from packs or crafting count (Sorare's rule)."}</p> : null}
              </>
            ) : <p>No gem pack here can give {label}.</p>}
          </div>
          <div className="arc-lab-card arc-gems-maths">
            <h3>The maths</h3>
            <p className="arc-sub">A slot&apos;s chance <i>h</i> = Sorare&apos;s odds of the players it counts. One pack gives at least one: 1 − Π(1 − <i>h</i>); on average Σ<i>h</i>. <i>n</i> packs: 1 − (1 − pack)<sup>n</sup>. Gems go to the pack with the most −ln(1 − pack)/price first.</p>
            {best ? <p className="arc-sub">{name(best)}: slots {best.slots.map((h) => pct(h)).join(", ")} → 1 − {best.slots.map((h) => `(1 − ${(h * 100).toFixed(1)}%)`).join("·")} = <b>{pct(best.atLeastOne)}</b> a pack.</p> : null}
          </div>
          <div className="arc-lab-card arc-gems-table">
            <div className="arc-modes" role="group" aria-label="Pack type">
              {TIERS.map((t) => { const count = rows.filter((r) => t === "All" || tierOf(r.title) === t).length; return <button key={t} type="button" aria-pressed={tier === t} disabled={!count} onClick={() => { setTier(t); setPage(0); }}>{t} ({count})</button>; })}
            </div>
            <ol className="arc-packs-list">
              {listed.slice(at * PAGE, (at + 1) * PAGE).map((r, i) => (
                <li key={r.slug} className={r.currency === "COMMON_GEM" && r.price > gems ? "is-off" : undefined} style={{ "--i": i } as CSSProperties}>
                  <span>{name(r)}<small>{price(r)} · {r.slots.length} slots · per slot {pct(Math.max(...r.slots))}</small></span>
                  <span className="arc-packbar" aria-hidden="true"><span style={{ width: `${Math.min(100, r.atLeastOne * 100)}%` }} /></span>
                  <b title="At least one a pack">{pct(r.atLeastOne)}</b>
                  <small className="arc-pack-per">{r.perHit === null ? "—" : `${Math.round(r.perHit).toLocaleString("en-GB")} ${r.currency === "COMMON_GEM" ? "gems" : "essence"} each`}</small>
                </li>
              ))}
            </ol>
            {pages > 1 ? <nav className="arc-pager" aria-label="Pack pages"><button type="button" onClick={() => setPage(at - 1)} disabled={at === 0}>Previous</button><span>Page {at + 1} of {pages}</span><button type="button" onClick={() => setPage(at + 1)} disabled={at >= pages - 1}>Next</button></nav> : null}
          </div>
        </div>
      )}
    </section>
  );
}
