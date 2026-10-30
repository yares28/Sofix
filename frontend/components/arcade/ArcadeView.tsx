"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ARCADE_BENCH_VERSION, ARCADE_EXTENSION_VERSION, ARCADE_PLAN_VERSION, chanceOf, gamesOf, keepArcade, lastArcade, loadArcadeChances, newerChances, outlookOf, readArcade, setEnded, readArcadeBench, readArcadeExtras, walkArcade,
  type Arcade, type ArcadeBench, type ArcadeChances, type ArcadeExtras, type ArcadeLaLiga, type ArcadeRead, type ArcadeStep, type ArcadeWalk,
} from "../../lib/arcade";
import type { Outlook } from "../../lib/arcadePlan";
import { matchFixture, type FdrFixture } from "../../lib/arcadeFdr";
import ArcadeLive from "./ArcadeLive";
import ArcadeCards from "./ArcadeCards";
import ArcadeAction from "./ArcadeAction";
import { FdrContext } from "./Fdr";
import ArcadeMissions from "./ArcadeMissions";
import ArcadePacks from "./ArcadePacks";
import ArcadePlanner, { climbStep } from "./ArcadePlanner";
import SegmentedControl from "../SegmentedControl";
import { ARCADE_ELEVENS_VERSION, readArcadeElevens, type ArcadeElevens } from "../../lib/arcadeElevens";

/** The page's three views (owner, 29 Oct), switched like the other pages; the last one chosen is remembered in this browser. */
type View = "play" | "packs" | "players";
const VIEWS: { value: View; label: string }[] = [{ value: "play", label: "Play now" }, { value: "packs", label: "Missions & packs" }, { value: "players", label: "Players" }];
const VIEW_KEY = "sofix-arcade-view";

/** The least time between two reads when you come back to the tab. */
const REREAD_MS = 3 * 60_000;

const madrid = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/Madrid", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const count = (value: number | null) => (value === null ? "—" : value.toLocaleString("en-GB"));
const WHY: Record<Exclude<ArcadeRead["state"], "ok" | "outdated" | "failed">, string> = {
  "no-extension": "This browser can't reach the Sofix extension. Open Arcade in the Chrome that has it.",
  "no-tab": "Open sorare.com in a tab of this Chrome, signed in, then read again.",
  "signed-out": "Sorare says no one is signed in on the open tab. Sign in there, then read again.",
  unreadable: "Sorare answered in a shape Sofix does not know yet, so nothing is shown rather than a wrong number.",
  "no-set": "No Arcade set is running on Sorare right now. The next one shows here as soon as Sorare opens it.",
};

function StepRow({ step, current }: { step: ArcadeStep; current: boolean }) {
  const lineups = step.lineups;
  const done = step.state === "CLAIMED" || step.state === "CLAIMABLE";
  return (
    <li className={`arc-step${current ? " is-current" : ""}${done ? " is-done" : ""}`} data-state={step.state} aria-current={current ? "step" : undefined}>
      <span className="arc-level">{done ? "✓" : step.number}</span>
      <strong>{step.target.toLocaleString("en-GB")} pts{step.originalTarget !== null && step.originalTarget !== step.target ? <s> {step.originalTarget}</s> : null}</strong>
      <span className="arc-reward">{step.rewards.length ? step.rewards.join(" + ") : "no reward"}</span>
      {current && lineups ? (
        <span className="arc-lives">
          <span aria-hidden="true">{"●".repeat(lineups.remaining)}{"○".repeat(Math.max(0, lineups.max - lineups.remaining))}</span> {lineups.remaining} of {lineups.max} lineups left{lineups.pending ? ` · ${lineups.pending} waiting` : ""}
        </span>
      ) : null}
    </li>
  );
}

const WALKED: Record<string, string> = {
  busy: "Sofix is already reading Sorare in another tab; try again in a minute.",
  "signed-out": "Sorare says no one is signed in. Sign in on sorare.com, then read again.",
  "no-page": "Sorare's Arcade lineup page did not open; nothing was read.",
  hidden: "Sorare's page stayed in the background and loaded nothing; keep Chrome in front and read again.",
  partial: "Sorare's page took too long; what it showed was saved.",
  "no-answer": "The extension did not answer.",
  error: "Reading Sorare's page failed; nothing more was saved.",
};

