"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { scoreColour } from "../../lib/cards";
import {
  ANY, choice, customTeam, day, eur, laneKey, ladder, LEAGUES, oppCode, prize, ranked, shortName, shortPrize, TARGETS, tier, within,
  type Fixture, type Season, type Settings, type SquadClub, type TeamMode, type Tile, type SquadPlayer, type SquadsPage, type SquadSeven, type SquadTeam, type Target,
} from "../../lib/squads";
import CardArt from "../cards/CardArt";
import SorareImage from "../play/SorareImage";
import SegmentedControl from "../SegmentedControl";

const POSITIONS = [["GK", "Goalkeeper"], ["DEF", "Defenders"], ["MID", "Midfielders"], ["FWD", "Forwards"]] as const;
const PAGE = 12;
const CHART = 200; // px of bar height for the top of the scale

/** €12.34 counted up from 0 once, after mount; the final value on the server and under reduced motion. */
function useCents(target: number): number {
  const [value, setValue] = useState(target);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setValue(target); return; }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 800);
      setValue(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return value;
}

/** The page's address: league, team (one club, or two and the pair), season, budget, target and your cards. */
function href(code: string, club: string | null, s: Settings, season: Season, team: TeamMode = "one", pair?: string) {
  const q = new URLSearchParams({ league: code, budget: String(s.budget), cover: String(Math.round(s.target * 100)) });
  if (team === "two") {
    q.set("team", "two");
    if (pair) q.set("pair", pair);
  } else if (club) q.set("club", club);
  if (!s.mine) q.set("mine", "0");
  if (season === "start") q.set("season", "start");
  return `/squads?${q}`;
}

