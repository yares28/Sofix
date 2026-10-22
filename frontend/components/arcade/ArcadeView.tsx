"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ARCADE_BENCH_VERSION, ARCADE_EXTENSION_VERSION, ARCADE_PLAN_VERSION, bonusLabel, chanceOf, gamesOf, keepArcade, lastArcade, loadArcadeChances, newerChances, outlookOf, readArcade, readArcadeBench, readArcadeExtras, walkArcade,
  type Arcade, type ArcadeBench, type ArcadeCard, type ArcadeChances, type ArcadeExtras, type ArcadeGame, type ArcadeLaLiga, type ArcadeRead, type ArcadeStep, type ArcadeWalk,
} from "../../lib/arcade";
import type { Outlook } from "../../lib/arcadePlan";
import { matchFixture, type FdrFixture } from "../../lib/arcadeFdr";
import ArcadeLive from "./ArcadeLive";
import { FdrChip, FdrContext } from "./Fdr";
import ArcadeMissions from "./ArcadeMissions";
import ArcadePacks from "./ArcadePacks";
import ArcadePlanner, { climbStep, Prediction, StartLabel } from "./ArcadePlanner";

const PAGE_SIZE = 48;
const madrid = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/Madrid", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const count = (value: number | null) => (value === null ? "—" : value.toLocaleString("en-GB"));
const POSITIONS = ["Goalkeeper", "Defender", "Midfielder", "Forward"];
const kickoff = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/Madrid", weekday: "short", hour: "2-digit", minute: "2-digit" });
const opponent = (game: ArcadeGame, club: string | null) => (game.home?.slug === club ? `v ${game.away?.name ?? "?"}` : `at ${game.home?.name ?? "?"}`);

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

/** A card's next games with Sorare's start % for each, as saved; "no start % yet" where Sorare has shown none. */
function CardGames({ card, games, outlooks }: { card: ArcadeCard; games: ArcadeGame[] | null; outlooks: Map<string, Outlook[]> }) {
  if (games === null) return null;
  const mine = gamesOf(card, games).slice(0, 2);
  if (!mine.length) return <span className="arc-nogame">No game before the set ends</span>;
  return (
    <>
      {mine.map((game, i) => {
        const outlook = outlooks.get(game.id)?.find((o) => o.card.slug === card.slug);
        return (
          <span key={game.id} className="arc-chance" title={`${game.home?.name ?? "?"} v ${game.away?.name ?? "?"} · ${game.competition.name}`}>
            {i === 0 && outlook ? <><Prediction outlook={outlook} /><br /></> : null}
            {outlook ? <StartLabel outlook={outlook} /> : <i>no start % yet</i>} · {kickoff(game.kickoff)} {opponent(game, card.teamSlug)} <FdrChip game={game.id} home={game.home?.slug === card.teamSlug} position={card.positions[0]} />
          </span>
        );
      })}
    </>
  );
}

