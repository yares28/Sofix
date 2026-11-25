"use client";

import { useMemo, useState } from "react";
import SeasonIcon from "../SeasonIcon";
import { scoreColour } from "../../lib/cards";
import {
  chanceAt, clearChance, holdMatchday, moves, PAGE_SIZE, reachChances, stepsPlayed,
  type ProBlock, type ProSpare, type ProBoard, type ProCard, type ProPlanned, type ProStarter, type Result,
} from "../../lib/proWeek";

const MADRID = "Europe/Madrid";
const dayOf = (iso: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: MADRID }).format(new Date(iso));
const timeOf = (iso: string) => new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: MADRID }).format(new Date(iso));
const pct = (p: number) => `${Math.round(p * 100)}%`;
const money = (s: { cash: number; essence: number }) => (s.cash ? `$${s.cash.toLocaleString("en-GB")}` : `${s.essence.toLocaleString("en-GB")} ess`);
const FDR = ["", "var(--fdr1-strong)", "var(--fdr2-strong)", "var(--fdr3-strong)", "var(--fdr4-strong)", "var(--fdr5-strong)"];
const startTone = (p: number) => (p >= 0.8 ? "hi" : p >= 0.5 ? "mid" : "lo");
const chanceTone = (p: number) => (p >= 0.4 ? "hi" : p >= 0.2 ? "mid" : "lo");
const shortName = (name: string) => name.replace(/ Pro$/, "");

type Mode = "byBatch" | "bestFive";
type View = "pro" | "left" | "rest";
const VIEWS: [View, string][] = [["pro", "Pro"], ["left", "Arena leftovers"], ["rest", "Not placed"]];