function Loaded({ arcade, unread, laliga, fdr, onReload, busy }: { arcade: Arcade; unread: string[]; laliga: ArcadeLaLiga; fdr: FdrFixture[]; onReload: () => void; busy: boolean }) {
  // Each game of a league with a Sofix board, matched to the board's fixture (kick-off and clubs).
  const boards = useMemo(() => new Map((arcade.games ?? []).flatMap((g) => { const f = matchFixture(g, fdr); return f ? [[g.id, f] as const] : []; })), [arcade.games, fdr]);
  const current = arcade.board?.current ?? null;
  const [actions, setActions] = useState<HTMLDivElement | null>(null);
  const [showRead, setShowRead] = useState(false);
  const [chances, setChances] = useState<ArcadeChances | null>(null);
  const [walking, setWalking] = useState(false);
  const [walked, setWalked] = useState<ArcadeWalk | null>(null);
  const gameIds = useMemo(() => {
    const clubs = new Set(arcade.cards.map((c) => c.teamSlug));
    return (arcade.games ?? []).filter((g) => clubs.has(g.home?.slug ?? null) || clubs.has(g.away?.slug ?? null)).map((g) => g.id);
  }, [arcade]);
  const [bench, setBench] = useState<ArcadeBench | "reading" | null>(null);
  const [elevens, setElevens] = useState<ArcadeElevens | null>(null);
  const benchStep = arcade.board?.steps.find((s) => s.number === climbStep(arcade)) ?? null;
  const refresh = useCallback(async (force = false) => {
    setBench("reading");
    const [saved, read, official] = await Promise.all([
      loadArcadeChances(gameIds),
      benchStep ? readArcadeBench(benchStep.id, arcade.set.end, force) : null,
      readArcadeElevens(arcade.games ?? [], arcade.cards, force).then((official) => { setElevens(official); return official; }),
    ]);
    setChances(read && Object.keys(read.chances).length ? newerChances(saved, read.chances) : saved);
    setElevens(official);
    setBench(read);
  }, [gameIds, benchStep, arcade.set.end, arcade.games, arcade.cards]);
  useEffect(() => { void refresh(); }, [refresh]); // once per read; never on a timer
  const [extras, setExtras] = useState<ArcadeExtras | null | "reading">("reading");
  useEffect(() => { void readArcadeExtras(arcade).then(setExtras); }, [arcade]); // once per read
  const ready = extras === "reading" ? null : extras;
  const [view, setView] = useState<View>(() => { try { return (VIEWS.find((v) => v.value === localStorage.getItem(VIEW_KEY))?.value) ?? "play"; } catch { return "play"; } });
  const pick = (next: View) => { setView(next); try { localStorage.setItem(VIEW_KEY, next); } catch { /* blocked: not remembered */ } };
  // Every card's outlook in each of its club's games, by game.
  const outlooks = useMemo(() => {
    const out = new Map<string, Outlook[]>();
    for (const game of arcade.games ?? []) {
      const list = arcade.cards.filter((c) => c.teamSlug && (c.teamSlug === game.home?.slug || c.teamSlug === game.away?.slug)).map((c) => outlookOf(c, game, ready, chances, laliga, elevens?.chances));
      if (list.length) out.set(game.id, list);
    }
    return out;
  }, [arcade, ready, chances, laliga, elevens]);
  // The plan and the mission picks are worked out once the start % read is done, not again for every answer on the way.
  const [planOutlooks, setPlanOutlooks] = useState<Map<string, Outlook[]> | null>(null);
  useEffect(() => { if (elevens || (bench !== "reading" && (bench !== null || !benchStep))) setPlanOutlooks(outlooks); }, [outlooks, bench, benchStep, elevens]);
  const captainBonus = arcade.board?.steps.find((s) => s.number === current)?.captain ?? arcade.board?.steps[0]?.captain ?? 0;
  const step = arcade.board?.steps.find((s) => s.number === current) ?? arcade.board?.steps[0] ?? null;
  const read = async () => {
    setShowRead(true);
    if (!arcade.board?.config || !step) return;
    setWalking(true);
    setWalked(null);
    const answer = await walkArcade(arcade.board.config, step.id);
    setWalked(answer);
    await refresh();
    setWalking(false);
  };
  const withChance = arcade.cards.filter((c) => (arcade.games ? gamesOf(c, arcade.games) : []).some((g) => chanceOf(elevens?.chances ?? null, g.id, c.player) ?? chanceOf(chances, g.id, c.player))).length;
  return (
    <FdrContext.Provider value={boards}>
      <header className="arc-hero">
        <p className="arc-kicker">{arcade.set.name} · {setEnded(arcade) ? "ended" : "ends"} {madrid(arcade.set.end)}</p>
        <div className="arc-hero-top">
          <h1>{current === null ? "No step started" : `Step ${current}`}{arcade.board ? ` of ${arcade.board.steps.length}` : ""}{step && current !== null ? <span> · {step.target.toLocaleString("en-GB")} pts</span> : null}</h1>
          <dl className="arc-wallet">
            <div><dt>Gems</dt><dd>{count(arcade.gems)}</dd></div>
            <div><dt>Essence</dt><dd>{count(arcade.essence)}</dd></div>
            <div><dt>{arcade.set.name} commons</dt><dd>{arcade.cards.length.toLocaleString("en-GB")}{arcade.cardsCut ? "+" : ""}</dd></div>
          </dl>
        </div>
        <div className="arc-actions" role="group" aria-label="Refresh Arcade data">
          <ArcadeAction label="Refresh board and cards" kind="board" onClick={onReload} busy={busy} />
          <ArcadeAction label={bench && bench !== "reading" && bench.state === "ok" ? "Refresh start percentages" : "Read Arcade's start % (opens Sorare's page)"} kind="start" busy={walking || bench === "reading"} disabled={!benchStep} onClick={() => { setShowRead(true); if (bench && bench !== "reading" && bench.state === "ok") void refresh(true); else void read(); }} />
          <div ref={setActions} className="arc-score-action">{!ready ? <ArcadeAction label="Refresh scores" kind="scores" disabled title="Waiting for card projections" /> : null}</div>
          <button type="button" className="arc-action arc-read-info" aria-label="Start percentage read details" title="Start percentage read details" aria-expanded={showRead} aria-controls="arc-start-details" onClick={() => setShowRead(!showRead)}>i</button>
        </div>
        {/* The tower in the plan shows the steps once predictions are read; until then, the plain ladder. */}
        {arcade.board ? (ready ? null : 
          <ol className="arc-steps" aria-label="Your board">
            {arcade.board.steps.map((s) => <StepRow key={s.id} step={s} current={s.number === current} />)}
          </ol>
        ) : <p className="arc-note">Sorare has no set board for this account yet.</p>}
      </header>
      <section id="arc-start-details" className="arc-read" aria-label="Sorare's start %" hidden={!showRead}>
        <p>
          {arcade.games === null ? "Sorare did not give the board's games, so start % cannot be matched to cards."
            : chances === null ? "Saved start % could not be read."
            : `Sorare's start % for ${withChance.toLocaleString("en-GB")} of ${arcade.cards.length.toLocaleString("en-GB")} cards, across ${arcade.games.length} games before the set ends.`}
        </p>
        {elevens?.games.length ? <p className="arc-read-note">Confirmed lineups for {elevens.games.length} game{elevens.games.length === 1 ? "" : "s"}: starters 100%, non-starters 0%.</p> : null}
        {elevens?.state === "ok" && elevens.checked > 0 && !elevens.games.length && !elevens.unread.length ? <p className="arc-read-note">No confirmed lineups returned for the next games yet.</p> : null}
        {elevens?.state === "outdated" ? <p className="arc-read-note" role="status">Confirmed lineups need extension {ARCADE_ELEVENS_VERSION}: reload Sofix on chrome://extensions.</p>
          : elevens?.state === "no-extension" ? <p className="arc-read-note" role="status">The extension could not be reached for confirmed lineups. The last valid reading is kept.</p>
          : elevens?.unread.length ? <p className="arc-read-note" role="status">Confirmed lineups could not be read for {elevens.unread.length} game{elevens.unread.length === 1 ? "" : "s"}. The last valid reading is kept.</p> : null}
        {bench === "reading" ? <p className="arc-read-note" role="status">Reading Sorare&apos;s start % from your Sorare tab, every day to the set&apos;s end…</p>
          : bench && bench.state === "ok" ? <p className="arc-read-note">Read from your Sorare tab at {new Date(bench.at).toLocaleTimeString("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" })}; nothing opened.</p>
          : bench && bench.state === "outdated" ? <p className="arc-read-note">Start % without opening a page needs extension {ARCADE_BENCH_VERSION}: reload it on chrome://extensions.</p>
          : bench && bench.state === "refused" ? <p className="arc-read-note" role="status">Sorare refused the start-percentage read. The last saved percentages remain visible.</p> : null}
        {walking ? <p className="arc-read-note">Sorare&apos;s Arcade lineup page opens in a tab for about a minute, then closes. Nothing is picked or saved on Sorare.</p> : null}
        {walked ? (
          <p className="arc-read-note" role="status">
            {walked.state === "ok" ? `Read ${walked.players ?? 0} players in ${walked.games ?? 0} games.` : WALKED[walked.state] ?? `Stopped: ${walked.state}.`}
          </p>
        ) : null}
      </section>
      {unread.length ? <p className="arc-note" role="status">Not read this time: {unread.join(", ")}.</p> : null}
      <p className="arc-read-state" role="status">
        {extras === "reading" ? "Reading projections, past scores and club bonuses from Sorare…"
          : extras === null ? `Predictions need extension ${ARCADE_PLAN_VERSION}: reload it on chrome://extensions. Until then cards are scored on nothing.`
          : extras.unread.length ? `Not read this time: ${extras.unread.join(", ")}.` : null}
      </p>
      <div className="arc-views"><SegmentedControl<View> label="Arcade view" size="lg" value={view} onChange={pick} options={VIEWS} /></div>
      {/* Every view stays mounted (hidden, not removed), so a switch keeps its reads, picks and page. */}
      <div className="arc-view" hidden={view !== "play"}>
        {ready ? <ArcadeLive arcade={arcade} outlooks={outlooks} captainBonus={captainBonus} actions={actions} /> : null}
        {ready && planOutlooks ? <ArcadePlanner arcade={arcade} outlooks={planOutlooks} captainBonus={captainBonus} status={ready.status ?? {}} /> : ready ? <p className="arc-read-state" role="status">Planning the climb once Sorare&apos;s start % are in…</p> : null}
      </div>
      <div className="arc-view" hidden={view !== "packs"}>
        <ArcadeMissions arcade={arcade} outlooks={outlooks} />
        <ArcadePacks arcade={arcade} />
      </div>
      <div className="arc-view" hidden={view !== "players"}>
        <ArcadeCards cards={arcade.cards} games={arcade.games} outlooks={outlooks} status={ready?.status ?? {}} form={ready?.form ?? {}} />
      </div>
    </FdrContext.Provider>
  );
}

