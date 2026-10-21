"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ARCADE_EXTENSION_VERSION, bonusLabel, readArcade, type Arcade, type ArcadeCard, type ArcadeRead, type ArcadeStep } from "../../lib/arcade";

const PAGE_SIZE = 48;
const madrid = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/Madrid", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const count = (value: number | null) => (value === null ? "—" : value.toLocaleString("en-GB"));
const POSITIONS = ["Goalkeeper", "Defender", "Midfielder", "Forward"];

const WHY: Record<Exclude<ArcadeRead["state"], "ok" | "outdated" | "failed">, string> = {
  "no-extension": "This browser can't reach the Sofix extension. Open Arcade in the Chrome that has it.",
  "no-tab": "Open sorare.com in a tab of this Chrome, signed in, then read again.",
  "signed-out": "Sorare says no one is signed in on the open tab. Sign in there, then read again.",
  unreadable: "Sorare answered in a shape Sofix does not know yet, so nothing is shown rather than a wrong number.",
};

function StepRow({ step, current }: { step: ArcadeStep; current: boolean }) {
  const lineups = step.lineups;
  return (
    <li className={`arc-step${current ? " is-current" : ""}`} data-state={step.state}>
      <span className="arc-level">{step.number}</span>
      <div className="arc-step-main">
        <strong>{step.target.toLocaleString("en-GB")} pts</strong>
        {step.originalTarget !== null && step.originalTarget !== step.target ? <s>{step.originalTarget}</s> : null}
        <span className="arc-reward">{step.rewards.length ? step.rewards.join(" + ") : "no reward"}</span>
      </div>
      <div className="arc-step-side">
        <span className="arc-state">{step.state.toLowerCase().replaceAll("_", " ")}</span>
        {lineups ? <span>{lineups.remaining} of {lineups.max} lineups left · {lineups.pending} waiting · {lineups.locked} locked</span> : null}
        {step.entered.length ? <span>{step.entered.length} lineup{step.entered.length > 1 ? "s" : ""} entered</span> : null}
      </div>
    </li>
  );
}

function Cards({ cards }: { cards: ArcadeCard[] }) {
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
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const at = Math.min(page, pages - 1);
  const slice = shown.slice(at * PAGE_SIZE, (at + 1) * PAGE_SIZE);
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

function Loaded({ arcade, unread }: { arcade: Arcade; unread: string[] }) {
  const current = arcade.board?.current ?? null;
  return (
    <>
      <header className="arc-hero">
        <p className="arc-kicker">{arcade.set.name} · ends {madrid(arcade.set.end)}</p>
        <h1>{current === null ? "No step started" : `Step ${current}`}{arcade.board ? ` of ${arcade.board.steps.length}` : ""}</h1>
        <dl className="arc-wallet">
          <div><dt>Gems</dt><dd>{count(arcade.gems)}</dd></div>
          <div><dt>Essence</dt><dd>{count(arcade.essence)}</dd></div>
          <div><dt>{arcade.set.name} commons</dt><dd>{arcade.cards.length.toLocaleString("en-GB")}{arcade.cardsCut ? "+" : ""}</dd></div>
        </dl>
      </header>
      {unread.length ? <p className="arc-note" role="status">Not read this time: {unread.join(", ")}.</p> : null}
      {arcade.board ? (
        <section aria-label="Your board">
          <ol className="arc-steps">
            {arcade.board.steps.map((step) => <StepRow key={step.id} step={step} current={step.number === current} />)}
          </ol>
        </section>
      ) : <p className="arc-note">Sorare has no set board for this account yet.</p>}
      <section aria-labelledby="arc-missions-title" className="arc-missions">
        <h2 id="arc-missions-title">Today&apos;s common missions</h2>
        {arcade.missions.length ? (
          <ul>
            {arcade.missions.map((m) => (
              <li key={m.id}>
                <strong>{m.title ?? m.kind}</strong>
                {m.description ? <span>{m.description}</span> : null}
                <span>{m.rewards.join(" + ") || "—"}</span>
                {m.progress !== null && m.target !== null ? <span>{m.progress} of {m.target}</span> : null}
                {m.picks !== null ? <span>{m.picks}{m.maxPicks !== null ? ` of ${m.maxPicks}` : ""} picked</span> : null}
              </li>
            ))}
          </ul>
        ) : <p>Sorare has no common mission for you today.</p>}
      </section>
      <Cards cards={arcade.cards} />
    </>
  );
}

/** Arcade, step 1: everything Sofix can read of your set board, shown as Sorare gives it, so it can be checked against Sorare's screen. */
export default function ArcadeView() {
  const [read, setRead] = useState<ArcadeRead | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    setRead(await readArcade());
    setBusy(false);
  }, []);
  useEffect(() => { void load(); }, [load]); // once per visit; never on focus or on a timer

  return (
    <main className="arc-main" aria-busy={busy}>
      {read?.state === "ok" ? <Loaded arcade={read.arcade} unread={read.unread} /> : (
        <section className="arc-empty" role="status">
          <h1>Arcade</h1>
          <p>
            {read === null ? "Reading your board from Sorare…"
              : read.state === "outdated" ? `Arcade needs extension ${ARCADE_EXTENSION_VERSION}; this Chrome has ${read.version}. Reload it on chrome://extensions.`
              : read.state === "failed" ? `Sorare refused part of the read (${read.detail}).`
              : WHY[read.state]}
          </p>
        </section>
      )}
      <button type="button" className="arc-again" onClick={() => void load()} disabled={busy}>{busy ? "Reading…" : "Read again"}</button>
    </main>
  );
}