/** The Pro page: one board at a time, its staircase, hold or play for the matchday, and its lineups day by day. */
export default function ProView({ data }: { data: ProBlock | null }) {
  const week = data?.weeks[0] ?? null;
  const [boardKey, setBoardKey] = useState(week?.boards.find((b) => b.byBatch.length)?.key ?? week?.boards[0]?.key ?? "");
  const [mode, setMode] = useState<Mode>("byBatch");
  const [results, setResults] = useState<Record<string, Result[]>>({});
  const [out, setOut] = useState<Record<string, boolean>>({});
  const board = week?.boards.find((b) => b.key === boardKey) ?? null;
  const next = data?.weeks[1]?.boards.find((b) => b.key === boardKey) ?? null;
  const lineups = useMemo(() => (board ? [...board[mode]].sort((a, b) => a.start.localeCompare(b.start)) : []), [board, mode]);
  const resultKey = `${boardKey}|${mode}`;
  const res = results[resultKey] ?? [];
  const days = useMemo(() => {
    if (!board) return [];
    const all = [...board.batches.map((b) => b.from), ...lineups.map((l) => l.start)].sort();
    return [...new Set(all.map(dayOf))];
  }, [board, lineups]);
  const [day, setDay] = useState<string | null>(null);
  const [view, setView] = useState<View>("pro");
  const shownDay = day && days.includes(day) ? day : (lineups[0] ? dayOf(lineups[0].start) : days[0]) ?? null;

  if (!week || !board) {
    return (
      <main className="pro" aria-labelledby="pro-title">
        <h1 id="pro-title" className="pro-empty">No Pro boards read yet</h1>
      </main>
    );
  }

  const setResult = (i: number, r: Result) => {
    const nextRes = [...res];
    nextRes[i] = nextRes[i] === r ? "open" : r;
    setResults({ ...results, [resultKey]: nextRes });
  };
  const played = stepsPlayed(lineups, res);
  const plays = moves(lineups, res);
  const nowChance = clearChance(lineups, res);
  const nextChance = next ? clearChance([...next[mode]], []) : null;
  const hold = holdMatchday(nowChance, nextChance);
  const reach = reachChances(lineups, res, board.steps.length);
  const cleared = res.filter((r) => r === "cleared").length;
  const nPlay = plays.filter((m) => m.tag === "play").length;
  const nHold = plays.filter((m) => m.tag === "hold").length;
  const verdict = hold ? "Hold for next matchday" : nPlay === 0 ? (lineups.length ? "Done" : "Hold") : nHold ? `Play ${nPlay}, hold ${nHold}` : nPlay === 1 ? "Play it" : `Play all ${nPlay}`;
  const step0 = board.steps[0]!;
  const lineupDays = lineups.map((l) => dayOf(l.start));
  const starts = new Set(lineups.map((l) => l.start));
  const dead = mode === "byBatch" ? board.batches.filter((b) => !starts.has(b.from) && dayOf(b.from) === shownDay) : [];
  const rows: { at: string; i: number; cards: ProCard[] }[] = [
    ...lineups.map((l, i) => ({ at: l.start, i, cards: [] })).filter(({ i }) => lineupDays[i] === shownDay),
    ...dead.map((b) => ({ at: b.from, i: -1, cards: b.cards })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <main className="pro" aria-labelledby="pro-title">
      <h1 id="pro-title" className="visually-hidden">Pro</h1>
      <div className="pro-ctl">
        {view === "pro" ? (
          <div className="pro-seg" role="tablist" aria-label="Board">
            {week.boards.map((b) => (
              <button key={b.key} type="button" role="tab" aria-selected={b.key === boardKey} className={b.key === boardKey ? "on" : undefined} onClick={() => { setBoardKey(b.key); setDay(null); }}>
                {shortName(b.name)}<i>S{b.steps[0]?.level ?? 0}</i>
              </button>
            ))}
          </div>
        ) : <SpareHead list={view === "left" ? week.leftovers : week.notPlaced} />}
        <div className="pro-seg" role="tablist" aria-label="View">
          {VIEWS.map(([v, label]) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} className={view === v ? "on" : undefined} onClick={() => setView(v)}>{label}</button>
          ))}
        </div>
      </div>

      {view !== "pro" ? <SpareGrid key={view} list={view === "left" ? week.leftovers : week.notPlaced} /> : <>
      {lineups.length ? (
        <section className="pro-hp" aria-label="Hold or play">
          <div className="pro-hp-vd"><small>Step {step0.level} · {step0.target} · {money(step0)}</small><b>{verdict}</b></div>
          <div className="pro-hp-main">
            <ol className="pro-hp-seq">
              {lineups.map((l, i) => (
                <li key={l.start + i} className={`is-${plays[i]!.tag}`}>
                  <button type="button" onClick={() => setDay(lineupDays[i]!)}>
                    <span className="pro-hp-t">{lineupDays[i]} {timeOf(l.start)}{crestsOf(l).map((c) => (
                      // eslint-disable-next-line @next/next/no-img-element -- the club's crest, hot-linked
                      <img key={c} src={c} alt="" width={18} height={18} />
                    ))}</span>
                    <span className="pro-hp-c"><b>{pct(plays[i]!.chance)}</b><em>{plays[i]!.tag}</em></span>
                  </button>
                </li>
              ))}
              {nextChance !== null ? (
                <li className={hold ? "is-next is-pick" : "is-next"}><span className="pro-hp-t">Next matchday</span><span className="pro-hp-c"><b>{pct(nextChance)}</b></span></li>
              ) : null}
            </ol>
            <div className="pro-cum" role="img" aria-label={`${pct(nowChance)} to clear ${step0.target} this matchday`}>
              {cumulative(lineups, res, plays.map((m) => m.tag)).map((w, i) => <i key={i} style={{ width: `${w * 100}%` }} />)}
            </div>
            <p className="pro-cum-l"><span>Clears {step0.target} this matchday</span><b>{pct(nowChance)}</b></p>
          </div>
        </section>
      ) : null}

      <section className="pro-stairs" aria-label="Steps">
        {board.steps.map((s, k) => {
          const won = k < cleared;
          const now = k === cleared;
          const r = reach[k] ?? 0;
          return (
            <div key={s.level} className="pro-st">
              <span className={`pro-st-r${!won && r < 0.05 ? " is-mut" : ""}`}>{won ? "✓" : pct(r)}</span>
              <div className={`pro-blk${won ? " is-won" : now ? " is-now" : ""}`} style={{ height: 84 + k * 22 }}><b>{s.target}</b><span>{money(s)}</span></div>
            </div>
          );
        })}
      </section>

      <div className="pro-ctl">
        <div className="pro-days" role="tablist" aria-label="Day">
          {days.map((d) => {
            const dots = [
              ...lineups.filter((_, i) => lineupDays[i] === d).map(() => true),
              ...(mode === "byBatch" ? board.batches.filter((b) => !starts.has(b.from) && dayOf(b.from) === d).map(() => false) : []),
            ];
            return (
              <button key={d} type="button" role="tab" aria-selected={d === shownDay} className={d === shownDay ? "on" : undefined} onClick={() => setDay(d)}>
                <b>{d}</b><span aria-hidden="true">{dots.map((ok, i) => <i key={i} className={ok ? undefined : "no"} />)}</span>
              </button>
            );
          })}
        </div>
        <div className="pro-seg" role="tablist" aria-label="Lineups">
          {([["byBatch", "By batch"], ["bestFive", "Best five"]] as const).map(([m, label]) => (
            <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? "on" : undefined} onClick={() => setMode(m)}>{label}</button>
          ))}
        </div>
      </div>

      {!lineups.length ? <p className="pro-none">No legal lineup this week</p> : null}
      {rows.map((row) => row.i >= 0 ? (
        <LineupRow
          key={`l${row.i}`}
          board={board}
          lineup={lineups[row.i]!}
          step={played[row.i]!}
          result={res[row.i] ?? "open"}
          teamsOut={!!out[`${resultKey}|${row.i}`]}
          onResult={(r) => setResult(row.i, r)}
          onTeams={() => setOut({ ...out, [`${resultKey}|${row.i}`]: !out[`${resultKey}|${row.i}`] })}
        />
      ) : <DeadRow key={`b${row.at}`} at={row.at} cards={row.cards} minInSeason={board.minInSeason} />)}
      </>}
    </main>
  );
}

