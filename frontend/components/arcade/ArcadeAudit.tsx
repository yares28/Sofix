"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { Arcade } from "../../lib/arcade";
import type { ArcadeAudit as Audit } from "../../lib/arcadeLog";
import { madridDay, madridTime, pts } from "./ArcadePlanner";
import { shieldColor } from "../../lib/arcadeFdr";

const PAGE = 12;
const ANSWER = { yes: "Yes", no: "No" } as const;

/** Each loophole as a yes or no with its evidence, or "not seen yet" (plans/arcade-trust.md step 12). */
function Loopholes({ loopholes: l }: { loopholes: NonNullable<Audit["loopholes"]> }) {
  const reach = (s: (typeof l.slots)[number]) => Math.max(0, ...Object.keys(s.clears).map(Number));
  const lead = l.slots[0];
  const best = lead ? `Reaches step ${reach(lead)} (${lead.windows} window${lead.windows === 1 ? "" : "s"})${l.slots.length > 1 ? ` · then ${l.slots.slice(1, 3).map((s) => s.slot).join(", ")}` : ""}` : "";
  const rows: { q: string; a: string; why: string }[] = [
    { q: "A cancelled insurance lineup costs one", a: l.insurance?.answer ? ANSWER[l.insurance.answer] : "Not seen yet", why: l.insurance?.seen ? `${l.insurance.cost} of ${l.insurance.seen} cancellations` : "No cancellation logged" },
    { q: "Lineups can be changed until kick-off", a: l.editing?.answer ? ANSWER[l.editing.answer] : "Not seen yet", why: l.editing?.lastEditableMinutes != null ? `Seen editable ${l.editing.lastEditableMinutes} min before kick-off` : "No lineup read near kick-off" },
    { q: "A second window the same day after a clear", a: `${l.secondWindow.withLater} of ${l.secondWindow.clears}`, why: "Clears in the climb with every score known" },
    { q: "Edition bonuses change the best five", a: `${l.bonuses.changed} of ${l.bonuses.windows}`, why: "Windows, club bonuses aside" },
    ...(l.captain?.windows ? [{ q: "Captain the top scorer or the surest starter", a: (l.captain.byScore ?? 0) >= (l.captain.byStart ?? 0) ? "Top scorer" : "Surest starter", why: `${pts(l.captain.byScore ?? 0)} against ${pts(l.captain.byStart ?? 0)} a window, over ${l.captain.windows}` }] : []),
    ...(best ? [{ q: "Kick-off slots that reach furthest", a: l.slots[0]!.slot, why: best }] : []),
  ];
  return (
    <section className="arc-audit-loopholes" aria-labelledby="arc-audit-loopholes-title">
      <h3 id="arc-audit-loopholes-title">Loopholes</h3>
      <dl>
        {rows.map((r) => <div key={r.q}><dt>{r.q}</dt><dd><b>{r.a}</b><small>{r.why}</small></dd></div>)}
      </dl>
    </section>
  );
}
const sum = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0);

/**
 * The Arcade audit, hindsight (plans/arcade-trust.md step 10; owner 29 Oct 2026: "how much could this set have paid with my cards, and
 * what would have got me there?"): the climb a player who knew every score would have made with your commons on your board, the clubs
 * and players that made it, and what you did. Worked out by the job; drawn here only.
 */
