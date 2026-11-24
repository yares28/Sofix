"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { scoreColour } from "../../lib/cards";
import {
  choice, day, eur, laneKey, ladder, LEAGUES, oppCode, prize, ranked, shortName, shortPrize, TARGETS, tier, within,
  type Settings, type SquadClub, type SquadPlayer, type SquadsPage, type SquadSeven, type SquadTeam, type Target,
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

function href(code: string, club: string, s: Settings) {
  const q = new URLSearchParams({ league: code, club, budget: String(s.budget), cover: String(Math.round(s.target * 100)) });
  if (!s.mine) q.set("mine", "0");
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
    window.history.replaceState(null, "", href(data.code, club.club, settings)); // shareable, no new render on the server
  }, [data.code, club.club, settings]);

  const order = useMemo(() => ranked(data.tiles, settings), [data.tiles, settings]);
  const mineTile = data.tiles.find((t) => t.club === club.club)!;
  const verdict = choice(mineTile, settings);
  const lane = mine ? "owned" : "full";
  const proLane = club.pro[laneKey(target)]?.[lane] ?? [];
  const proEntry = within(proLane, budget) ?? proLane[0] ?? null;
  const team = proEntry ? club.teams.find((t) => t.id === proEntry.id) ?? null : null;
  const arenaEntry = within(club.arena[lane], budget) ?? club.arena[lane]?.[0] ?? null;
  const seven = arenaEntry ? club.sevens.find((s) => s.id === arenaEntry.id) ?? null : null;
  const showArena = verdict.mode === "arena" && seven !== null;
  const cards = showArena && seven ? [seven.gk, ...seven.outs, ...[seven.gsub, seven.osub].filter((s): s is string => !!s)] : team?.cards ?? [];
  const setBudgetFrom = (raw: string) => {
    setDraft(raw);
    const n = Math.round(Number(raw));
    if (Number.isFinite(n) && n >= 1 && n <= 5000) { setBudget(n); setPage(0); }
  };

  return (
    <div className="sq-page">
      <form className="sq-filters" aria-label="Filters" onSubmit={(e) => e.preventDefault()}>
        <label className="sq-field">
          <span>League</span>
          <select name="league" value={data.code} onChange={(e) => router.push(`/squads?league=${e.target.value}&budget=${budget}&cover=${Math.round(target * 100)}${mine ? "" : "&mine=0"}`)}>
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

      <Picker data={data} order={order} club={club.club} settings={settings} page={page} setPage={setPage} />

      <Hero data={data} club={club} verdict={verdict} team={team} seven={seven} showArena={showArena} settings={settings}
        onBudget={(n) => { setBudget(n); setDraft(String(n)); }} />

      <Team club={club} cards={cards} seven={showArena ? seven : null}
        classic={(showArena ? (mine ? seven?.classicToBuy : seven?.classic) : mine ? team?.classicToBuy : team?.classic) ?? null} />

      <WhoPlayed club={club} cards={cards} />

      <Replay data={data} club={club} team={team} seven={seven} initial={showArena ? "arena" : "pro"} mine={mine} />
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
          const share = c.mode === "pro" ? c.entry.over / (tile.games || 1) : 0;
          const tone = c.mode === "none" ? "off" : share >= 0.5 ? "good" : share >= 0.3 ? "mid" : "low";
          const label = c.mode === "none"
            ? `${tile.club}, no team inside €${settings.budget}${c.cheapest ? `, from ${eur(c.cheapest)}` : ""}`
            : `${tile.club}, ${eur(c.price)} in ${c.mode === "pro" ? "Pro" : "the Arena"}${c.mode === "pro" ? `, best five over the first step in ${c.entry.over} of ${tile.games}` : ""}`;
          return (
            <li key={tile.club}>
              <Link href={href(data.code, tile.club, settings)} prefetch={false} className="sq-tile" data-tone={tone}
                aria-current={tile.club === club ? "true" : undefined} aria-label={label}>
                <span className="sq-ring">
                  <svg viewBox="0 0 56 56" aria-hidden="true">
                    <circle cx="28" cy="28" r={R} className="track" />
                    <circle cx="28" cy="28" r={R} className="arc" strokeDasharray={`${(C * share).toFixed(1)} ${C.toFixed(1)}`} />
                  </svg>
                  <SorareImage src={tile.crest} width={30} height={30} />
                </span>
                <span className="sq-tile-text">
                  <span className="sq-tile-name">{tile.club}</span>
                  <span className="sq-tile-price">
                    <b>{c.mode === "none" ? (c.cheapest ? `€${Math.ceil(c.cheapest)}` : "—") : eur(c.price)}</b>
                    <span className="sq-pill" data-mode={c.mode}>{c.mode === "pro" ? "PRO" : c.mode === "arena" ? "ARENA" : "OVER"}</span>
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

function Hero({ data, club, verdict, team, seven, showArena, settings, onBudget }: {
  data: SquadsPage; club: SquadClub; verdict: ReturnType<typeof choice>; team: SquadTeam | null; seven: SquadSeven | null;
  showArena: boolean; settings: Settings; onBudget: (n: number) => void;
}) {
  const n = club.games.length;
  const unit = showArena ? seven : team;
  const price = verdict.mode === "none" ? 0 : verdict.price;
  const shown = useCents(price);
  const members = showArena && seven ? [seven.gk, ...seven.outs, seven.gsub, seven.osub].filter((s): s is string => !!s) : team?.cards ?? [];
  const owned = members.filter((s) => club.players[s]?.owned).length;
  const fives = team ? team.best.filter((v) => v !== null).length : 0;
  const first = data.board?.[0]?.target;
  return (
    <section className="sq-card sq-hero" aria-labelledby="sq-club">
      <div className="sq-hero-main">
        <div className="sq-club">
          <SorareImage src={club.crest} width={52} height={52} />
          <div>
            <h1 id="sq-club">{club.club}</h1>
            <p>{data.name} · {n} games this season</p>
          </div>
          <span className="sq-pill" data-mode={showArena ? "arena" : "pro"}>{showArena ? "ARENA" : `${data.name.toUpperCase()} PRO`}</span>
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
            </span>
          </div>
        )}
        {team ? (
          <dl className="sq-stats">
            <div><dt>games with five starters</dt><dd>{fives} of {n}</dd></div>
            <div><dt>a game, best five</dt><dd>{Math.round(team.mean)}</dd></div>
            {first ? <div><dt>over {first}</dt><dd className="good">{team.over} of {n}</dd></div> : null}
          </dl>
        ) : null}
      </div>
      <Curve club={club} settings={settings} team={team} onBudget={onBudget} />
    </section>
  );
}

