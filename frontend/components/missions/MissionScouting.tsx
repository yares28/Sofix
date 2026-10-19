"use client";
import { useState } from "react";
import Link from "next/link";
import MissionFormEvidence from "./MissionFormEvidence";
import Dots from "./Dots";
import type { LogCand } from "../../lib/missionLog";
import CardArt from "../cards/CardArt";
import { fit, missionCandidates, missionChance, type MissionPlan } from "../../lib/missions";
import type { MissionPool, MissionPlayer } from "../../lib/missionsPool";
import { SOURCE_SHORT } from "../../lib/play";
import SorareImage from "../play/SorareImage";
import { lastGames, perGame, recentMean, relatedStats, roleHits } from "../../lib/missionColumns";

const percent = missionChance;
const share = (n: number | undefined) => (n === undefined ? "–" : `${Math.round(n * 100)}%`);
const kickoff = (s: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" }).format(new Date(s));
const SHOW = [["", "All"], ["editable", "Before kickoff"], ["selected", "Yours"], ["shortlist", "Shortlist"]] as const;
type Sort = "chance" | "start" | "recent" | "kickoff";

export default function MissionScouting({ one, plans, players, pool, now, rarity, shortlist, toggle, captured }: { one: MissionPlan | undefined; plans: MissionPlan[]; players: MissionPlayer[]; pool: MissionPool | null; now: string; rarity: string; captured: LogCand[]; shortlist: string[]; toggle: (s: string) => void }) {
  const [query, setQuery] = useState(""); const [position, setPosition] = useState("");
  const [availability, setAvailability] = useState(""); const [sort, setSort] = useState<Sort>("chance");
  const [compared, setCompared] = useState<string[]>([]); const [open, setOpen] = useState<string[]>([]);
  if (!one) return <section className="mx-card" aria-labelledby="ms-scout-title">
    <h2 id="ms-scout-title" className="mx-h2">Your cards</h2>
    <p className="pd-none">Load today’s missions to compare your cards against the actual targets.</p>
  </section>;
  const candidates = missionCandidates(one.mission, rarity, players, new Date(now), plans.flatMap((x) => x.mission.appearances ?? []));
  const unique = new Map<string, typeof candidates[number]>();
  for (const c of candidates) {
    const id = c.p.card ?? c.p.player!;
    if (!unique.has(id) || (!unique.get(id)!.editable && c.editable)) unique.set(id, c);
  }
  const related = relatedStats(one.rule);
  const rows = [...unique.entries()].map(([id, { p, game: currentGame, own, locked, allowed, status, editable }]) => {
    const saved = locked ? captured.find((c) => c.s === p.player && c.g === currentGame.id && (!p.card || c.card === p.card) && !c.late) : undefined;
    const game = locked ? { ...currentGame, pStart: undefined, pOn: undefined, ffSaid: undefined, startSource: undefined, ffMatch: undefined, availabilityKnown: false, ...saved?.match } : currentGame;
    const sheet = locked ? saved?.sheet : pool?.sheets.players[p.player ?? ""];
    const target = locked ? saved?.targets?.[one.mission.id] ?? saved?.evidence?.[one.mission.id]?.target : one.mission.inventory?.find((c) => c.card === p.card && c.game.id === game.id)?.target;
    const found = locked ? saved?.evidence?.[one.mission.id] ?? (saved?.c[one.mission.id] !== undefined ? { chance: saved.c[one.mission.id]!, historical: saved.historyOnly?.includes(one.mission.id) } : null) : fit(one.rule, { ...p, availabilityKnown: game.availabilityKnown ?? p.availabilityKnown, pStart: game.pStart ?? p.pStart, pOn: game.pOn ?? p.pOn }, sheet ?? null, target);
    const games = lastGames(sheet?.form, one.rule, target);
    return { id, p, game, target, sheet, found: allowed === false ? null : found, own, locked, status, allowed, editable, games, rate: games.length ? games.filter((g) => g.hit).length / games.length : -1 };
  });
  const filtered = rows.filter(({ p, own, editable }) => p.name.toLowerCase().includes(query.toLowerCase()) && (!position || p.pos === position) && (!availability || (availability === "editable" ? editable : availability === "selected" ? own : shortlist.includes(p.card ?? p.player ?? ""))));
  // FF's own number is shown; the chance is worked out from it corrected by the record (start_fixes.py).
  const startOf = (r: typeof rows[number]) => r.game.availabilityKnown === false ? undefined : r.game.ffSaid ?? r.game.pStart ?? r.p.pStart;
  filtered.sort((a, b) => sort === "kickoff" ? a.game.kickoff.localeCompare(b.game.kickoff) : sort === "recent" ? b.rate - a.rate || recentMean(b.sheet?.form, one.rule) - recentMean(a.sheet?.form, one.rule) : sort === "start" ? (startOf(b) ?? -1) - (startOf(a) ?? -1) : (b.found?.chance ?? -1) - (a.found?.chance ?? -1));
  const copies = (r: typeof rows[number]) => {
    const available = rows.filter((x) => x.p.player === r.p.player && x.editable);
    const confirmed = available.filter((x) => x.allowed === true).length;
    const unchecked = available.filter((x) => x.allowed === null).length;
    return `${confirmed} copies confirmed eligible${unchecked ? ` · ${unchecked} not checked on Sorare` : ""}`;
  };
  const flip = (list: string[], set: (l: string[]) => void, id: string) => set(list.includes(id) ? list.filter((s) => s !== id) : [...list, id]);
  const partial = !pool?.complete || one.mission.eligibilityComplete === false;
  return <section className="mx-card mx-scout" id="mission-scouting" aria-labelledby="ms-scout-title">
    <div className="mx-bar">
      <h2 id="ms-scout-title" className="mx-h2">Your cards</h2>
      <span className="mx-chip">{rows.length} playing</span>
      {partial ? <span className="mx-chip amber" title="Coverage is incomplete. Load missions to check the latest eligible cards.">Partly checked</span> : null}
      <span className="mx-grow" />
      <div className="mx-seg sm" role="group" aria-label="Show">{SHOW.map(([v, label]) => <button key={v} type="button" aria-pressed={availability === v} onClick={() => setAvailability(v)}>{label}</button>)}</div>
      <div className="mx-seg sm" role="group" aria-label="Position">{["", "GK", "DEF", "MID", "FWD"].map((p) => <button key={p} type="button" aria-pressed={position === p} onClick={() => setPosition(p)}>{p || "All"}</button>)}</div>
      <label className="mx-search"><span className="visually-hidden">Search players</span><svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        <input type="search" name="scout-player" placeholder="Search" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
    </div>
    {compared.length ? <div className="mx-compare" aria-label="Player comparison">{rows.filter((r) => compared.includes(r.id)).map((r) => <div key={r.id}><b><Link href={`/players/${r.p.player}`}>{r.p.name}</Link></b>
      <span>{percent(r.found?.chance)} {r.found?.historical ? "recent hits" : "estimated"}{r.game.availabilityKnown !== false ? ` · ${percent(startOf(r))} to start` : ""}</span><Dots games={r.games} small /></div>)}</div> : null}
    <div className="mx-scroll"><div className="mx-table">
      <div className="mx-line mx-th" role="group" aria-label="Sort by">
        <span>Card</span>
        <button type="button" aria-pressed={sort === "kickoff"} onClick={() => setSort("kickoff")}>Game</button>
        <button type="button" aria-pressed={sort === "start"} title="Chance he starts, and comes on" onClick={() => setSort("start")}>Start</button>
        <button type="button" aria-pressed={sort === "recent"} title="His last ten games, oldest first: big dot started, small dot came on, green he did it" onClick={() => setSort("recent")}>Last 10</button>
        <span className="c" title="Games he started">Started</span><span className="c" title="Games he came on">Bench</span>
        {related.map(([key, label]) => <span className="r" key={key} title={`${label} per game, last 10`}>{label}</span>)}
        <button type="button" className="r" aria-pressed={sort === "chance"} title="Sofix's estimate" onClick={() => setSort("chance")}>Chance</button>
        <span />
      </div>
      <ul className="mx-rows">{filtered.map((r, i) => {
        const form = r.sheet?.form, on = shortlist.includes(r.id), isOpen = open.includes(r.id), start = startOf(r), chance = r.found?.chance;
        const suggested = plans.some((p) => p.picks.some((s) => s.card ? s.card === r.p.card : s.slug === r.p.player));
        return <li key={r.id} className={isOpen ? "open" : undefined}>
          <div className="mx-line">
            <div className="who"><Link className="mx-art" href={`/players/${r.p.player}`} aria-label={`Open ${r.p.name} profile`}><CardArt src={r.p.pic} name={r.p.name} /></Link>
              <div><b>{r.p.name}{r.own ? <span className="mx-mark you" role="img" aria-label="Your pick" title="Your pick"><svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="5" /><path d="M3 22a9 9 0 0 1 18 0Z" /></svg></span> : null}{suggested ? <span className="mx-mark sfx" role="img" aria-label="Sofix's pick" title="Sofix's pick" /> : null}{r.locked ? <span className="mx-tag">Locked</span> : null}{r.allowed === false ? <span className="mx-tag">Not eligible</span> : null}</b></div></div>
            <div className="game" role="img" aria-label={`${r.game.venue === "A" ? "at" : "v"} ${r.game.opponent}, ${kickoff(r.game.kickoff)}`} title={`${r.game.venue === "A" ? "at" : "v"} ${r.game.opponent} · ${kickoff(r.game.kickoff)}`}>{r.game.opponentCrest ? <SorareImage src={r.game.opponentCrest} width={24} height={24} /> : <span className="mx-shield">{r.game.opponent.slice(0, 3).toUpperCase()}</span>}</div>
            <div className="start"><b>{share(start)}</b>{start !== undefined ? <><i className="mx-meter"><i style={{ width: `${Math.round(100 * start)}%` }} /></i><span className="sub">on {share(r.game.pOn ?? r.p.pOn)}</span></> : <span className="sub">not known</span>}</div>
            <div className="l10"><Dots games={r.games} /><span><b>{r.games.length ? `${r.games.filter((g) => g.hit).length}/${r.games.length}` : "–"}</b></span></div>
            <div className="c a1" data-l="Started"><span className="visually-hidden">Started </span>{roleHits(r.games, true)}</div>
            <div className="c a2" data-l="Bench"><span className="visually-hidden">Came on </span>{roleHits(r.games, false)}</div>
            {related.map((rel, n) => <div className={`r a${n + 3}`} data-l={rel[1]} key={rel[0]}><span className="visually-hidden">{rel[1]} </span>{perGame(form, rel)}</div>)}
            <div className="ch" title={r.found?.historical ? "Recent target hit rate" : "Estimated mission chance"}><b>{chance === undefined ? "–" : percent(chance)}</b>{chance === undefined ? null : <i className="mx-meter"><i style={{ width: `${Math.round(100 * chance)}%` }} /></i>}</div>
            <div className="acts">
              <button type="button" className="mx-ico" disabled={!r.editable} aria-pressed={on} aria-label={`${on ? "Remove from shortlist" : "Shortlist"}: ${r.p.name}`} title={on ? "Remove from shortlist" : "Shortlist"} onClick={() => toggle(r.id)}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12v18l-6-4.5L6 21V3Z" /></svg></button>
              <label className="mx-ico" title="Compare, up to three"><input type="checkbox" checked={compared.includes(r.id)} disabled={!compared.includes(r.id) && compared.length >= 3} onChange={() => flip(compared, setCompared, r.id)} /><span className="visually-hidden">Compare {r.p.name}</span><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" /></svg></label>
              <button type="button" className="mx-ico" aria-expanded={isOpen} aria-controls={`mx-more-${i}`} aria-label={`All stats: ${r.p.name}`} title="All recorded stats" onClick={() => flip(open, setOpen, r.id)}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg></button>
            </div>
          </div>
          {isOpen ? <div className="mx-more" id={`mx-more-${i}`}>
            <p className="sub">{r.game.team ?? "Playing side not supplied"} {r.game.venue === "H" ? "v" : "at"} {r.game.opponent} · {r.game.competition} · {r.status} · {copies(r)}
              {r.game.availabilityKnown !== false ? <> · {r.game.ffMatch && r.game.startSource === "futbolfantasy" ? <a href={r.game.ffMatch.url} target="_blank" rel="noreferrer">Start: {percent(startOf(r))} · FF</a> : `Start: ${percent(startOf(r))} · ${SOURCE_SHORT[r.game.startSource ?? r.p.startSource ?? "sofix"]}`}</> : null}
              {r.game.ffStatus?.kind ? ` · ${r.game.ffStatus.kind}${r.game.ffStatus.note ? ` · ${r.game.ffStatus.note}` : ""}` : null}</p>
            <MissionFormEvidence form={form} rule={one.rule} target={r.target} all />
          </div> : null}
        </li>;
      })}</ul>
      {!filtered.length ? <p className="pd-none">No cards found with these filters. Choose All cards or reload missions.</p> : null}
    </div></div>
    <details className="mx-fine"><summary>About these estimates</summary><p>{pool?.statsWindow ?? "Scored starts"}. Last 10 uses appearances before the mission day, including substitutes. Started and Bench count how often he hit the target in each role. Estimates weight recent starter and substitute rates by playing chance, falling back to that season’s role average. Count targets use a Poisson rate; score targets and unknown playing chances show recent target hits. These are heuristics, not calibrated probabilities. Your picks and shortlist never change Sofix’s benchmark, and suggestions never enter picks for you.</p></details>
  </section>;
}
