"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import SegmentedControl from "../SegmentedControl";
import { ARCADE_TIERS_VERSION, readArcadeCollection, readPackOdds, type Arcade, type ArcadeCollection, type ArcadePack } from "../../lib/arcade";
import { completePackOdds, ICON, missionGoal, openBundle, openMany, packRow, packsToFinish, spendGems, TIER_GOALS, type Goal, type TierOdds } from "../../lib/arcadePacks";
import { loadPackSnapshot, savePackSnapshot, type PackSnapshot } from "../../lib/arcadePackStore";

const TIERS = ["All", "Bronze", "Silver", "Gold", "Special"] as const;
export const tierOf = (title: string) => (["Bronze", "Silver", "Gold"].includes(title.trim()) ? title.trim() : "Special");
const PAGE = 8;
const CURRENCIES = ["COMMON_GEM", "COMMON_ESSENCE"] as const;
type Currency = (typeof CURRENCIES)[number];
const UNIT: Record<Currency, string> = { COMMON_GEM: "Gems", COMMON_ESSENCE: "Essence" };
const unit = (currency: string) => currency === "COMMON_GEM" ? "gems" : currency === "COMMON_ESSENCE" ? "essence" : currency.toLowerCase();
const price = (p: { price: number; currency: string }) => `${p.price.toLocaleString("en-GB")} ${unit(p.currency)}`;
const pct = (x: number, certain = x === 1) => x === 1 && !certain ? ">99.9%" : x > 0 && x < 0.001 ? "<0.1%" : x < 1 && x > 0.999 ? ">99.9%" : `${(x * 100).toLocaleString("en-GB", { maximumFractionDigits: 1 })}%`;
const num = (x: number) => x > 0 && x < 0.005 ? "<0.01" : x.toLocaleString("en-GB", { maximumFractionDigits: x < 1 ? 2 : 1 });
const PREFS = "sofix-pack-planner";
const PackChoice = z.object({ slug: z.string().min(1), count: z.number().int().min(1).max(10_000) });
const Options = z.tuple([z.array(PackChoice).min(1).max(100), z.array(PackChoice).min(1).max(100)]);
type PackOptions = z.infer<typeof Options>;
type CalculatorMode = "single" | "compare";