function SpareHead({ list }: { list: ProSpare[] }) {
  const cards = list.reduce((n, r) => n + r.free, 0);
  return <p className="pro-spare-h"><b>{list.length}</b><span>players · {cards} cards</span></p>;
}

/** The cards the Sorare page's plan leaves free: twelve a page, best expected score first. */
function SpareGrid({ list }: { list: ProSpare[] }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const shown = list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  if (!list.length) return <p className="pro-none">Every card is in a lineup</p>;
  return (
    <section className="pro-spare" aria-label="Cards">
      <ul className="pro-spare-grid">
        {shown.map((r) => {
          const xs = scoreColour(r.x);
          return (
            <li key={r.player} className="pro-spare-c">
              <div className="pro-art">
                <CardArt card={{ name: r.name, pic: r.pic }} />
                <span className={`pro-sp is-${startTone(r.start)}`}>{pct(r.start)}</span>
                {r.free > 1 ? <span className="pro-cap" aria-label={`${r.free} cards`}>×{r.free}</span> : null}
                <span className="s5-season pro-season" title={r.inSeason ? "In season" : "Classic"}><SeasonIcon inSeason={r.inSeason} /></span>
              </div>
              <span className="pro-nm">{r.name}</span>
              <span className="pro-xr"><span className="pro-hex" style={{ background: xs.fill, color: xs.ink }} title="Sofix xS">{Math.round(r.x)}</span><Crest src={r.crest} bucket={null} /></span>
            </li>
          );
        })}
      </ul>
      {pages > 1 ? (
        <nav className="pro-pages" aria-label="Pages">
          {Array.from({ length: pages }, (_, i) => (
            <button key={i} type="button" aria-current={i === page ? "page" : undefined} className={i === page ? "on" : undefined} onClick={() => setPage(i)}>{i + 1}</button>
          ))}
        </nav>
      ) : null}
    </section>
  );
}

function crestsOf(l: ProPlanned): string[] {
  const seen = new Set<string>();
  for (const s of l.starters) if (!s.late && s.crest) seen.add(s.crest);
  return [...seen].slice(0, 2);
}

/** Each lineup's share of the step cleared, in order: the bar fills to the matchday's chance. */
function cumulative(lineups: ProPlanned[], res: Result[], tags: string[]): number[] {
  let miss = 1;
  return lineups.map((l, i) => {
    const r = res[i] ?? "open";
    const p = r === "cleared" ? 1 : r === "missed" || tags[i] === "hold" ? 0 : chanceAt(l, 0);
    const add = miss * p;
    miss *= 1 - p;
    return add;
  });
}

