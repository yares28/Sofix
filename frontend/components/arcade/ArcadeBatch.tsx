"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { z } from "zod";
import type { Arcade, ArcadeGame } from "../../lib/arcade";
import { batchesOf, teamsInBatch } from "../../lib/arcadeBatch";
import { batchChances, chanceOf, simulation, type Outlook } from "../../lib/arcadePlan";
import { climbStart, climbStep, Crest, crestsOf, LineupCards, madridDay, madridTime, pct, pts, stepInfos } from "./ArcadePlanner";
import { FdrContext } from "./Fdr";
import { fdrOf, type FdrSide } from "../../lib/arcadeFdr";
import { aimKey, useArcadeAim } from "../../lib/arcadeAim";

const Saved = z.object({ day: z.string(), selected: z.string(), counts: z.record(z.string(), z.number().int().min(1).max(4)), empty: z.boolean().default(false) });
const number = (value: number | null | undefined, percent = false) => value == null ? "—" : percent ? pct(value) : value.toFixed(2);

function Match({ game, crests }: { game: ArcadeGame; crests: Map<string, string> }) {
  const f = useContext(FdrContext).get(game.id);
  const side = (team: ArcadeGame["home"], evidence: FdrSide | undefined) => (
    <div className="arc-batch-side">
      <div><Crest team={team} crests={crests} /><b>{team?.name ?? "Unknown team"}</b></div>
      <dl>
        <div><dt>FDR</dt><dd className={evidence ? `f${evidence.bucket}` : undefined} title={fdrOf(evidence).title}>{fdrOf(evidence).value ?? "—"}</dd></div>
        <div><dt>CS</dt><dd>{number(evidence?.cleanSheet, true)}</dd></div>
        <div><dt>xG</dt><dd>{number(evidence?.xgFor)}</dd></div>
        <div><dt>xGA</dt><dd>{number(evidence?.xgAgainst)}</dd></div>
      </dl>
    </div>
  );
  return <article className="arc-batch-match" aria-label={`${game.home?.name ?? "Unknown"} v ${game.away?.name ?? "Unknown"}`}>
    <header><span>{game.competition.name}</span><time dateTime={game.kickoff}>{madridDay(game.kickoff)} · {madridTime(game.kickoff)}</time></header>
    <div>{side(game.home, f?.home)}{side(game.away, f?.away)}</div>
  </article>;
}