/** Arcade, step 1: everything Sofix can read of your set board, shown as Sorare gives it, so it can be checked against Sorare's screen. */
const whyNot = (read: Exclude<ArcadeRead, { state: "ok" }>) =>
  read.state === "outdated" ? `Arcade needs extension ${ARCADE_EXTENSION_VERSION}; this Chrome has ${read.version}. Reload it on chrome://extensions.`
    : read.state === "failed" ? `Sorare refused part of the read (${read.detail}).`
    : WHY[read.state];

export default function ArcadeView({ laliga, fdr = [] }: { laliga: ArcadeLaLiga; fdr?: FdrFixture[] }) {
  const [read, setRead] = useState<ArcadeRead | null>(null);
  // What is shown: the fresh read, or until then (or when Sorare cannot be read) the last one kept in this browser, with its time.
  const [board, setBoard] = useState<{ arcade: Arcade; unread: string[]; at: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const lastRead = useRef(0);
  const load = useCallback(async () => {
    lastRead.current = Date.now();
    setBusy(true);
    const fresh = await readArcade();
    setRead(fresh);
    if (fresh.state === "ok") {
      setBoard({ arcade: fresh.arcade, unread: fresh.unread, at: null });
      keepArcade(fresh.arcade, fresh.unread);
    }
    setBusy(false);
  }, []);
  useEffect(() => {
    const last = lastArcade();
    if (last) setBoard(last);
    void load();
  }, [load]); // once per visit
  // Back on this tab after opening packs on Sorare (owner, 29 Oct: lineups follow the players you get): read again, at most every
  // REREAD_MS and only while the tab is visible. The read goes to Sorare through the extension; the page itself asks Sofix once.
  useEffect(() => {
    const back = () => { if (document.visibilityState === "visible" && Date.now() - lastRead.current > REREAD_MS) void load(); };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, [load]);
  const at = board?.at != null ? madrid(new Date(board.at).toISOString()) : null;
  const ended = board ? setEnded(board.arcade) : false;

  return (
    <main className="arc-main" aria-busy={busy}>
      {board ? (
        <>
          {ended ? (
            <p className="arc-note" role="status">
              {board.arcade.set.name} has ended: your last board{at ? `, as read ${at}` : ""}. {read === null ? "Asking Sorare for the next set…" : read.state === "no-set" ? "The next set shows here as soon as Sorare opens it." : read.state === "ok" ? null : whyNot(read)}
            </p>
          ) : at ? (
            <p className="arc-note" role="status">
              {read === null || read.state === "ok" ? `Your board as read ${at}; asking Sorare for what changed…` : `Your board as read ${at}. ${whyNot(read)}`}
            </p>
          ) : null}
          {!ended && !at && read && read.state !== "ok" ? <p className="arc-note" role="status">{whyNot(read)} Showing the last successful read.</p> : null}
          <Loaded arcade={board.arcade} unread={board.unread} laliga={laliga} fdr={fdr} onReload={() => void load()} busy={busy} />
        </>
      ) : (
        <section className="arc-empty" role="status">
          <h1>Arcade</h1>
          <p>{read === null ? "Reading your board from Sorare…" : read.state === "ok" ? null : whyNot(read)}</p>
        </section>
      )}
      {!board ? <div className="arc-actions" role="group" aria-label="Refresh Arcade data"><ArcadeAction label="Refresh board and cards" kind="board" onClick={() => void load()} busy={busy} /></div> : null}
    </main>
  );
}