function LineupRow({ board, lineup, step, result, teamsOut, onResult, onTeams }: {
  board: ProBoard; lineup: ProPlanned; step: number; result: Result; teamsOut: boolean;
  onResult: (r: Result) => void; onTeams: () => void;
}) {
  const target = board.steps[step];
  const ch = chanceAt(lineup, step);
  const seasons = lineup.starters.filter((s) => s.inSeason).length;
  const matches = new Map<string, ProStarter>();
  for (const s of lineup.starters) if (s.fixture) matches.set(`${s.club}|${s.fixture.opponent}`, s);
  const sheet = new Date(new Date(lineup.start).getTime() - 3_600_000).toISOString();
  return (
    <article className="pro-row" aria-label={`${dayOf(lineup.start)} ${timeOf(lineup.start)}`}>
      <div className="pro-meta">
        <span className="pro-time">{timeOf(lineup.start)}</span>
        {[...matches.values()].slice(0, 4).map((s) => (
          <span key={`${s.club}${s.fixture!.opponent}`} className="pro-match">
            <Crest src={s.crest} bucket={s.fixture!.bucket} /><span className="vs">v</span><Crest src={s.fixture!.opponentCrest} bucket={null} />
          </span>
        ))}
        <button type="button" className={`pro-sheet${teamsOut ? " is-out" : ""}`} aria-pressed={teamsOut} onClick={onTeams}>
          {teamsOut ? "Teams out" : `Teams ~${timeOf(sheet)}`}
        </button>
        <div className="pro-res">
          <button type="button" className={`c${result === "cleared" ? " on" : ""}`} aria-pressed={result === "cleared"} onClick={() => onResult("cleared")}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>Cleared
          </button>
          <button type="button" className={`m${result === "missed" ? " on" : ""}`} aria-pressed={result === "missed"} onClick={() => onResult("missed")}>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>Missed
          </button>
        </div>
      </div>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- keyboard access to the five when they scroll on a phone */}
      <div className="pro-five" role="region" aria-label="The five" tabIndex={0}>
        {lineup.starters.map((s) => <Player key={s.slug} s={s} teamsOut={teamsOut} />)}
      </div>
      {target ? (
        <div className="pro-goal">
          <div className="pro-goal-t">
            <svg width="26" height="22" viewBox="0 0 26 22" aria-hidden="true"><path d="M1 21h6v-6h6V9h6V3h6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" /></svg>
            <b>{target.target}</b><span>{money(target)}</span>
          </div>
          <div className="pro-gauge" role="img" aria-label={`Expected ${lineup.x} against ${target.target}`}>
            <span className="tk" /><span className={`fl is-${chanceTone(ch)}`} style={{ width: `${Math.min(100, (lineup.x / (target.target * 1.1)) * 100)}%` }} />
            <span className="ln" style={{ left: `${100 / 1.1}%` }} />
            <span className={`ev is-${chanceTone(ch)}`} style={{ left: `${Math.min(100, (lineup.x / (target.target * 1.1)) * 100)}%` }}>{lineup.x}</span>
            <span className={`gap is-${chanceTone(ch)}`}>{lineup.x >= target.target ? "+" : "−"}{Math.abs(lineup.x - target.target)}</span>
          </div>
          <span className={`pro-pct is-${chanceTone(ch)}`}>{pct(ch)}</span>
          <div className="pro-nx">
            {[1, 2].filter((k) => board.steps[step + k]).map((k) => (
              <div key={k}><span>{board.steps[step + k]!.target}</span><i><u style={{ width: `${Math.max(2, chanceAt(lineup, step + k) * 100)}%` }} /></i><span>{pct(chanceAt(lineup, step + k))}</span></div>
            ))}
          </div>
          <span className="pro-ins" role="img" aria-label={`${seasons} of 5 in-season, ${board.minInSeason} needed`}>
            {lineup.starters.map((s) => <i key={s.slug} className={s.inSeason ? undefined : "cl"} />)}
          </span>
        </div>
      ) : null}
    </article>
  );
}

function Crest({ src, bucket }: { src: string | null; bucket: number | null }) {
  return (
    <span className="pro-crest">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- the club's crest, hot-linked
        <img src={src} alt="" width={26} height={26} loading="lazy" />
      ) : <span className="pro-crest-none" />}
      <i style={{ background: bucket ? FDR[bucket] : "transparent" }} />
    </span>
  );
}