function Curve({ club, settings, team, onBudget }: { club: SquadClub; settings: Settings; team: SquadTeam | null; onBudget: (n: number) => void }) {
  const lane = club.pro[laneKey(settings.target)]?.[settings.mine ? "owned" : "full"] ?? [];
  const points = lane.flatMap((e) => {
    const t = club.teams.find((x) => x.id === e.id);
    return t ? [{ x: settings.mine ? t.toBuy : t.full, y: t.mean, id: t.id }] : [];
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
            aria-pressed={p.id === here?.id} onClick={() => onBudget(Math.ceil(p.x))}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onBudget(Math.ceil(p.x)); } }}>
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

function Team({ club, cards, seven, classic }: { club: SquadClub; cards: string[]; seven: SquadSeven | null; classic: string | null }) {
  const n = club.games.length;
  const role = (s: string) => (seven ? (s === seven.gsub ? "GK sub" : s === seven.osub ? "Sub" : null) : null);
  const shelves = POSITIONS.map(([pos, label]) => ({ label, players: cards.filter((s) => club.players[s]?.pos === pos) })).filter((s) => s.players.length);
  return (
    <section className="sq-card sq-team" aria-labelledby="sq-team-h">
      <h2 id="sq-team-h">{seven ? "The seven" : "The team"}</h2>
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
                  <li key={slug} data-sub={r ? "" : undefined}>
                    <span className="sq-art">
                      <CardArt src={p.art} name={p.name} />
                      {yours ? <span className="sq-own">Yours</span> : null}
                      {isClassic ? <span className="sq-classic" title="An older season's card: Sorare lets a lineup take one">Classic</span> : null}
                    </span>
                    <b className="sq-name" title={p.name}>{shortName(p.name)}</b>
                    <span className="sq-meta"><s data-owned={yours ? "" : undefined} title={price.note}>{eur(price.value)}{price.est ? <small> est.</small> : null}</s><span>{r ? `${r} · ` : ""}{starts}/{n} · {Math.round(avg)}</span></span>
                    <span className="sq-rate" style={{ "--w": `${Math.round((starts / (n || 1)) * 100)}%` } as CSSProperties} data-tone={starts / n >= 0.75 ? "good" : starts / n >= 0.45 ? "mid" : "low"} aria-hidden="true"><i /></span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
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
                <th scope="col" key={g.id} aria-label={`${g.home ? "home to" : "away at"} ${g.opponent}, ${day(g.date)}`}>
                  <SorareImage src={g.crest} width={22} height={22} />
                  <b>{oppCode(g.opponent)}</b>
                  <span>{g.home ? "H" : "A"} · {day(g.date)}</span>
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
  const [score, setScore] = useState<Score>("best");
  const unit = mode === "arena" ? seven : team;
  const hasXs = !!unit && unit.xsReal.some((v) => v !== null);
  const key = pick === "xs" ? (score === "exp" ? "xsExp" : "xsReal") : (score as "best" | "median" | "average");
  const values = unit ? (unit[key] as (number | null)[]) : [];
  const top = Math.max(480, ...values.filter((v): v is number => v !== null));
  const LO = 150;
  const h = (v: number) => `${Math.max(4, Math.round(((Math.min(v, top) - LO) / (top - LO)) * CHART))}px`;
  const lines = arenaLines(data.arenaLines);
  const n = club.games.length;
  const dense = n > 20;
  let big = "", label = "", won: string | null = null;
  let cols: { bars: { h: string; tone: string; label: string }[]; tick: number | null; mark: string; markTone: string; aria: string }[] = [];
  if (mode === "pro" && unit && data.board) {
    const lad = ladder(values.map((v) => [v]), data.board);
    big = String(lad.clears); label = lad.clears === 1 ? "Pro step cleared" : "Pro steps cleared"; won = prize(lad.cash, lad.essence);
    cols = lad.rungs.map((r, i) => {
      const step = r[0]!, v = values[i] ?? null;
      const col = {
        bars: [{ h: v === null ? "4px" : h(v), tone: v === null ? "none" : step.res === "clear" ? "clear" : "miss", label: v === null || dense ? "" : String(Math.round(v)) }],
        tick: step.target,
        mark: step.res === "clear" ? (dense ? "✓" : shortPrize(step.prize!)) : step.res === "miss" ? (step.back ? "↺" : "✕") : "",
        markTone: step.res === "clear" ? "good" : "bad",
        aria: `${club.games[i]!.opponent}: ${v === null ? "no five" : `${Math.round(v)} against ${step.target}${step.res === "clear" ? `, cleared, ${shortPrize(step.prize!)}` : ", missed"}`}`,
      };
      return col;
    });
  } else if (unit) {
    let paid = 0, cash = 0, essence = 0;
    cols = values.map((v, i) => {
      const t = mode === "arena" ? tier(v, lines) : -1;
      if (t >= 0) { paid += 1; cash += lines[t]!.cash; essence += lines[t]!.essence; }
      const sub = mode === "arena" && seven?.subIn[i];
      return {
        bars: [{ h: v === null ? "4px" : h(v), tone: v === null ? "none" : t >= 0 ? `tier${t}` : "miss", label: v === null || dense ? "" : String(Math.round(v)) }],
        tick: null, mark: sub ? "SUB" : "", markTone: "sub",
        aria: `${club.games[i]!.opponent}: ${v === null ? "no number" : Math.round(v)}${t >= 0 ? `, paid ${shortPrize(lines[t]!)}` : ""}${sub ? ", a sub came in" : ""}`,
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
        <SegmentedControl label="Score" value={score} onChange={setScore}
          options={pick === "xs" ? [{ value: "real", label: "What it scored" }, { value: "exp", label: "What xS said" }]
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
            {club.games.map((g, i) => (
              <span key={g.id}>
                <SorareImage src={g.crest} width={dense ? 14 : 20} height={dense ? 14 : 20} />
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