/** Explicit odds reads only. Saved probabilities stay fixed; owned players and hypothetical budgets remain current. */
export default function ArcadePacks({ arcade, busy = false }: { arcade: Arcade; busy?: boolean }) {
  const step = arcade.board?.steps.find(s => s.number === arcade.board?.current) ?? arcade.board?.steps[0];
  const packs = useMemo(() => step?.packs ?? [], [step]);
  const scope = JSON.stringify([arcade.owner, arcade.set.slug, arcade.board?.id, step?.id]);
  const [snapshot, setSnapshot] = useState<PackSnapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [reading, setReading] = useState(false);
  const [message, setMessage] = useState("");
  const [readDetails, setReadDetails] = useState<string[]>([]);
  const [saved, setSaved] = useState(true);
  const [missions, setMissions] = useState<ArcadeCollection[] | "outdated" | null>(null);
  const [goal, setGoal] = useState("icon");
  const [selected, setSelected] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [tier, setTier] = useState("All");
  const [page, setPage] = useState(0);
  const [mode, setMode] = useState<CalculatorMode>("single");
  const [options, setOptions] = useState<PackOptions | null>(null);
  const [budget, setBudget] = useState<Record<Currency, number | null>>({ COMMON_GEM: null, COMMON_ESSENCE: null });
  useEffect(() => {
    let cancelled = false;
    try {
      const kept: unknown = JSON.parse(localStorage.getItem(PREFS) ?? "null");
      if (kept && typeof kept === "object" && "scope" in kept && kept.scope === scope) {
        const p = kept as Record<string, unknown>;
        if (typeof p.selected === "string") setSelected(p.selected);
        if (p.mode === "compare" || p.mode === "single") setMode(p.mode);
        const choices = Options.safeParse(p.options);
        if (choices.success) setOptions(choices.data);
        if (typeof p.goal === "string") setGoal(p.goal);
        if (typeof p.quantity === "number") setQuantity(Math.max(1, Math.min(10_000, Math.floor(p.quantity) || 1)));
        if (typeof p.tier === "string" && TIERS.some(t => t === p.tier)) setTier(p.tier);
        if (p.budget && typeof p.budget === "object") {
          const b = p.budget as Record<string, unknown>;
          const amount = (c: Currency) => typeof b[c] === "number" && Number.isFinite(b[c]) ? Math.max(0, Math.min(1_000_000, Math.floor(b[c]))) : null;
          setBudget({ COMMON_GEM: amount("COMMON_GEM"), COMMON_ESSENCE: amount("COMMON_ESSENCE") });
        }
      }
    } catch { /* Private browsing or an old preference: keep the wallet defaults. */ }
    void loadPackSnapshot(scope).then(value => { if (!cancelled) setSnapshot(value); }).catch(() => {}).finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [scope]);
  useEffect(() => {
    if (ready) try { localStorage.setItem(PREFS, JSON.stringify({ scope, selected, quantity, goal, tier, budget, mode, options })); } catch { /* Odds use their own larger store. */ }
  }, [ready, scope, selected, quantity, goal, tier, budget, mode, options]);
  useEffect(() => { let cancelled = false; void readArcadeCollection().then(value => { if (!cancelled) setMissions(value); }); return () => { cancelled = true; }; }, [arcade]);

  const owned = useMemo(() => new Set(arcade.cards.map(c => c.player)), [arcade.cards]);
  const leagueOf = useMemo(() => new Map(arcade.cards.flatMap(c => c.teamSlug && c.league ? [[c.teamSlug, c.league.slug] as const] : [])), [arcade.cards]);
  const open = useMemo(() => Array.isArray(missions) ? missions.filter(m => !m.done && !m.expired) : [], [missions]);
  const mission = goal.startsWith("mission:") ? open.find(m => m.id === goal.slice(8)) ?? null : null;
  const incomplete = arcade.cardsCut && (goal === "new" || Boolean(mission));
  const tierGoal = TIER_GOALS.find(t => t.key === goal);
  const goalFor = useCallback((pack: ArcadePack): Goal => mission ? missionGoal(mission, pack.league, owned, leagueOf)
    : goal === "new" ? { label: "New players", need: 1, distinct: true, owned }
    : { label: tierGoal?.label ?? "Icon", need: 1, distinct: false, tiers: tierGoal?.tiers ?? ICON, owned }, [mission, owned, leagueOf, goal, tierGoal]);
  const label = mission?.title ?? (goal === "new" ? "New players" : tierGoal?.label ?? "Icon");
  const name = (p: { title: string; league: string | null }) => `${p.title}${p.league ? ` · ${arcade.set.leagues.find(l => l.slug === p.league)?.name ?? p.league}` : ""}`;
  const usable = useCallback((p: ArcadePack) => completePackOdds(snapshot?.odds[p.slug], p.cards), [snapshot]);
  const rows = useMemo(() => packs.filter(usable).map(p => packRow(p, snapshot!.odds[p.slug]!, goalFor(p))).sort((a, b) => (a.perHit ?? Infinity) - (b.perHit ?? Infinity)), [packs, usable, snapshot, goalFor]);
  const pack = packs.find(p => p.slug === selected) ?? packs.find(p => p.currency === "COMMON_GEM") ?? packs[0];
  const slots = pack && usable(pack) ? snapshot!.odds[pack.slug]! : null;
  const chosenGoal = useMemo(() => pack ? goalFor(pack) : null, [pack, goalFor]);
  const result = slots && chosenGoal ? openMany(slots, chosenGoal, quantity) : null;
  const average = (n: number) => `${incomplete ? "Up to " : ""}${num(n)} ${goal === "new" || mission ? `new player${n === 1 ? "" : "s"}` : `${label} card${n === 1 ? "" : "s"}`} on average`;
  const budgetOf = (c: Currency) => budget[c] ?? (c === "COMMON_GEM" ? arcade.gems : arcade.essence) ?? 0;
  const gemBudget = budgetOf("COMMON_GEM"), essenceBudget = budgetOf("COMMON_ESSENCE");
  const plans = useMemo(() => CURRENCIES.map(currency => ({ currency, plan: spendGems(rows.filter(r => packs.find(p => p.slug === r.slug)?.canBuy), currency === "COMMON_GEM" ? gemBudget : essenceBudget, currency) })), [rows, packs, gemBudget, essenceBudget]);
  const finish = useMemo(() => mission && slots && chosenGoal ? packsToFinish(slots, chosenGoal, Math.min(200, quantity)) : null, [mission, slots, chosenGoal, quantity]);
  const listed = (snapshot ? [...rows.map(r => packs.find(p => p.slug === r.slug)!), ...packs.filter(p => !usable(p))] : packs).filter(p => tier === "All" || tierOf(p.title) === tier);
  const pages = Math.max(1, Math.ceil(listed.length / PAGE)), at = Math.min(page, pages - 1);
  const work = async () => {
    setReading(true); setMessage(""); setReadDetails([]);
    try {
      const read = await readPackOdds(Math.max(0, ...packs.map(p => p.cards)));
      if (read === "outdated") setMessage(`Reload extension ${ARCADE_TIERS_VERSION} on chrome://extensions.${snapshot ? " Saved odds kept." : ""}`);
      else if (!read) setMessage(`Sorare did not return the odds.${snapshot ? " Saved odds kept." : " Try again with Sorare open."}`);
      else if (!packs.every(p => completePackOdds(read.tiers[p.slug], p.cards))) {
        setMessage(`Could not read every pack slot.${snapshot ? " Saved odds kept." : " See read details."}`);
        setReadDetails(packs.filter(p => !completePackOdds(read.tiers[p.slug], p.cards)).map(p => {
          const slots = read.tiers[p.slug] ?? [];
          return `${name(p)}: ${slots.filter(Boolean).length}/${p.cards} slots; tier totals ${slots.map(s => pct(Object.values(s.tiers).reduce((a, b) => a + b, 0))).join(", ") || "missing"}; player totals ${slots.map(s => pct(Object.values(s.players).reduce((a, b) => a + b.p, 0))).join(", ") || "missing"}.`;
        }));
      }
      else {
        const fresh = { scope, at: Date.now(), odds: read.tiers };
        setSnapshot(fresh);
        try { await savePackSnapshot(fresh); setSaved(true); }
        catch { setSaved(false); setMessage("Odds read; browser storage could not save them."); }
      }
    } catch { setMessage(`Could not read the odds.${snapshot ? " Saved odds kept." : " Try again with Sorare open."}`); }
    finally { setReading(false); }
  };
  const initialOptions = (): PackOptions => [[{ slug: pack?.slug ?? "", count: quantity }], [{ slug: packs.find(p => p.slug !== pack?.slug && p.currency === pack?.currency)?.slug ?? packs.find(p => p.slug !== pack?.slug)?.slug ?? pack?.slug ?? "", count: 1 }]];
  const changeMode = (value: CalculatorMode) => { if (value === "compare" && !options) setOptions(initialOptions()); setMode(value); };
  if (!packs.length || !pack) return null;

  return (
    <section className="arc-gems" aria-labelledby="arc-gems-title">
      <header className="arc-pack-heading">
        <div><h2 id="arc-gems-title">Gems and packs</h2><span className="arc-gems-wallet"><b>{arcade.gems === null ? "—" : num(arcade.gems)}</b> gems · <b>{arcade.essence === null ? "—" : num(arcade.essence)}</b> essence</span></div>
        <div className="arc-odds-read"><button type="button" className="arc-small" disabled={!ready || reading || (busy && !arcade.owner)} onClick={() => void work()}>{reading ? "Reading odds…" : snapshot ? "Read odds again" : "Read odds"}</button>{snapshot ? <time dateTime={new Date(snapshot.at).toISOString()}>{saved ? "Saved" : "Read"} {new Date(snapshot.at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" })}</time> : null}</div>
      </header>
      {message ? <p className="arc-pack-status" role="status">{message}</p> : null}
      {readDetails.length ? <details className="arc-gems-maths"><summary>Read details</summary><p>{readDetails.join(" ")}</p></details> : null}
      <div className={`arc-pack-toolbar${mode === "compare" ? " is-comparing" : ""}`}>
        <label>Goal<select name="pack-goal" autoComplete="off" aria-label="Goal" value={goal} onChange={e => { setGoal(e.target.value); setPage(0); }}><optgroup label="Players">{TIER_GOALS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}<option value="new">New players</option></optgroup>{open.length ? <optgroup label="Collections">{open.map(m => <option key={m.id} value={`mission:${m.id}`}>{m.title} · {m.progress}/{m.target}</option>)}</optgroup> : null}</select></label>
        {mode === "single" ? <label>Pack type<select name="pack-type" autoComplete="off" aria-label="Pack type" value={tier} onChange={e => { setTier(e.target.value); setPage(0); }}>{TIERS.map(t => <option key={t} value={t}>{t} ({packs.filter(p => t === "All" || tierOf(p.title) === t).length})</option>)}</select></label> : null}
        <SegmentedControl<CalculatorMode> label="Pack calculator mode" value={mode} onChange={changeMode} options={[{ value: "single", label: "Single pack" }, { value: "compare", label: "Compare options" }]} />
      </div>
      {missions === "outdated" ? <p className="arc-sub">Collection goals need extension {ARCADE_TIERS_VERSION}.</p> : null}
      {mode === "compare" ? <PackComparison packs={packs} odds={snapshot?.odds ?? null} options={options ?? initialOptions()} onChange={setOptions} goalFor={goalFor} label={label} owned={owned} name={name} distinct={goal === "new" || Boolean(mission)} incomplete={incomplete} /> : <div className="arc-pack-workspace">
        <section className="arc-pack-calculator" aria-label="Pack calculator" aria-busy={!ready}>
          <div className="arc-pack-choice"><label>Choose pack<select name="pack" autoComplete="off" aria-label="Choose pack" value={pack.slug} onChange={e => setSelected(e.target.value)}>{packs.map(p => <option key={p.slug} value={p.slug}>{name(p)} · {price(p)}</option>)}</select></label><div className="arc-pack-quantity"><label htmlFor="arc-pack-count">Number of packs</label><div><button type="button" aria-label="Fewer packs" disabled={quantity <= 1} onClick={() => setQuantity(quantity - 1)}>−</button><input id="arc-pack-count" name="pack-count" autoComplete="off" type="number" inputMode="numeric" min={1} max={10_000} value={quantity} onChange={e => setQuantity(Math.max(1, Math.min(10_000, Math.floor(+e.target.value) || 1)))} /><button type="button" aria-label="More packs" disabled={quantity >= 10_000} onClick={() => setQuantity(quantity + 1)}>+</button></div></div></div>
          <div className="arc-pack-total"><p><b>{price({ ...pack, price: pack.price * quantity })}</b><span>{quantity * pack.cards} cards · {price(pack)} / pack</span></p><small>{!pack.canBuy ? "Unavailable on this step" : pack.price * quantity > (pack.currency === "COMMON_GEM" ? arcade.gems ?? 0 : arcade.essence ?? 0) ? `${num(pack.price * quantity - (pack.currency === "COMMON_GEM" ? arcade.gems ?? 0 : arcade.essence ?? 0))} ${unit(pack.currency)} short of wallet` : "Within your wallet"}</small></div>
          <div className="arc-pack-goal" aria-live="polite" data-testid="pack-goal-result"><span>{label}{mission ? ` · ${mission.progress}/${mission.target}` : ""}{incomplete ? " · Collection incomplete" : ""}</span>{result ? <><strong>{incomplete ? "Up to " : ""}{pct(result.atLeastOne, result.certain)} <small>chance of at least one</small></strong><p>{average(result.expected)} · {incomplete ? "at least " : ""}{(result.atLeastOne === 1 && !result.certain ? "<0.1%" : pct(1 - result.atLeastOne))} chance of none</p></> : <strong className="arc-pack-pending">{ready ? "Read odds to calculate" : "Loading saved odds…"}</strong>}</div>
          <table className="arc-pack-outcomes"><caption>Tier odds</caption><thead><tr><th scope="col">At least one</th><th scope="col">1 pack</th><th scope="col">{quantity} {quantity === 1 ? "pack" : "packs"}</th><th scope="col">Avg cards<br />in {quantity} {quantity === 1 ? "pack" : "packs"}</th></tr></thead><tbody>{TIER_GOALS.map(t => {
            const g = { label: t.label, need: 1, distinct: false, tiers: t.tiers, owned };
            const one = slots ? openMany(slots, g, 1) : null, many = slots ? openMany(slots, g, quantity) : null;
            return <tr key={t.key} className={t.key === goal ? "is-selected" : undefined}><th scope="row">{t.label}</th><td>{one ? pct(one.atLeastOne, one.certain) : "—"}</td><td>{many ? pct(many.atLeastOne, many.certain) : "—"}</td><td>{many ? num(many.expected) : "—"}</td></tr>;
          })}</tbody></table>
          {mission && finish ? <p className="arc-pack-mission">{incomplete ? "Up to " : ""}{pct(finish.withinBudget)} to finish in {Math.min(200, quantity)} packs · 50% in {incomplete ? "at least " : ""}{finish.half ?? "200+"} packs. Each new player counts once.</p> : null}
        </section>
        <section className="arc-pack-catalogue" aria-label="Compare packs">
          <div className="arc-pack-list-head"><h3>Compare packs</h3><span>{label} · 1 pack</span></div>
          <ol>{listed.slice(at * PAGE, (at + 1) * PAGE).map(p => {
            const row = rows.find(r => r.slug === p.slug);
            return <li key={p.slug}><button type="button" aria-pressed={p.slug === pack.slug} onClick={() => setSelected(p.slug)}><span><b>{name(p)}</b><small>{price(p)} · {p.cards} {p.cards === 1 ? "card" : "cards"}{!p.canBuy ? " · unavailable" : ""}</small></span><span className="arc-pack-one"><b>{row ? `${incomplete ? "≤" : ""}${pct(row.atLeastOne, row.certain)}` : "—"}</b><small>{row ? `${incomplete ? "≤" : ""}${num(row.expected)} average` : "Odds unread"}</small></span></button></li>;
          })}</ol>
          {pages > 1 ? <nav className="arc-pager" aria-label="Pack pages"><button type="button" onClick={() => setPage(at - 1)} disabled={at === 0}>Previous</button><span>{at + 1} / {pages}</span><button type="button" onClick={() => setPage(at + 1)} disabled={at >= pages - 1}>Next</button></nav> : null}
        </section>
      </div>}
      {mode === "single" ? <section className="arc-pack-budgets" aria-label="Budget recommendations"><header><h3>{incomplete ? "Budget comparison" : "Best chance for your budget"}</h3>{budget.COMMON_GEM !== null || budget.COMMON_ESSENCE !== null ? <button type="button" className="arc-small" onClick={() => setBudget({ COMMON_GEM: null, COMMON_ESSENCE: null })}>Back to my wallet</button> : null}</header><div>{plans.map(({ currency, plan }) => <article key={currency} data-testid={`budget-${currency}`}><label>{UNIT[currency]} to spend<input name={`budget-${currency}`} autoComplete="off" type="number" inputMode="numeric" min={0} max={1_000_000} step={currency === "COMMON_GEM" ? 10 : 1000} value={budgetOf(currency)} onChange={e => setBudget({ ...budget, [currency]: Math.max(0, Math.min(1_000_000, Math.floor(+e.target.value) || 0)) })} /></label>{!snapshot ? <p>Read odds to compare</p> : plan.buys.length ? <div><h4>{plan.buys.map(b => `${b.count} × ${name(b)}`).join(" + ")}</h4><p>{incomplete ? "Up to " : ""}{pct(plan.atLeastOne, plan.certain)} chance of at least one {label.toLowerCase()} · {average(plan.expected)}</p><small>{num(plan.spent)} {unit(currency)} spent · {num(budgetOf(currency) - plan.spent)} left</small></div> : <p>{rows.some(r => r.currency === currency && r.atLeastOne > 0) ? "Budget buys no qualifying pack" : `No ${unit(currency)} pack offers ${label.toLowerCase()}`}</p>}</article>)}</div></section> : null}
      <details className="arc-gems-maths"><summary>How odds are calculated</summary><p>At least one = 1 − ∏(1 − slot chance)ⁿ. Average cards = n × sum of slot chances; new players count once, excluding players you own. When the collection read is incomplete, new-player figures are upper estimates and no option is labelled the winner. For mixed options, multiply the no-hit chances of all chosen packs. Pack openings are treated as independent with unchanged odds. Player estimates scale each tier’s player weights to its published share; Sorare’s raw player percentages need not sum to that share. Icon or Star includes Star+. Impact, Roster and Reserve include their + variants. Budget combinations maximise the chance of at least one qualifying player, not mission completion. Mission simulations stop at 200 packs.</p></details>
    </section>
  );
}


/** Two editable baskets share the current goal and saved odds. A missing row makes the whole option unknown. */
function PackComparison({ packs, odds, options, onChange, goalFor, label, owned, name, distinct, incomplete }: {
  packs: ArcadePack[]; odds: TierOdds | null; options: PackOptions; onChange: (options: PackOptions) => void;
  goalFor: (pack: ArcadePack) => Goal; label: string; owned: Set<string>; distinct: boolean; incomplete: boolean;
  name: (pack: { title: string; league: string | null }) => string;
}) {
  const [pages, setPages] = useState([0, 0]);
  const calculate = useCallback((choices: PackOptions[number], goal: (pack: ArcadePack) => Goal) => {
    const rows = choices.map(choice => {
      const pack = packs.find(p => p.slug === choice.slug), slots = odds?.[choice.slug];
      return pack && completePackOdds(slots, pack.cards) ? { row: packRow(pack, slots, goal(pack)), count: choice.count } : null;
    });
    return rows.some(row => row === null) ? null : openBundle(rows.filter(row => row !== null));
  }, [packs, odds]);
  const results = useMemo(() => options.map(choices => ({
    goal: calculate(choices, goalFor),
    tiers: TIER_GOALS.map(t => calculate(choices, () => ({ label: t.label, need: 1, distinct: false, tiers: t.tiers, owned }))),
  })), [options, calculate, goalFor, owned]);
  const a = results[0]!.goal, b = results[1]!.goal;
  const better = !incomplete && a && b && Math.abs(a.atLeastOne - b.atLeastOne) >= 0.0005 ? a.atLeastOne > b.atLeastOne ? 0 : 1 : null;
  const update = (i: number, rows: PackOptions[number]) => onChange([i === 0 ? rows : options[0], i === 1 ? rows : options[1]]);
  return <section className="arc-pack-comparison" aria-label="Compare options">
    <div className="arc-mix-options">{options.map((choices, i) => {
      const optionName = `Option ${i === 0 ? "A" : "B"}`, result = results[i]!.goal;
      const metadata = choices.map(c => packs.find(p => p.slug === c.slug));
      const costs: Record<string, number> = {};
      choices.forEach((c, j) => { const p = metadata[j]; if (p) costs[p.currency] = (costs[p.currency] ?? 0) + p.price * c.count; });
      const total = choices.reduce((sum, c) => sum + c.count, 0), cards = choices.reduce((sum, c, j) => sum + c.count * (metadata[j]?.cards ?? 0), 0);
      const at = Math.min(pages[i] ?? 0, Math.ceil(choices.length / PAGE) - 1);
      const nextPack = packs.find(p => !choices.some(c => c.slug === p.slug));
      const changeRow = (j: number, patch: Partial<PackOptions[number][number]>) => update(i, choices.map((c, k) => k === j ? { ...c, ...patch } : c));
      return <section className="arc-mix-option" key={optionName} aria-label={optionName}>
        <header><h3>{optionName}</h3>{better === i ? <span className="arc-mix-better">Higher chance</span> : null}</header>
        <div className="arc-mix-rows">{choices.slice(at * PAGE, (at + 1) * PAGE).map((choice, offset) => {
          const j = at * PAGE + offset, n = j + 1;
          return <div className="arc-mix-row" key={j}>
            <label><span className="sr-only">Pack {n}</span><select aria-label={`Pack ${n}`} name={`option-${i}-pack-${j}`} autoComplete="off" value={choice.slug} onChange={e => changeRow(j, { slug: e.target.value })}>
              {!metadata[j] ? <option value={choice.slug}>Pack unavailable</option> : null}
              {packs.map(p => <option key={p.slug} value={p.slug} disabled={p.slug !== choice.slug && choices.some(c => c.slug === p.slug)}>{name(p)} · {price(p)}{!p.canBuy ? " · unavailable" : ""}</option>)}
            </select></label>
            <div className="arc-pack-quantity"><label className="sr-only" htmlFor={`option-${i}-count-${j}`}>Quantity {n}</label><div>
              <button type="button" aria-label={`Fewer packs in row ${n}`} disabled={choice.count === 1} onClick={() => changeRow(j, { count: choice.count - 1 })}>−</button>
              <input id={`option-${i}-count-${j}`} name={`option-${i}-count-${j}`} autoComplete="off" type="number" inputMode="numeric" min={1} max={10_000} value={choice.count} onChange={e => changeRow(j, { count: Math.max(1, Math.min(10_000, Math.floor(+e.target.value) || 1)) })} />
              <button type="button" aria-label={`More packs in row ${n}`} disabled={choice.count === 10_000} onClick={() => changeRow(j, { count: choice.count + 1 })}>+</button>
            </div></div>
            {choices.length > 1 ? <button type="button" className="arc-mix-remove" aria-label={`Remove pack ${n}`} onClick={() => update(i, choices.filter((_, k) => k !== j))}>×</button> : <span className="arc-mix-remove-space" />}
          </div>;
        })}</div>
        {choices.length > PAGE ? <nav className="arc-pager" aria-label={`${optionName} pack pages`}><button type="button" disabled={at === 0} onClick={() => setPages(pages.map((p, k) => k === i ? at - 1 : p))}>Previous</button><span>{at + 1} / {Math.ceil(choices.length / PAGE)}</span><button type="button" disabled={(at + 1) * PAGE >= choices.length} onClick={() => setPages(pages.map((p, k) => k === i ? at + 1 : p))}>Next</button></nav> : null}
        <button type="button" className="arc-mix-add" disabled={!nextPack} onClick={() => { if (nextPack) { update(i, [...choices, { slug: nextPack.slug, count: 1 }]); setPages(pages.map((p, k) => k === i ? Math.floor(choices.length / PAGE) : p)); } }}>Add pack</button>
        <div className="arc-mix-total"><strong data-testid="option-cost">{metadata.every(Boolean) ? Object.entries(costs).map(([currency, amount]) => price({ currency, price: amount })).join(" + ") : "Total unavailable"}</strong><span>{total} {total === 1 ? "pack" : "packs"}{metadata.every(Boolean) ? ` · ${cards} ${cards === 1 ? "card" : "cards"}${metadata.some(p => p && !p.canBuy) ? " · unavailable on this step" : ""}` : " · pack unavailable"}</span></div>
        <div className="arc-mix-goal" data-testid="option-goal" aria-live="polite">{incomplete ? <small className="arc-mix-incomplete">Collection incomplete</small> : null}{result ? <><strong>{incomplete ? "Up to " : ""}{pct(result.atLeastOne, result.certain)} <small>at least one {distinct ? "new player" : label}</small></strong><p>{incomplete ? "Up to " : ""}{num(result.expected)} {distinct ? `new player${result.expected === 1 ? "" : "s"}` : `${label} card${result.expected === 1 ? "" : "s"}`} on average · {incomplete ? "at least " : ""}{result.none === 0 && !result.certain ? "<0.1%" : pct(result.none)} chance of none</p></> : <p>{odds ? "Odds unavailable for this option" : "Read odds to compare"}</p>}</div>
      </section>;
    })}</div>
    <table className="arc-mix-outcomes"><caption>Compare tier odds</caption><thead><tr><th rowSpan={2} scope="col">At least one</th><th colSpan={2} scope="colgroup">Option A</th><th colSpan={2} scope="colgroup">Option B</th></tr><tr><th scope="col">Chance</th><th scope="col">Avg cards</th><th scope="col">Chance</th><th scope="col">Avg cards</th></tr></thead><tbody>{TIER_GOALS.map((t, j) => <tr key={t.key} className={t.label === label ? "is-selected" : undefined}><th scope="row">{t.label}</th>{results.map((r, i) => { const value = r.tiers[j]; return <Fragment key={i}><td>{value ? pct(value.atLeastOne, value.certain) : "—"}</td><td>{value ? num(value.expected) : "—"}</td></Fragment>; })}</tr>)}</tbody></table>
  </section>;
}