/** Every set game is visible; only the selected batch is simulated. No additional source reads. */
export default function ArcadeBatch({ arcade, outlooks }: { arcade: Arcade; outlooks: Map<string, Outlook[]> }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- Refresh the planning clock with board/forecast inputs, as in the climb.
  const now = useMemo(() => Date.now(), [arcade, outlooks]);
  const key = `sofix-arcade-batch:${arcade.set.slug}:${arcade.board?.id ?? ""}`;
  const current = climbStep(arcade);
  const [saved, setSaved] = useState<z.infer<typeof Saved>>(() => {
    try { const read = Saved.safeParse(JSON.parse(localStorage.getItem(key) ?? "null")); if (read.success) return read.data; } catch { /* Retain choices for this visit when storage is unavailable. */ }
    return { day: "", selected: "", counts: {}, empty: false };
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(saved)); } catch { /* Storage unavailable. */ } }, [key, saved]);
  const [page, setPage] = useState(0);
  const [gamePage, setGamePage] = useState(0);
  const batches = useMemo(() => batchesOf((arcade.games ?? []).filter(g => !arcade.set.end || Date.parse(g.kickoff) < Date.parse(arcade.set.end)), now), [arcade.games, arcade.set.end, now]);
  // A window with no card of yours is skipped unless asked for, and marked when shown (9 Nov 2026: Batch alone listed them).
  const mine = (b: { games: ArcadeGame[] }) => b.games.some(g => (outlooks.get(g.id) ?? []).length > 0);
  const dated = batches.filter(b => !saved.day || b.day === saved.day);
  const emptyCount = dated.filter(b => !mine(b)).length;
  const filtered = dated.filter(b => saved.empty || mine(b));
  const selected = filtered.find(b => b.id === saved.selected) ?? filtered[0];
  const steps = arcade.board?.steps ?? [];
  // The same aim as Pick teams (useArcadeAim).
  const [aim, setAim] = useArcadeAim(aimKey(arcade.set.slug, arcade.board?.id ?? ""));
  const step = steps.find(s => s.number === aim && !["CLAIMED", "CLAIMABLE"].includes(s.state)) ?? steps.find(s => s.number === current) ?? steps[0];
  const count = selected ? saved.counts[selected.id] ?? 1 : 1;
  const captain = step?.captain ?? steps[0]?.captain ?? 0;
  const held = useMemo(() => climbStart(arcade, stepInfos(arcade), current).start.held, [arcade, current]);
  const teams = useMemo(() => !selected || !step ? [] : teamsInBatch(selected.games.flatMap(g => outlooks.get(g.id) ?? []), step.target, captain, 4, new Set(held.filter(h => h.until > selected.at).map(h => h.card))), [selected, step, outlooks, captain, held]);
  const chances = useMemo(() => batchChances(teams, step?.target ?? 0, simulation(captain)), [teams, step?.target, captain]);
  const shown = teams.slice(0, count);
  const crests = useMemo(() => crestsOf(arcade), [arcade]);
  const pages = Math.max(1, Math.ceil(filtered.length / 12));
  const atPage = Math.min(page, pages - 1);
  const gamePages = Math.max(1, Math.ceil((selected?.games.length ?? 0) / 12));
  const atGamePage = Math.min(gamePage, gamePages - 1);
  const changeCount = (value: number) => { if (selected && Number.isFinite(value)) setSaved(s => ({ ...s, counts: { ...s.counts, [selected.id]: Math.max(1, Math.min(4, Math.trunc(value))) } })); };
  return <section className="arc-batches" aria-label="Batch">
    <div className="arc-plan-head arc-batch-heading"><h2>Batch</h2><div className="arc-batch-filters">
      <label>Date<input type="date" name="batch-date" autoComplete="off" aria-label="Batch date" value={saved.day} onChange={e => { setSaved(s => ({ ...s, day: e.target.value })); setPage(0); setGamePage(0); }} /></label>
      <button type="button" className="arc-small" onClick={() => { setSaved(s => ({ ...s, day: "" })); setPage(0); }} disabled={!saved.day}>All dates</button>
      <button type="button" className="arc-small" aria-pressed={saved.empty} disabled={!emptyCount && !saved.empty} onClick={() => { setSaved(s => ({ ...s, empty: !s.empty })); setPage(0); }}>Without your cards ({emptyCount})</button>
      {step ? <label>Aim at<select aria-label="Batch target" value={step.number} onChange={e => setAim(Number(e.target.value))}>{steps.filter(s => !["CLAIMED", "CLAIMABLE"].includes(s.state)).map(s => <option key={s.id} value={s.number}>Step {s.number} · {s.target} pts</option>)}</select></label> : null}
    </div></div>
    {filtered.length ? <>
      <ol className="arc-chain-rail arc-batch-rail" role="group" aria-label="Batches">
        {filtered.slice(atPage * 12, (atPage + 1) * 12).map(b => <li key={b.id}><span className="arc-chain-day">{madridDay(new Date(b.at).toISOString())}</span><button type="button" className="arc-chain-node" aria-pressed={b.id === selected?.id} onClick={() => { setSaved(s => ({ ...s, selected: b.id })); setGamePage(0); }}><span className="arc-chain-time">{madridTime(new Date(b.at).toISOString())}</span><span>{b.games.length} game{b.games.length === 1 ? "" : "s"}</span><span className="arc-batch-crests">{b.games.slice(0, 3).flatMap(g => [<Crest key={`${g.id}-h`} team={g.home} crests={crests} />, <Crest key={`${g.id}-a`} team={g.away} crests={crests} />])}</span>{mine(b) ? null : <small>no card of yours</small>}</button></li>)}
      </ol>
      {pages > 1 ? <nav className="arc-batch-pagination" aria-label="Batch pages"><button type="button" className="arc-small" disabled={atPage === 0} onClick={() => setPage(atPage - 1)}>Previous</button><span>{atPage + 1} / {pages}</span><button type="button" className="arc-small" disabled={atPage + 1 === pages} onClick={() => setPage(atPage + 1)}>Next</button></nav> : null}
      <div className="arc-batch-games">{selected?.games.slice(atGamePage * 12, (atGamePage + 1) * 12).map(g => <Match key={g.id} game={g} crests={crests} />)}</div>
      {gamePages > 1 ? <nav className="arc-batch-pagination" aria-label="Batch game pages"><button type="button" className="arc-small" disabled={atGamePage === 0} onClick={() => setGamePage(atGamePage - 1)}>Previous games</button><span>{atGamePage + 1} / {gamePages}</span><button type="button" className="arc-small" disabled={atGamePage + 1 === gamePages} onClick={() => setGamePage(atGamePage + 1)}>Next games</button></nav> : null}
      <div className="arc-batch-result"><div><h3>{shown.length ? `${shown.length} team${shown.length === 1 ? "" : "s"}` : "No team available"}</h3>{shown.length ? <p><b>{pct(chances[shown.length - 1] ?? 0)}</b> at least one clears step {step?.number}</p> : null}</div><div className="arc-batch-count" role="group" aria-label="Team count"><button type="button" aria-label="Fewer teams" disabled={count === 1} onClick={() => changeCount(count - 1)}>−</button><input type="number" min={1} max={4} step={1} aria-label="Teams in this batch" value={count} onChange={e => changeCount(e.target.valueAsNumber)} /><button type="button" aria-label="More teams" disabled={count === 4} onClick={() => changeCount(count + 1)}>+</button></div></div>
      {shown.length < count ? <p className="arc-note" role="status">{shown.length ? `Only ${shown.length} of ${count} teams can be built.` : "No complete team can be built."} Not enough available players with scores to fill GK, DEF, MID, FWD and Extra.</p> : null}
      <div className="arc-batch-lineups">{shown.map((team, i) => <article key={i} className="arc-batch-lineup" aria-label={`Batch team ${i + 1}`}><header><h3>Team {i + 1}</h3><span><b>{pts(team.expected)}</b> pts · <b>{pct(chanceOf(team.totals, step?.target ?? 0))}</b> to clear</span></header><LineupCards lineup={team} captainBonus={captain} /></article>)}</div>
    </> : <p className="arc-note" role="status">{!dated.length ? (saved.day ? "No batches on this date." : "No future games left in this set.") : `No window ${saved.day ? "on this date " : ""}has a card of yours.`}</p>}
  </section>;
}