export default function SquadsView({ data, settings: initial }: { data: SquadsPage; settings: Settings }) {
  const club = data.club!;
  const router = useRouter();
  const [budget, setBudget] = useState(initial.budget);
  const [draft, setDraft] = useState(String(initial.budget));
  const [target, setTarget] = useState<Target>(initial.target);
  const [mine, setMine] = useState(initial.mine);
  const [page, setPage] = useState(0);
  const settings = useMemo(() => ({ budget, target, mine }), [budget, target, mine]);

  useEffect(() => {
    const pairId = data.tiles.find((t) => t.club === club.club)?.pair?.id;
    window.history.replaceState(null, "", href(data.code, club.club, settings, data.season, data.team, pairId)); // shareable, no new render on the server
  }, [data.code, data.tiles, club.club, settings, data.season, data.team]);

  const order = useMemo(() => ranked(data.tiles, settings), [data.tiles, settings]);
  const mineTile = data.tiles.find((t) => t.club === club.club)!;
  const verdict = choice(mineTile, settings);
  const lane = mine ? "owned" : "full";
  const proLane = club.pro[laneKey(target)]?.[lane] ?? [];
  // start of season, nothing at the target inside the budget: the best team it buys, shown with its coverage
  const proEntry = within(proLane, budget) ?? (verdict.mode === "short" ? within(club.pro[ANY]?.[lane], budget) : null) ?? proLane[0] ?? null;
  const team = proEntry ? club.teams.find((t) => t.id === proEntry.id) ?? null : null;
  const arenaEntry = within(club.arena[lane], budget) ?? club.arena[lane]?.[0] ?? null;
  const seven = arenaEntry ? club.sevens.find((s) => s.id === arenaEntry.id) ?? null : null;
  const showArena = verdict.mode === "arena" && seven !== null;
  // Q6: swap a card of the Pro team; the page scores the new team as the backend scores its own (customTeam)
  const [swaps, setSwaps] = useState<Record<string, string>>({});
  const [swapAt, setSwapAt] = useState<string | null>(null);
  const baseKey = `${club.club}|${team?.id ?? ""}|${showArena}`;
  const [swapBase, setSwapBase] = useState(baseKey);
  if (swapBase !== baseKey) { setSwapBase(baseKey); setSwaps({}); setSwapAt(null); } // a new team: its own cards again
  const scoring = {
    captain: data.captain, season: data.seasonBonus, firstStep: data.board?.[0]?.target ?? null,
    measure: data.team === "any" ? ("median" as const) : ("best" as const),
  };
  const swapped = !showArena && team !== null && Object.keys(swaps).length > 0;
  const shown: SquadTeam | null = swapped && team
    ? { ...team, ...customTeam(club, team.cards.map((s) => swaps[s] ?? s), scoring), xsReal: [], xsExp: [], ladder: null, proof: null }
    : team;
  const cards = showArena && seven ? [seven.gk, ...seven.outs, ...[seven.gsub, seven.osub].filter((s): s is string => !!s)] : shown?.cards ?? [];
  const setBudgetFrom = (raw: string) => {
    setDraft(raw);
    const n = Math.round(Number(raw));
    if (Number.isFinite(n) && n >= 1 && n <= 5000) { setBudget(n); setPage(0); }
  };

  return (
    <div className="sq-page">
      <form className="sq-filters" aria-label="Filters" onSubmit={(e) => e.preventDefault()}>
        <div className="sq-field">
          <span>Team</span>
          <SegmentedControl label="Team" value={data.team}
            options={[{ value: "one", label: "One club" }, { value: "two", label: "Two clubs" }, { value: "any", label: "Any clubs" }]}
            onChange={(v) => router.push(href(data.code, null, settings, data.season, v as TeamMode))} />
        </div>
        <div className="sq-field">
          <span>Season</span>
          <SegmentedControl label="Season" value={data.season}
            options={[{ value: "now", label: "Now" }, { value: "start", label: "Start of season" }]}
            onChange={(v) => router.push(href(data.code, data.team === "one" ? club.club : null, settings, v as Season, data.team, data.tiles.find((t) => t.club === club.club)?.pair?.id))} />
        </div>
        <label className="sq-field">
          <span>League</span>
          <select name="league" value={data.code} onChange={(e) => router.push(href(e.target.value, null, settings, data.season, data.team))}>
            {LEAGUES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </label>
        <label className="sq-field sq-budget">
          <span>Budget</span>
          <span className="sq-euro"><i aria-hidden="true">€</i><input name="budget" autoComplete="off" inputMode="numeric" value={draft} onChange={(e) => setBudgetFrom(e.target.value)} aria-label="Budget in euros" /></span>
        </label>
        <div className="sq-field">
          <span id="sq-cover">Five starters in</span>
          <SegmentedControl
            label="Five starters in this share of games"
            value={String(Math.round(target * 100))}
            options={TARGETS.map((t) => ({ value: String(Math.round(t * 100)), label: `${Math.round(t * 100)}%` }))}
            onChange={(v) => { setTarget(TARGETS.find((t) => Math.round(t * 100) === Number(v)) ?? 0.9); setPage(0); }}
          />
        </div>
        <button type="button" role="switch" aria-checked={mine} className="sq-switch" onClick={() => setMine(!mine)}>
          <span aria-hidden="true" /> Count my cards
        </button>
      </form>

      {data.team === "any" ? null : <Picker data={data} order={order} club={club.club} settings={settings} page={page} setPage={setPage} />}

      <Hero data={data} club={club} verdict={verdict} team={shown} seven={seven} showArena={showArena} settings={settings} swapped={swapped}
        onBudget={(n) => { setBudget(n); setDraft(String(n)); }} />

      {data.season === "start" && club.newcomers.length ? <Newcomers club={club} league={data.name} /> : null}

      <Team club={club} cards={cards} seven={showArena ? seven : null}
        classic={(showArena ? (mine ? seven?.classicToBuy : seven?.classic) : mine ? shown?.classicToBuy : shown?.classic) ?? null}
        swap={showArena || !shown ? null : {
          at: swapAt, open: setSwapAt, swapped: Object.values(swaps), mine, scoring, team: shown,
          apply: (out, into) => { const base = Object.entries(swaps).find(([, v]) => v === out)?.[0] ?? out; setSwaps({ ...swaps, [base]: into }); setSwapAt(null); },
          undo: swapped ? () => { setSwaps({}); setSwapAt(null); } : null,
        }} />

      <WhoPlayed club={club} cards={cards} />

      <Replay key={swapped ? JSON.stringify(swaps) : "published"} data={data} club={club} team={shown} seven={seven} initial={showArena ? "arena" : "pro"} mine={mine} />
    </div>
  );
}

function Picker({ data, order, club, settings, page, setPage }: {
  data: SquadsPage; order: ReturnType<typeof ranked>; club: string; settings: Settings; page: number; setPage: (n: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(order.length / PAGE));
  const shown = order.slice(page * PAGE, page * PAGE + PAGE);
  const R = 24, C = 2 * Math.PI * R;
  return (
    <section className="sq-card sq-picker" aria-labelledby="sq-picker-h">
      <div className="sq-picker-head">
        <h2 id="sq-picker-h">Clubs for €{settings.budget}</h2>
        {pages > 1 ? (
          <nav className="sq-pager" aria-label="Clubs pages">
            <span aria-live="polite">{page + 1} of {pages}</span>
            <button type="button" aria-label="Previous clubs" disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
            <button type="button" aria-label="More clubs" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>›</button>
          </nav>
        ) : null}
      </div>
      <ul className="sq-tiles">
        {shown.map(({ tile, choice: c }) => {
          const share = c.mode === "pro" || c.mode === "short" ? c.entry.over / (tile.games || 1) : 0;
          const tone = c.mode === "none" ? "off" : share >= 0.5 ? "good" : share >= 0.3 ? "mid" : "low";
          const games = data.season === "start" || tile.pair ? "rounds" : "games";
          const label = c.mode === "none"
            ? `${tile.club}, ${tile.promoted ? "new to the league, " : ""}no team inside €${settings.budget}${c.cheapest ? `, from ${eur(c.cheapest)}` : ""}`
            : c.mode === "short"
              ? `${tile.club}, ${eur(c.price)}: five starters in ${Math.round(c.entry.cov * 100)}% of last season's rounds`
              : `${tile.club}, ${eur(c.price)} in ${c.mode === "pro" ? "Pro" : "the Arena"}${c.mode === "pro" ? `, best five over the first step in ${c.entry.over} of ${tile.games} ${games}` : ""}`;
          return (
            <li key={tile.club}>
              <Link href={href(data.code, tile.club, settings, data.season, data.team, tile.pair?.id)} prefetch={false} className="sq-tile" data-tone={tone}
                aria-current={tile.club === club ? "true" : undefined} aria-label={label}>
                <span className="sq-ring">
                  <svg viewBox="0 0 56 56" aria-hidden="true">
                    <circle cx="28" cy="28" r={R} className="track" />
                    <circle cx="28" cy="28" r={R} className="arc" strokeDasharray={`${(C * share).toFixed(1)} ${C.toFixed(1)}`} />
                  </svg>
                  {tile.pair ? <PairCrests tile={tile} size={24} /> : <SorareImage src={tile.crest} width={30} height={30} />}
                </span>
                <span className="sq-tile-text">
                  {tile.pair ? (
                    <span className="sq-tile-name sq-two"><span>{tile.pair.clubs[0]}</span><span>{tile.pair.clubs[1]}</span></span>
                  ) : <span className="sq-tile-name">{tile.club}</span>}
                  <span className="sq-tile-price">
                    <b>{c.mode === "none" ? (c.cheapest ? `€${Math.ceil(c.cheapest)}` : "—") : eur(c.price)}</b>
                    <span className="sq-pill" data-mode={c.mode === "none" && tile.promoted ? "new" : c.mode}>
                      {c.mode === "pro" ? "PRO" : c.mode === "arena" ? "ARENA" : c.mode === "short" ? `${Math.round(c.entry.cov * 100)}%` : tile.promoted ? "NEW" : "OVER"}
                    </span>
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Hero({ data, club, verdict, team, seven, showArena, settings, onBudget, swapped }: {
  data: SquadsPage; club: SquadClub; verdict: ReturnType<typeof choice>; team: SquadTeam | null; seven: SquadSeven | null;
  showArena: boolean; settings: Settings; onBudget: (n: number) => void; swapped: boolean;
}) {
  const n = club.games.length;
  const unit = showArena ? seven : team;
  const price = swapped && team ? (settings.mine ? team.toBuy : team.full) : verdict.mode === "none" ? 0 : verdict.price;
  const shown = useCents(price);
  const members = showArena && seven ? [seven.gk, ...seven.outs, seven.gsub, seven.osub].filter((s): s is string => !!s) : team?.cards ?? [];
  const owned = members.filter((s) => club.players[s]?.owned).length;
  const fives = team ? team.best.filter((v) => v !== null).length : 0;
  const first = data.board?.[0]?.target;
  const start = data.season === "start";
  const two = data.team === "two";
  const any = data.team === "any";
  const games = any ? "matchdays" : start || two ? "rounds" : "games";
  const pairTile = two ? data.tiles.find((t) => t.club === club.club) : undefined;
  const proof = start ? team?.proof ?? null : null;
  return (
    <section className="sq-card sq-hero" aria-labelledby="sq-club">
      <div className="sq-hero-main">
        <div className="sq-club">
          {pairTile ? <PairCrests tile={pairTile} size={40} /> : <SorareImage src={any ? data.logo : club.crest} width={52} height={52} />}
          <div>
            <h1 id="sq-club">{any ? `Any clubs, ${data.name}` : club.club}</h1>
            <p>{any ? `${start ? `picked from ${data.record}, ` : ""}${n} matchdays, any five of each in one lineup`
              : start && two ? `${data.name} · picked from last season, ${new Set(club.rounds).size} rounds, a try for each club`
              : start ? `${data.name} · picked from ${data.record}, ${n} rounds`
              : two ? `${data.name} · ${new Set(club.rounds).size} rounds, a try for each club's game`
              : `${data.name} · ${n} games this season`}</p>
          </div>
          <span className="sq-pill" data-mode={showArena ? "arena" : "pro"}>
            {data.logo ? <SorareImage src={data.logo} width={16} height={16} alt={data.name} /> : showArena ? null : `${data.name.toUpperCase()} `}
            {showArena ? "ARENA" : "PRO"}
          </span>
        </div>
        {verdict.mode === "none" ? (
          <div className="sq-none">
            <p className="sq-price">No team inside €{settings.budget}</p>
            {verdict.cheapest ? (
              <button type="button" className="sq-cta" onClick={() => onBudget(Math.ceil(verdict.cheapest!))}>
                Set €{Math.ceil(verdict.cheapest)}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="sq-price-row">
            <span className="sq-price">€{shown.toFixed(2)}</span>
            <span className="sq-price-side">
              <b>{members.length} cards</b>
              <span>{settings.mine ? "to complete · " : ""}{eur(unit?.full ?? 0)} for all{owned ? <> · <em>you own {owned}</em></> : null}</span>
              {start && !data.cardsOut ? <span className="sq-note">This season&apos;s cards are not out yet: last season&apos;s prices</span> : null}
            </span>
          </div>
        )}
        {two && data.alone?.length ? <Alone tiles={data.alone} settings={settings} /> : null}
        {team ? (
          <dl className="sq-stats">
            <div><dt>{games} with five starters</dt><dd>{two ? `${Math.round(team.cov * new Set(club.rounds).size)} of ${new Set(club.rounds).size}` : `${fives} of ${n}`}</dd></div>
            <div><dt>a {any ? "matchday" : start || two ? "round" : "game"}, {any ? "median" : "best"} five</dt><dd>{Math.round(team.mean)}</dd></div>
            {first && !proof ? <div><dt>over {first}</dt><dd className="good">{team.over} of {two ? new Set(club.rounds).size : n}</dd></div> : null}
            {proof && proof.games ? (
              <div className="sq-proof"><dt>bought like this, this season</dt><dd>{Math.round(proof.mean ?? 0)} a game · {proof.five} of {proof.games} with five</dd></div>
            ) : null}
          </dl>
        ) : null}
        {club.clubs ? club.clubs.map((c) => <FixtureRun key={c.club} run={c.run} who={c.club} />) : <FixtureRun run={club.run} />}
      </div>
      <Curve club={club} settings={settings} team={team} onBudget={onBudget} />
    </section>
  );
}

function Curve({ club, settings, team, onBudget }: { club: SquadClub; settings: Settings; team: SquadTeam | null; onBudget: (n: number) => void }) {
  const lane = club.pro[laneKey(settings.target)]?.[settings.mine ? "owned" : "full"] ?? [];
  const points = lane.flatMap((e) => {
    const t = club.teams.find((x) => x.id === e.id);
    return t ? [{ x: settings.mine ? t.toBuy : t.full, y: t.mean, id: t.id, from: e.from }] : []; // a team is picked from its entry's budget, which can top its own price
  });
  if (points.length < 2) return null;
  const W = 400, H = 170, L = 34, B = 150;
  // the axis spans the teams; the budget's dashed line stays on it, at the left edge below the cheapest team and at the right
  // edge above the dearest (a €40 budget no longer squeezes €3-5 teams into a corner)
  const x0 = Math.floor(points[0]!.x) - 1, x1 = Math.ceil(points[points.length - 1]!.x) + 1;
  const budgetX = Math.min(Math.max(settings.budget, x0), x1);
  const ys = points.map((p) => p.y);
  const y0 = Math.floor((Math.min(...ys) - 12) / 10) * 10, y1 = Math.ceil((Math.max(...ys) + 12) / 10) * 10;
  const X = (v: number) => L + ((v - x0) / (x1 - x0)) * (W - L - 8), Y = (v: number) => 8 + (1 - (v - y0) / (y1 - y0)) * (B - 8);
  let path = "";
  points.forEach((p, i) => {
    const next = i + 1 < points.length ? points[i + 1]!.x : x1;
    path += `${i ? " L" : "M"}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)} L${X(next).toFixed(1)} ${Y(p.y).toFixed(1)}`;
  });
  const ticks: number[] = [];
  const stepX = x1 - x0 > 60 ? 20 : x1 - x0 > 25 ? 10 : x1 - x0 > 12 ? 5 : 2;
  for (let v = Math.ceil(x0 / stepX) * stepX; v <= x1; v += stepX) if (X(v) > L + 12 && X(v) < W - 18) ticks.push(v); // labels never clipped
  const grid = [y0 + 10, Math.round((y0 + y1) / 20) * 10, y1 - 10];
  const here = points.find((p) => p.id === team?.id);
  return (
    <figure className="sq-curve">
      <figcaption>What more money buys <span>points a game</span></figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`Best score a game for each budget: ${points.map((p) => `${eur(p.x)} gives ${Math.round(p.y)}`).join(", ")}`}>
        {grid.map((g) => <g key={g}><line x1={L} x2={W - 4} y1={Y(g)} y2={Y(g)} className="grid" /><text x={0} y={Y(g) + 4}>{g}</text></g>)}
        {ticks.map((t) => <text key={t} x={X(t)} y={H - 3} textAnchor="middle">€{t}</text>)}
        <line x1={X(budgetX)} x2={X(budgetX)} y1={8} y2={B} className="budget" />
        <path d={`${path} L${X(x1).toFixed(1)} ${B} L${X(points[0]!.x).toFixed(1)} ${B} Z`} className="area" />
        <path d={path} className="line" />
        {points.map((p) => (
          // each team on the curve opens at its price: the budget moves there and the team below shows its players
          <g key={p.id} className={p.id === here?.id ? "pt on" : "pt"} role="button" tabIndex={0} aria-label={`${eur(p.x)}, ${Math.round(p.y)} a game: show this team`}
            aria-pressed={p.id === here?.id} onClick={() => onBudget(Math.ceil(p.from))}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onBudget(Math.ceil(p.from)); } }}>
            <circle cx={X(p.x)} cy={Y(p.y)} r={12} className="hit" />
            <circle cx={X(p.x)} cy={Y(p.y)} r={p.id === here?.id ? 6 : 4} className="dot" />
          </g>
        ))}
      </svg>
    </figure>
  );
}

/** What a card costs now: the cheapest listing, else Sorare's market value marked "est."; the team's one classic card at the
 *  cheapest classic listing. */
function cardPrice(p: SquadPlayer, classic: boolean): { value: number; est: boolean; note: string } {
  if (classic && p.classic !== null) return { value: p.classic, est: false, note: "Cheapest classic card listed now" };
  return p.listed ? { value: p.eur, est: false, note: "Cheapest card listed now" } : { value: p.eur, est: true, note: "None listed: Sorare's market value" };
}

type Swap = {
  at: string | null; open: (slug: string | null) => void; apply: (out: string, into: string) => void; undo: (() => void) | null;
  swapped: string[]; mine: boolean; team: SquadTeam; scoring: { captain: number; season: number; firstStep: number | null; measure: "best" | "median" };
};

function Team({ club, cards, seven, classic, swap }: { club: SquadClub; cards: string[]; seven: SquadSeven | null; classic: string | null; swap: Swap | null }) {
  const n = club.games.length;
  const role = (s: string) => (seven ? (s === seven.gsub ? "GK sub" : s === seven.osub ? "Sub" : null) : null);
  const shelves = POSITIONS.map(([pos, label]) => ({ label, players: cards.filter((s) => club.players[s]?.pos === pos) })).filter((s) => s.players.length);
  return (
    <section className="sq-card sq-team" aria-labelledby="sq-team-h">
      <div className="sq-team-head">
        <h2 id="sq-team-h">{seven ? "The seven" : "The team"}</h2>
        {swap?.undo ? <button type="button" className="sq-undo" onClick={swap.undo}>Back to the best team</button> : null}
      </div>
      <div className="sq-shelves" style={{ gridTemplateColumns: shelves.map((s) => `${s.players.length}fr`).join(" ") } as CSSProperties}>
        {shelves.map((shelf) => (
          <div key={shelf.label} className="sq-shelf">
            <h3>{shelf.label} · {shelf.players.length}</h3>
            <ul>
              {shelf.players.map((slug) => {
                const p = club.players[slug]!;
                const starts = [...p.played].filter((x) => x === "S").length;
                const avg = starts ? p.scores.filter((_, i) => p.played[i] === "S").reduce((a, b) => a + b, 0) / starts : 0;
                const r = role(slug);
                const isClassic = slug === classic;
                const price = cardPrice(p, isClassic);
                const yours = isClassic ? p.ownedClassic : p.owned;
                return (
                  <li key={slug} data-sub={r ? "" : undefined} data-swapped={swap?.swapped.includes(slug) ? "" : undefined}>
                    <span className="sq-art">
                      {swap ? (
                        <button type="button" className="sq-swap-open" aria-expanded={swap.at === slug}
                          aria-label={`Swap ${p.name}`} onClick={() => swap.open(swap.at === slug ? null : slug)} />
                      ) : null}
                      <CardArt src={p.art} name={p.name} />
                      {club.clubs || p.crest ? <span className="sq-badge"><SorareImage src={p.crest ?? crestOf(club, p)} width={20} height={20} /></span> : null}
                      {yours ? <span className="sq-own">Yours</span> : null}
                      {isClassic ? <span className="sq-classic" title="An older season's card: Sorare lets a lineup take one">Classic</span> : null}
                    </span>
                    <b className="sq-name" title={p.from ? `${p.name}, from ${p.from}` : p.name}>{shortName(p.name)}</b>
                    {p.from ? <span className="sq-from">{p.crest ? p.from : `from ${p.from}`}</span> : null}
                    <span className="sq-meta"><s data-owned={yours ? "" : undefined} title={price.note}>{eur(price.value)}{price.est ? <small> est.</small> : null}</s><span>{r ? `${r} · ` : ""}{starts}/{n} · {Math.round(avg)}</span></span>
                    <span className="sq-rate" style={{ "--w": `${Math.round((starts / (n || 1)) * 100)}%` } as CSSProperties} data-tone={starts / n >= 0.75 ? "good" : starts / n >= 0.45 ? "mid" : "low"} aria-hidden="true"><i /></span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {swap?.at ? <SwapList club={club} swap={swap} out={swap.at} /> : null}
    </section>
  );
}

/** The players who could take a card's place at his position, best first, with what each does to the team. */
function SwapList({ club, swap, out }: { club: SquadClub; swap: Swap; out: string }) {
  const p = club.players[out]!;
  const now = swap.team;
  const options = Object.entries(club.players)
    .filter(([s, q]) => q.pos === p.pos && !now.cards.includes(s))
    .map(([s, q]) => ({ s, q, t: customTeam(club, now.cards.map((c) => (c === out ? s : c)), swap.scoring) }))
    .sort((a, b) => b.t.mean - a.t.mean)
    .slice(0, 4);
  const price = (t: { toBuy: number; full: number }) => (swap.mine ? t.toBuy : t.full);
  const n = club.games.length;
  return (
    <div className="sq-swaps" role="region" aria-label={`Instead of ${p.name}`}>
      <h3>Instead of {shortName(p.name)}</h3>
      {options.length ? (
        <ul>
          {options.map(({ s, q, t }) => {
            const dMean = t.mean - now.mean, dPrice = price(t) - price(now);
            const cost = Math.abs(dPrice) < 0.005 ? "same price" : `${dPrice > 0 ? "+" : "−"}${eur(Math.abs(dPrice))}`;
            const starts = [...q.played].filter((x) => x === "S").length;
            return (
              <li key={s}>
                <button type="button" onClick={() => swap.apply(out, s)} aria-label={`Swap in ${q.name}: ${dMean >= 0 ? "+" : "−"}${Math.abs(dMean).toFixed(1)} a game, ${cost}`}>
                  <span className="sq-art"><CardArt src={q.art} name={q.name} /></span>
                  <b className="sq-name">{shortName(q.name)}</b>
                  <span className="sq-delta" data-tone={dMean >= 0 ? "good" : "bad"}>{dMean >= 0 ? "+" : "−"}{Math.abs(dMean).toFixed(1)} a game</span>
                  <span className="sq-delta">{cost} · {starts}/{n}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : <p>No other {p.pos === "GK" ? "keeper" : "player"} at his position played for the club.</p>}
    </div>
  );
}

/** Start of season: the players with no game in the league last season, so the team could not count them. */
function Newcomers({ club, league }: { club: SquadClub; league: string }) {
  return (
    <section className="sq-card sq-new" aria-labelledby="sq-new-h">
      <h2 id="sq-new-h">New to {league} <span>no games last season: not counted</span></h2>
      <ul>
        {club.newcomers.map((p) => (
          <li key={p.slug}>
            <span className="sq-art"><CardArt src={p.art} name={p.name} /></span>
            <b className="sq-name" title={p.name}>{shortName(p.name)}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Two clubs: what each club buys alone for the same budget and target, beside the pair. */
function Alone({ tiles, settings }: { tiles: Tile[]; settings: Settings }) {
  return (
    <ul className="sq-alone" aria-label="Each club alone">
      {tiles.map((t) => {
        const c = choice(t, settings);
        return (
          <li key={t.club}>
            <SorareImage src={t.crest} width={20} height={20} />
            <span>{t.club} alone</span>
            <b>{c.mode === "none" ? `no team inside €${settings.budget}` : `${eur(c.price)} · ${Math.round(c.entry.mean)} a game`}</b>
          </li>
        );
      })}
    </ul>
  );
}

/** The club's next league games in the fixture grid's colours (1 easiest), so a team is bought before an easy run. */
function FixtureRun({ run, who }: { run: Fixture[]; who?: string }) {
  if (!run.length) return null;
  return (
    <div className="sq-run">
      <span className="sq-run-h">{who ? `${shortName(who)}, next` : "Next games"}</span>
      <ol>
        {run.map((g) => (
          <li key={g.date} className={g.bucket ? `f${g.bucket}` : "sq-run-off"}
            aria-label={`${g.home ? "Home to" : "Away at"} ${g.opponent}, ${day(g.date)}${g.label ? `: ${g.label}` : ""}`}>
            {g.crest?.startsWith("https://assets.sorare.com/") ? <SorareImage src={g.crest} width={18} height={18} /> : null}
            <b>{oppCode(g.opponent)}</b><small>{g.home ? "H" : "A"}</small>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A pair's two crests, the second over the first's corner. */
function PairCrests({ tile, size }: { tile: Tile; size: number }) {
  return (
    <span className="sq-pair" style={{ "--s": `${size}px` } as CSSProperties}>
      <SorareImage src={tile.pair!.crests[0]} width={size} height={size} />
      <SorareImage src={tile.pair!.crests[1]} width={size} height={size} />
    </span>
  );
}

/** A pair's player's club crest: the club of the first of his own games (not the clubs' game against each other). */
function crestOf(club: SquadClub, p: SquadPlayer): string | null {
  const i = [...p.played].findIndex((c, j) => c !== "x" && club.games[j]?.club !== "both");
  const name = i >= 0 ? club.games[i]?.club : undefined;
  return club.clubs?.find((c) => c.club === name)?.crest ?? null;
}

function WhoPlayed({ club, cards }: { club: SquadClub; cards: string[] }) {
  const n = club.games.length;
  const players = cards.map((s) => [s, club.players[s]!] as const);
  const five = club.games.map((_, i) => {
    const on = players.filter(([, p]) => p.played[i] === "S").map(([, p]) => p.pos);
    return on.includes("GK") && on.includes("DEF") && on.includes("MID") && on.includes("FWD") && on.filter((x) => x !== "GK").length >= 4;
  });
  return (
    <section className="sq-card sq-strip" aria-labelledby="sq-strip-h" style={{ "--n": n } as CSSProperties}>
      <div className="sq-strip-head">
        <h2 id="sq-strip-h">Who played</h2>
        <ul className="sq-key" aria-hidden="true">
          <li><span className="bands">{[10, 30, 45, 55, 70, 80].map((v) => <i key={v} style={{ background: scoreColour(v).fill }} />)}</span>started, his score</li>
          <li><i className="on" />came on, minutes</li>
          <li><i className="dnp" />did not play</li>
        </ul>
      </div>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a region that scrolls must be reachable by keyboard */}
      <div className="sq-scroll" role="region" aria-label="Who played, by game" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col"><span className="sq-sr">Player</span></th>
              {club.games.map((g) => (
                <th scope="col" key={g.id} aria-label={g.opponent ? `${g.home ? "home to" : "away at"} ${g.opponent}, ${day(g.date)}` : `round ${g.id.slice(1)}, ${day(g.date)}`}>
                  {g.opponent ? <SorareImage src={g.crest} width={22} height={22} /> : null}
                  <b>{g.opponent ? oppCode(g.opponent) : g.id}</b>
                  {g.club ? <i className="sq-try">{g.club === "both" ? "Both" : shortName(g.club)}</i> : null}
                  <span>{g.opponent ? `${g.home ? "H" : "A"} · ` : ""}{day(g.date)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="sq-five">
              <th scope="row">Five starters</th>
              {five.map((ok, i) => <td key={i}><i role="img" data-ok={ok ? "" : undefined} aria-label={ok ? "five starters" : "no five"} /></td>)}
            </tr>
            {POSITIONS.map(([pos, label]) => {
              const rows = players.filter(([, p]) => p.pos === pos);
              if (!rows.length) return null;
              return [
                <tr key={pos} className="sq-sec"><th scope="rowgroup" colSpan={n + 1}>{label}</th></tr>,
                ...rows.map(([slug, p]) => (
                  <tr key={slug}>
                    <th scope="row">{shortName(p.name)}</th>
                    {club.games.map((g, i) => {
                      const s = p.played[i];
                      const c = scoreColour(p.scores[i] ?? 0);
                      if (s === "S") return <td key={g.id}><span className="cell" role="img" style={{ background: c.fill, color: c.ink }} aria-label={`started, ${Math.round(p.scores[i]!)}`}>{Math.round(p.scores[i]!)}</span></td>;
                      if (s === "x") return <td key={g.id}><span className="cell off" role="img" aria-label={`${g.club}'s game`} /></td>;
                      if (s === "B") return <td key={g.id}><span className="cell on" role="img" style={{ borderColor: c.fill }} aria-label={`came on for ${p.mins[i]} minutes, ${Math.round(p.scores[i]!)}`}>{p.mins[i]}′</span></td>;
                      return <td key={g.id}><span className="cell dnp" role="img" aria-label="did not play" /></td>;
                    })}
                  </tr>
                )),
              ];
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type Mode = "pro" | "arena";
type Pick = "hind" | "xs";
type Score = "best" | "median" | "average" | "real" | "exp";

function Replay({ data, club, team, seven, initial, mine }: {
  data: SquadsPage; club: SquadClub; team: SquadTeam | null; seven: SquadSeven | null; initial: Mode; mine: boolean;
}) {
  const [mode, setMode] = useState<Mode>(initial);
  const [pick, setPick] = useState<Pick>("hind");
  const [score, setScore] = useState<Score>(data.team === "any" ? "median" : "best"); // Any clubs is ranked on its median five
  const unit = mode === "arena" ? seven : team;
  const hasXs = !!unit && unit.xsReal.some((v) => v !== null);
  // a team with no xS numbers (last season's rounds) is replayed in hindsight, whatever was picked before
  const xs = pick === "xs" && hasXs;
  const shown = xs ? score : score === "real" || score === "exp" ? "best" : score;
  const key = xs ? (shown === "exp" ? "xsExp" : "xsReal") : (shown as "best" | "median" | "average");
  const values = unit ? (unit[key] as (number | null)[]) : [];
  const top = Math.max(480, ...values.filter((v): v is number => v !== null));
  const LO = 150;
  const h = (v: number) => `${Math.max(4, Math.round(((Math.min(v, top) - LO) / (top - LO)) * CHART))}px`;
  const lines = arenaLines(data.arenaLines);
  // two clubs: a column a round, a bar for each club's try in it (the Arena's seven plays once a round)
  const groups: number[][] = club.rounds
    ? [...new Set(club.rounds)].map((r) => club.rounds!.flatMap((x, i) => (x === r ? [i] : [])))
    : club.games.map((_, i) => [i]);
  const heads = groups.map((g) => club.games[g[0]!]!);
  const n = groups.length;
  const dense = n > 20;
  let big = "", label = "", won: string | null = null;
  let cols: { bars: { h: string; tone: string; label: string }[]; tick: number | null; mark: string; markTone: string; aria: string }[] = [];
  if (mode === "pro" && unit && data.board) {
    const lad = ladder(groups.map((g) => g.map((i) => values[i] ?? null)), data.board);
    big = String(lad.clears); label = lad.clears === 1 ? "Pro step cleared" : "Pro steps cleared"; won = prize(lad.cash, lad.essence);
    cols = lad.rungs.map((rung, r) => {
      const vs = groups[r]!.map((i) => values[i] ?? null);
      const cleared = [...rung].reverse().find((x) => x.res === "clear");
      const last = rung[rung.length - 1]!;
      const missed = rung.some((x) => x.res === "miss");
      const tries = rung.map((x, j) => {
        const v = vs[j] ?? null, who = rung.length > 1 ? `${club.games[groups[r]![j]!]!.club}: ` : "";
        return `${who}${v === null ? "no five" : `${Math.round(v)} against ${x.target}${x.res === "clear" ? `, cleared, ${shortPrize(x.prize!)}` : ", missed"}`}`;
      });
      return {
        bars: rung.map((x, j) => {
          const v = vs[j] ?? null;
          return { h: v === null ? "4px" : h(v), tone: v === null ? "none" : x.res === "clear" ? "clear" : "miss", label: v === null || dense ? "" : String(Math.round(v)) };
        }),
        tick: rung[0]!.target,
        mark: cleared ? (dense ? "✓" : shortPrize(cleared.prize!)) : missed ? (last.back ? "↺" : "✕") : "",
        markTone: cleared ? "good" : "bad",
        aria: `${heads[r]!.opponent || `Round ${r + 1}`}: ${tries.join("; ")}`,
      };
    });
  } else if (unit) {
    let paid = 0, cash = 0, essence = 0;
    // the Arena's series is a round's already; a pair's Pro scores without a board: its round's best try
    const perCol = mode === "arena" ? values : groups.map((g) => g.reduce<number | null>((m, i) => (values[i] == null ? m : m === null ? values[i]! : Math.max(m, values[i]!)), null));
    cols = perCol.map((v, i) => {
      const t = mode === "arena" ? tier(v, lines) : -1;
      if (t >= 0) { paid += 1; cash += lines[t]!.cash; essence += lines[t]!.essence; }
      const sub = mode === "arena" && seven?.subIn[i];
      return {
        bars: [{ h: v === null ? "4px" : h(v), tone: v === null ? "none" : t >= 0 ? `tier${t}` : "miss", label: v === null || dense ? "" : String(Math.round(v)) }],
        tick: null, mark: sub ? "SUB" : "", markTone: "sub",
        aria: `${heads[i]?.opponent || `Round ${i + 1}`}: ${v === null ? "no number" : Math.round(v)}${t >= 0 ? `, paid ${shortPrize(lines[t]!)}` : ""}${sub ? ", a sub came in" : ""}`,
      };
    });
    const known = values.filter((v) => v !== null).length;
    big = mode === "arena" ? `${paid}/${known}` : String(Math.round(unit.mean)); label = mode === "arena" ? "paid in the Arena" : "a game";
    won = mode === "arena" ? prize(cash, essence) : null;
  }
  return (
    <section className="sq-card sq-replay" aria-label="Pro or Arena, played all season">
      <div className="sq-replay-bar">
        <div className="sq-modes" role="group" aria-label="Mode">
          {([["pro", "PRO", team], ["arena", "ARENA", seven]] as const).map(([m, tag, u]) => (
            <button key={m} type="button" aria-pressed={mode === m} disabled={!u} onClick={() => setMode(m)}>
              <span className="sq-pill" data-mode={m}>{tag}</span>
              {u ? <b>{eur(mine ? u.toBuy : u.full)}</b> : <b>—</b>}
            </button>
          ))}
        </div>
        {hasXs ? (
          <SegmentedControl label="Lineup" value={pick} onChange={(v) => { setPick(v); setScore(v === "xs" ? "real" : "best"); }}
            options={[{ value: "hind", label: "Hindsight" }, { value: "xs", label: "Sofix xS, before kickoff" }]} />
        ) : null}
        <SegmentedControl label="Score" value={shown} onChange={setScore}
          options={xs ? [{ value: "real", label: "What it scored" }, { value: "exp", label: "What xS said" }]
            : [{ value: "best", label: "Best" }, { value: "median", label: "Median" }, { value: "average", label: "Average" }]} />
      </div>
      <div className="sq-replay-body">
        <div className="sq-sum">
          <b>{big}</b>
          <span>{label}</span>
          {won ? <em>{won}</em> : null}
          {mode === "pro" && data.board ? (
            <ol className="sq-board" aria-label="The Pro board">
              {data.board.map((s) => <li key={s.target} data-on={unit && (team?.ladder?.top ?? 0) >= s.target ? "" : undefined}><b>{s.target}</b><span>{shortPrize(s)}</span></li>).reverse()}
            </ol>
          ) : null}
          {mode === "arena" && seven ? (
            <ul className="sq-mini">
              {[seven.gk, ...seven.outs, seven.gsub, seven.osub].filter((s): s is string => !!s).map((s) => (
                <li key={s} data-sub={s === seven.gsub || s === seven.osub ? "" : undefined}><CardArt src={club.players[s]?.art} name={club.players[s]?.name ?? s} /></li>
              ))}
            </ul>
          ) : null}
        </div>
        <div className="sq-chart" style={{ "--n": n } as CSSProperties} data-dense={dense ? "" : undefined}>
          <div className="sq-plot">
            {mode === "arena" ? lines.map((l, i) => (
              <div key={l.score} className="sq-line" data-tier={i} style={{ bottom: h(l.score) }}><span>{Math.round(l.score)} · {shortPrize(l)}</span></div>
            )) : null}
            {cols.map((c, i) => (
              <div key={i} className="sq-col" role="img" aria-label={c.aria} title={c.aria}>
                {c.tick !== null ? <span className="sq-tick" style={{ bottom: h(c.tick) }} /> : null}
                {c.bars.map((b, j) => (
                  <span key={j} className="sq-bar-wrap">
                    {b.label ? <span className="sq-bar-v" data-tone={b.tone}>{b.label}</span> : null}
                    <span className="sq-bar" data-tone={b.tone} style={{ height: b.h }} />
                  </span>
                ))}
              </div>
            ))}
          </div>
          <div className="sq-axis">
            {heads.map((g, i) => (
              <span key={g.id}>
                {g.opponent ? <SorareImage src={g.crest} width={dense ? 14 : 20} height={dense ? 14 : 20} /> : null}
                <b data-tone={cols[i]?.markTone}><span className="long">{cols[i]?.mark}</span><span className="short">{short(cols[i]?.mark ?? "")}</span></b>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/** A chart mark as one sign on a phone: the prize becomes a tick, SUB an S. */
const short = (mark: string) => (!mark ? "" : mark === "SUB" ? "S" : mark === "↺" || mark === "✕" ? mark : "✓");

/** The Arena's prize lines worth drawing: the first three essence rungs and the first cash one. */
function arenaLines(lines: SquadsPage["arenaLines"]) {
  const essence = lines.filter((l) => !l.cash).slice(0, 3);
  const cash = lines.find((l) => l.cash);
  return [...essence, ...(cash ? [cash] : [])].sort((a, b) => a.score - b.score);
}