export default function ArcadeAudit({ audit, arcade }: { audit: Audit | null | "reading"; arcade: Arcade }) {
  const [page, setPage] = useState(0);
  const cards = useMemo(() => new Map(arcade.cards.map((c) => [c.slug, c])), [arcade.cards]);
  if (audit === "reading") {
    return (
      <section className="arc-audit is-loading" aria-busy="true" aria-label="Audit">
        <div className="arc-audit-hero"><span className="arc-skeleton arc-skeleton-title" /><span className="arc-skeleton arc-skeleton-line" /></div>
        <ol className="arc-chain-rail" aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <li key={i}><span className="arc-skeleton arc-skeleton-node" /></li>)}</ol>
      </section>
    );
  }
  if (!audit) return <section className="arc-audit" aria-label="Audit"><p className="arc-note">The audit is worked out at the next refresh after Arcade has sent your cards.</p></section>;

  const { hindsight, actual } = audit;
  const top = arcade.board?.steps.at(-1);
  const highest = hindsight.moves.reduce((best, m) => Math.max(best, m.step), 0);
  const moves = hindsight.moves;
  const pages = Math.max(1, Math.ceil(moves.length / PAGE));
  const at = Math.min(page, pages - 1);
  const shown = moves.slice(at * PAGE, (at + 1) * PAGE);
  const yours = actual.lineups ? `You: ${sum(actual.clears)} clear${sum(actual.clears) === 1 ? "" : "s"}${actual.tops ? `, ${actual.tops} top${actual.tops === 1 ? "" : "s"}` : ""} from ${actual.lineups} lineup${actual.lineups === 1 ? "" : "s"}` : "You: no lineup logged yet";
  let day = "";
  return (
    <section className="arc-audit" aria-labelledby="arc-audit-title">
      <header className="arc-audit-hero">
        <h2 id="arc-audit-title">
          {hindsight.tops ? `${hindsight.tops} × the top step` : highest ? `Step ${highest} at best` : "No step cleared"}
          {hindsight.tops && top?.rewards.length ? <small>{top.rewards.join(" + ")} each</small> : null}
        </h2>
        <p>{sum(hindsight.clears)} clears with every score known, from {audit.windows} kick-off windows · {yours}</p>
      </header>
      {moves.length ? <>
        <ol className="arc-chain-rail" aria-label="The climb with every score known">
          {shown.map((m, i) => {
            const d = madridDay(m.at);
            const newDay = d !== day;
            day = d;
            return (
              <li key={`${m.window}-${m.step}`} style={{ "--i": i } as CSSProperties} className={newDay ? "is-day" : undefined}>
                {newDay ? <span className="arc-chain-day">{d}</span> : <span className="arc-chain-day" aria-hidden="true" />}
                <div className="arc-chain-node is-likely" role="group" aria-label={`Step ${m.step} at ${d} ${madridTime(m.at)}: ${pts(m.total)} of ${m.target}`}>
                  <span className="arc-chain-time">{madridTime(m.at)}</span>
                  <span className="arc-chain-step">Step {m.step}</span>
                  <b>{pts(m.total)}</b>
                  <span className="arc-fan" aria-hidden="true">
                    {m.picks.map((p) => {
                      const picture = cards.get(p.card)?.picture;
                      // eslint-disable-next-line @next/next/no-img-element -- Sorare's card art
                      return picture ? <img key={p.card} src={picture} alt="" width={26} height={42} loading="lazy" /> : null;
                    })}
                  </span>
                  <small>of {m.target}</small>
                </div>
              </li>
            );
          })}
        </ol>
        {pages > 1 ? <nav className="arc-pager" aria-label="Climb pages"><button type="button" onClick={() => setPage(at - 1)} disabled={at === 0}>Previous</button><span>Page {at + 1} of {pages}</span><button type="button" onClick={() => setPage(at + 1)} disabled={at >= pages - 1}>Next</button></nav> : null}
        <div className="arc-audit-evidence">
          <section aria-labelledby="arc-audit-clubs">
            <h3 id="arc-audit-clubs">Clubs that got there</h3>
            <ul className="arc-audit-clubs">
              {audit.clubs.map((c) => (
                <li key={c.slug}>
                  {c.crest
                    // eslint-disable-next-line @next/next/no-img-element -- the club's crest
                    ? <img src={c.crest} alt="" width={32} height={32} loading="lazy" />
                    : <span className="arc-audit-shield" aria-hidden="true" style={{ background: shieldColor(c.slug) }} />}
                  <span>{c.name}</span>
                  <b aria-label={`${c.count} cards in those lineups`}>×{c.count}</b>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="arc-audit-players">
            <h3 id="arc-audit-players">Players who got there</h3>
            <ul className="arc-audit-players">
              {audit.players.map((p) => {
                const picture = p.picture ?? cards.get(p.card)?.picture ?? null;
                return (
                  <li key={p.card}>
                    {picture
                      // eslint-disable-next-line @next/next/no-img-element -- your Sorare card
                      ? <img src={picture} alt={p.name} width={96} height={155} loading="lazy" />
                      : <span className="arc-card-blank">{p.name}</span>}
                    <b aria-label={`in ${p.count} of those lineups`}>×{p.count}</b>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </> : <p className="arc-note">No window of your cards would have cleared step 1 yet.</p>}
      {audit.loopholes ? <Loopholes loopholes={audit.loopholes} /> : null}
      {audit.strategies?.length ? (
        <section className="arc-audit-rules" aria-labelledby="arc-audit-rules-title">
          {/* Each rule played on what was known before kick-off and scored on what happened (plans/arcade-trust.md step 11). */}
          <h3 id="arc-audit-rules-title">Ways to play, replayed{audit.strategies[0]!.enough ? "" : <small> · too few windows to tell</small>}</h3>
          <ol>
            {audit.strategies.map((r) => {
              const clears = sum(r.clears);
              return (
                <li key={r.key}>
                  <span className="arc-audit-rule-name">{r.name}</span>
                  <b aria-label={`${r.tops} tops`}>{r.tops ? `${r.tops} × top` : `${clears} clear${clears === 1 ? "" : "s"}`}</b>
                  <small>{r.played} lineup{r.played === 1 ? "" : "s"} · {r.lives} lost{r.band.clears[0] !== r.band.clears[1] ? ` · ${r.band.clears[0]}-${r.band.clears[1]} clears in most replays` : ""}</small>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
    </section>
  );
}