function Cards({ cards, games, chances, outlooks }: { cards: ArcadeCard[]; games: ArcadeGame[] | null; chances: ArcadeChances | null; outlooks: Map<string, Outlook[]> }) {
  const [sort, setSort] = useState<"name" | "start">("name");
  const [query, setQuery] = useState("");
  const [league, setLeague] = useState("");
  const [position, setPosition] = useState("");
  const [edition, setEdition] = useState("");
  const [page, setPage] = useState(0);

  const leagues = useMemo(() => [...new Map(cards.flatMap((c) => (c.league ? [[c.league.slug, c.league.name] as const] : []))).entries()].sort((a, b) => a[1].localeCompare(b[1])), [cards]);
  const editions = useMemo(() => [...new Set(cards.map((c) => c.edition ?? "Standard"))].sort(), [cards]);
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase();
    return cards.filter((c) =>
      (!words || c.name.toLowerCase().includes(words) || (c.team ?? "").toLowerCase().includes(words))
      && (!league || c.league?.slug === league)
      && (!position || c.positions.includes(position))
      && (!edition || (c.edition ?? "Standard") === edition));
  }, [cards, query, league, position, edition]);
  const ordered = useMemo(() => {
    if (sort === "name" || !games) return shown;
    const start = (c: ArcadeCard) => {
      const next = gamesOf(c, games)[0];
      return next ? chanceOf(chances, next.id, c.player)?.percent ?? -1 : -2;
    };
    return [...shown].sort((a, b) => start(b) - start(a) || a.name.localeCompare(b.name));
  }, [shown, sort, games, chances]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const at = Math.min(page, pages - 1);
  const slice = ordered.slice(at * PAGE_SIZE, (at + 1) * PAGE_SIZE);
  const reset = <T,>(set: (value: T) => void) => (value: T) => { set(value); setPage(0); };

  return (
    <section className="arc-cards" aria-labelledby="arc-cards-title">
      <h2 id="arc-cards-title">Your cards</h2>
      <div className="arc-filters">
        <input type="search" placeholder="Player or club" aria-label="Search player or club" value={query} onChange={(e) => reset(setQuery)(e.target.value)} />
        <select aria-label="League" value={league} onChange={(e) => reset(setLeague)(e.target.value)}>
          <option value="">All leagues</option>
          {leagues.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
        </select>
        <select aria-label="Position" value={position} onChange={(e) => reset(setPosition)(e.target.value)}>
          <option value="">All positions</option>
          {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select aria-label="Edition" value={edition} onChange={(e) => reset(setEdition)(e.target.value)}>
          <option value="">All editions</option>
          {editions.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select aria-label="Sort" value={sort} onChange={(e) => reset(setSort)(e.target.value === "start" ? "start" : "name")}>
          <option value="name">By name</option>
          <option value="start">By start % (next game)</option>
        </select>
      </div>
      <p className="arc-count" role="status">
        {shown.length ? `${(at * PAGE_SIZE + 1).toLocaleString("en-GB")}–${(at * PAGE_SIZE + slice.length).toLocaleString("en-GB")} of ${shown.length.toLocaleString("en-GB")}` : "No card matches"}
      </p>
      <div className="arc-grid">
        {slice.map((card) => {
          const bonus = bonusLabel(card.bonus);
          return (
            <figure key={card.slug} className="arc-card">
              {card.picture
                // eslint-disable-next-line @next/next/no-img-element -- Sorare's card art, as on the other pages
                ? <img src={card.picture} alt={card.name} loading="lazy" width={120} height={194} />
                : <div className="arc-card-blank">{card.name}</div>}
              <figcaption>
                <span className="arc-card-name">{card.name}</span>
                {bonus ? <span className="arc-bonus">{card.edition} {bonus}</span> : null}
                <CardGames card={card} games={games} outlooks={outlooks} />
              </figcaption>
            </figure>
          );
        })}
      </div>
      {pages > 1 ? (
        <nav className="arc-pager" aria-label="Card pages">
          <button type="button" onClick={() => setPage(at - 1)} disabled={at === 0}>Previous</button>
          <span>Page {at + 1} of {pages}</span>
          <button type="button" onClick={() => setPage(at + 1)} disabled={at >= pages - 1}>Next</button>
        </nav>
      ) : null}
    </section>
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

function Loaded({ arcade, unread, laliga, fdr }: { arcade: Arcade; unread: string[]; laliga: ArcadeLaLiga; fdr: FdrFixture[] }) {
  // Each game of a league with a Sofix board, matched to the board's fixture (kick-off and clubs).
  const boards = useMemo(() => new Map((arcade.games ?? []).flatMap((g) => { const f = matchFixture(g, fdr); return f ? [[g.id, f] as const] : []; })), [arcade.games, fdr]);
  const current = arcade.board?.current ?? null;
  const [chances, setChances] = useState<ArcadeChances | null>(null);
  const [walking, setWalking] = useState(false);
  const [walked, setWalked] = useState<ArcadeWalk | null>(null);
  const gameIds = useMemo(() => {
    const clubs = new Set(arcade.cards.map((c) => c.teamSlug));
    return (arcade.games ?? []).filter((g) => clubs.has(g.home?.slug ?? null) || clubs.has(g.away?.slug ?? null)).map((g) => g.id);
  }, [arcade]);
  const [bench, setBench] = useState<ArcadeBench | "reading" | null>(null);
  const benchStep = arcade.board?.steps.find((s) => s.number === climbStep(arcade)) ?? null;
  const refresh = useCallback(async (force = false) => {
    const saved = await loadArcadeChances(gameIds);
    setChances(saved);
    if (!benchStep) return;
    setBench("reading");
    const read = await readArcadeBench(benchStep.id, arcade.set.end, force);
    setBench(read);
    // The newer reading of each player, saved or just read.
    if (Object.keys(read.chances).length) setChances((now) => newerChances(now, read.chances));
  }, [gameIds, benchStep, arcade.set.end]);
  useEffect(() => { void refresh(); }, [refresh]); // once per read; never on a timer
  const [extras, setExtras] = useState<ArcadeExtras | null | "reading">("reading");
  useEffect(() => { void readArcadeExtras(arcade).then(setExtras); }, [arcade]); // once per read
  const ready = extras === "reading" ? null : extras;
  // Every card's outlook in each of its club's games, by game.
  const outlooks = useMemo(() => {
    const out = new Map<string, Outlook[]>();
    for (const game of arcade.games ?? []) {
      const list = arcade.cards.filter((c) => c.teamSlug && (c.teamSlug === game.home?.slug || c.teamSlug === game.away?.slug)).map((c) => outlookOf(c, game, ready, chances, laliga));
      if (list.length) out.set(game.id, list);
    }
    return out;
  }, [arcade, ready, chances, laliga]);
  // The plan and the mission picks are worked out once the start % read is done, not again for every answer on the way.
  const [planOutlooks, setPlanOutlooks] = useState<Map<string, Outlook[]> | null>(null);
  useEffect(() => { if (bench !== "reading" && (bench !== null || !benchStep)) setPlanOutlooks(outlooks); }, [outlooks, bench, benchStep]);
  const captainBonus = arcade.board?.steps.find((s) => s.number === current)?.captain ?? arcade.board?.steps[0]?.captain ?? 0;
  const step = arcade.board?.steps.find((s) => s.number === current) ?? arcade.board?.steps[0] ?? null;
  const read = async () => {
    if (!arcade.board?.config || !step) return;
    setWalking(true);
    setWalked(null);
    const answer = await walkArcade(arcade.board.config, step.id);
    setWalked(answer);
    await refresh();
    setWalking(false);
  };
  // How far ahead Sorare has given numbers: it shows a start % only near a game, so later games read "no start % yet".
  const lastRead = (arcade.games ?? []).filter((g) => Object.keys(chances?.[g.id] ?? {}).length).map((g) => g.kickoff).sort().at(-1) ?? null;
  const later = lastRead ? (arcade.games ?? []).filter((g) => g.kickoff.slice(0, 10) > lastRead.slice(0, 10)).length : 0;
  const withChance = arcade.cards.filter((c) => (arcade.games ? gamesOf(c, arcade.games) : []).some((g) => chanceOf(chances, g.id, c.player))).length;
  return (
    <FdrContext.Provider value={boards}>
      <header className="arc-hero">
        <p className="arc-kicker">{arcade.set.name} · ends {madrid(arcade.set.end)}</p>
        <div className="arc-hero-top">
          <h1>{current === null ? "No step started" : `Step ${current}`}{arcade.board ? ` of ${arcade.board.steps.length}` : ""}{step && current !== null ? <span> · {step.target.toLocaleString("en-GB")} pts</span> : null}</h1>
          <dl className="arc-wallet">
            <div><dt>Gems</dt><dd>{count(arcade.gems)}</dd></div>
            <div><dt>Essence</dt><dd>{count(arcade.essence)}</dd></div>
            <div><dt>{arcade.set.name} commons</dt><dd>{arcade.cards.length.toLocaleString("en-GB")}{arcade.cardsCut ? "+" : ""}</dd></div>
          </dl>
        </div>
        {/* The tower in the plan shows the steps once predictions are read; until then, the plain ladder. */}
        {arcade.board ? (ready ? null : 
          <ol className="arc-steps" aria-label="Your board">
            {arcade.board.steps.map((s) => <StepRow key={s.id} step={s} current={s.number === current} />)}
          </ol>
        ) : <p className="arc-note">Sorare has no set board for this account yet.</p>}
      </header>
      {unread.length ? <p className="arc-note" role="status">Not read this time: {unread.join(", ")}.</p> : null}
      <p className="arc-read-state" role="status">
        {extras === "reading" ? "Reading projections, past scores and club bonuses from Sorare…"
          : extras === null ? `Predictions need extension ${ARCADE_PLAN_VERSION}: reload it on chrome://extensions. Until then cards are scored on nothing.`
          : extras.unread.length ? `Not read this time: ${extras.unread.join(", ")}.` : null}
      </p>
      {ready ? <ArcadeLive arcade={arcade} outlooks={outlooks} captainBonus={captainBonus} /> : null}
      {ready && planOutlooks ? <ArcadePlanner arcade={arcade} outlooks={planOutlooks} captainBonus={captainBonus} /> : ready ? <p className="arc-read-state" role="status">Planning the climb once Sorare&apos;s start % are in…</p> : null}
      <section className="arc-read" aria-label="Sorare's start %">
        <p>
          {arcade.games === null ? "Sorare did not give the board's games, so start % cannot be matched to cards."
            : chances === null ? "Saved start % could not be read."
            : `Sorare's start % for ${withChance.toLocaleString("en-GB")} of ${arcade.cards.length.toLocaleString("en-GB")} cards, across ${arcade.games.length} games before the set ends.`}
        </p>
        {lastRead && later ? (
          <p className="arc-read-note">
            Sorare has given start % for games up to {new Date(lastRead).toLocaleDateString("en-GB", { timeZone: "Europe/Madrid", weekday: "long" })}; the {later} later games get theirs closer to kick-off, so read again then.
          </p>
        ) : null}
        {bench === "reading" ? <p className="arc-read-note" role="status">Reading Sorare&apos;s start % from your Sorare tab, every day to the set&apos;s end…</p>
          : bench && bench.state === "ok" ? <p className="arc-read-note">Read from your Sorare tab at {new Date(bench.at).toLocaleTimeString("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" })}; nothing opened.</p>
          : bench && bench.state === "outdated" ? <p className="arc-read-note">Start % without opening a page needs extension {ARCADE_BENCH_VERSION}: reload it on chrome://extensions.</p> : null}
        {bench && bench !== "reading" && bench.state === "ok" ? (
          <button type="button" className="arc-small" onClick={() => void refresh(true)}>Read start % again</button>
        ) : (
          <button type="button" onClick={() => void read()} disabled={walking || bench === "reading" || !arcade.board?.config || !step}>
            {walking ? "Reading Sorare's Arcade page…" : "Read Arcade's start % (opens Sorare's page)"}
          </button>
        )}
        {walking ? <p className="arc-read-note">Sorare&apos;s Arcade lineup page opens in a tab for about a minute, then closes. Nothing is picked or saved on Sorare.</p> : null}
        {walked ? (
          <p className="arc-read-note" role="status">
            {walked.state === "ok" ? `Read ${walked.players ?? 0} players in ${walked.games ?? 0} games.` : WALKED[walked.state] ?? `Stopped: ${walked.state}.`}
          </p>
        ) : null}
      </section>
      <ArcadePacks arcade={arcade} />
      <ArcadeMissions arcade={arcade} outlooks={ready ? planOutlooks : null} />
      <Cards cards={arcade.cards} games={arcade.games} chances={chances} outlooks={outlooks} />
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
  const load = useCallback(async () => {
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
  }, [load]); // once per visit; never on focus or on a timer
  const at = board?.at != null ? madrid(new Date(board.at).toISOString()) : null;

  return (
    <main className="arc-main" aria-busy={busy}>
      {board ? (
        <>
          {at ? (
            <p className="arc-note" role="status">
              {read === null || read.state === "ok" ? `Your board as read ${at}; asking Sorare for what changed…` : `Your board as read ${at}. ${whyNot(read)}`}
            </p>
          ) : null}
          <Loaded arcade={board.arcade} unread={board.unread} laliga={laliga} fdr={fdr} />
        </>
      ) : (
        <section className="arc-empty" role="status">
          <h1>Arcade</h1>
          <p>{read === null ? "Reading your board from Sorare…" : read.state === "ok" ? null : whyNot(read)}</p>
        </section>
      )}
      <button type="button" className="arc-again" onClick={() => void load()} disabled={busy}>{busy ? "Reading…" : "Read again"}</button>
    </main>
  );
}