function Player({ s, teamsOut }: { s: ProStarter; teamsOut: boolean }) {
  const known = teamsOut && !s.late;
  const xs = scoreColour(s.x);
  return (
    <div className="pro-pc">
      <div className="pro-art">
        <CardArt card={s} />
        <span className={`pro-sp is-${known ? "hi" : startTone(s.start)}`}>{known ? "XI" : pct(s.start)}</span>
        {s.captain ? <span className="pro-cap" aria-label="Captain">C</span> : null}
        <span className="s5-season pro-season" title={s.inSeason ? "In season" : "Classic"}><SeasonIcon inSeason={s.inSeason} /></span>
      </div>
      <span className="pro-nm">{s.name}</span>
      <span className="pro-late">{s.late ? <>
        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        {dayOf(s.late)} {timeOf(s.late)}
      </> : null}</span>
      <div className="pro-xr">
        <span className="pro-hex" style={{ background: xs.fill, color: xs.ink }} title="Sofix xS">{Math.round(s.x)}</span>
        {s.fixture ? (
          <span className="pro-opp"><span>{s.fixture.venue}</span><Crest src={s.fixture.opponentCrest} bucket={s.fixture.bucket} /></span>
        ) : null}
      </div>
      <div className="pro-l5" role="img" aria-label={`Last five: ${s.l5.map(([sc, mi]) => (mi ? sc : "did not play")).join(", ")}`}>
        {Array.from({ length: 5 }, (_, k) => s.l5[k - (5 - s.l5.length)]).map((g, k) => {
          if (!g || g[1] === 0) return <span key={k} className="is-dnp"><b>–</b><i /></span>;
          const c = scoreColour(g[0]);
          return <span key={k} className={g[1] < 60 ? "is-sub" : undefined}><b>{g[0]}</b><i style={{ height: Math.max(4, Math.round((g[0] / 100) * 40)), background: c.fill }} /></span>;
        })}
      </div>
      <div className="pro-bench">
        {s.late ? null : s.subs.length ? s.subs.map((sub) => (
          <span key={sub.slug} className="pro-sb" title={`${sub.name} if he is benched`}>
            <CardArt card={sub} small /><em className={`is-${startTone(sub.start)}`}>{pct(sub.start)}</em>
          </span>
        )) : <span className="pro-nob" role="img" aria-label="No legal sub">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M4 12l8-8" stroke="currentColor" strokeWidth="1.8" /></svg>
        </span>}
      </div>
    </div>
  );
}

function CardArt({ card, small = false }: { card: Pick<ProCard, "name" | "pic">; small?: boolean }) {
  return card.pic
    // eslint-disable-next-line @next/next/no-img-element -- Sorare's card art, hot-linked
    ? <img className={small ? "pro-img-s" : "pro-img"} src={card.pic} alt={card.name} loading="lazy" />
    : <span className={small ? "pro-img-s is-none" : "pro-img is-none"}>{card.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}</span>;
}

function DeadRow({ at, cards, minInSeason }: { at: string; cards: ProCard[]; minInSeason: number }) {
  const best = (pos: string, skip: Set<string>) => cards.filter((c) => c.pos === pos && !skip.has(c.slug)).sort((a, b) => b.start - a.start)[0] ?? null;
  const used = new Set<string>();
  const slots = (["GK", "DEF", "MID", "FWD"] as const).map((pos) => {
    const c = best(pos, used);
    if (c) used.add(c.slug);
    return { pos, c };
  });
  const extra = cards.filter((c) => c.pos !== "GK" && !used.has(c.slug)).sort((a, b) => b.start - a.start)[0] ?? null;
  const all = [...slots, { pos: "+1", c: extra }];
  const seasons = new Set(cards.filter((c) => c.inSeason).map((c) => c.player)).size;
  const crests = [...new Set(cards.map((c) => c.crest).filter((c): c is string => !!c))].slice(0, 2);
  return (
    <article className="pro-dead" aria-label={`${dayOf(at)} ${timeOf(at)}, no legal lineup`}>
      <span className="pro-time">{timeOf(at)}</span>
      <span className="pro-dead-cr">{crests.map((c) => (
        // eslint-disable-next-line @next/next/no-img-element -- the club's crest, hot-linked
        <img key={c} src={c} alt="" width={22} height={22} />
      ))}</span>
      <div className="pro-slots">
        {all.map(({ pos, c }) => c ? (
          <span key={pos} className={`pro-sl${!c.inSeason && seasons < minInSeason ? " is-dim" : ""}`}>
            <CardArt card={c} small /><em className={`is-${startTone(c.start)}`}>{pct(c.start)}</em>
          </span>
        ) : <span key={pos} className="pro-sl is-miss"><b>{pos}</b></span>)}
        <span className="pro-need" role="img" aria-label={`${seasons} in-season of ${minInSeason} needed`}>
          <span className="pro-ins">{Array.from({ length: minInSeason }, (_, k) => <i key={k} className={k < seasons ? undefined : "no"} />)}</span>
          <b>{seasons} / {minInSeason}</b>
        </span>
      </div>
    </article>
  );
}
