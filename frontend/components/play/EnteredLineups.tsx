"use client";

import CardZoom from "../ui/CardZoom";
import { useEffect, useState } from "react";
import { cannot } from "../../lib/apply";
import { pendingLine, resultLine, type GameweekLineup, type WeekLineupsAnswer } from "../../lib/entered";
import { readEnteredWeek } from "../../lib/myWeeksClient";
import { REQUIRED_EXTENSION_VERSION } from "../../lib/extension";
import { Foil } from "./bits";
import SorareImage from "./SorareImage";

type Week = { slug: string; number: number; lock?: string };
type Failure = Exclude<WeekLineupsAnswer, { state: "ok" }>;
type LoadState =
  | { state: "loading"; lineups: GameweekLineup[] }
  | { state: "ready"; lineups: GameweekLineup[]; at: Date; saved?: boolean }
  | { state: "unavailable"; lineups: GameweekLineup[]; answer: Failure };

/** Lineups the signed-in manager actually put on Sorare, read from this exact Sorare gameweek. */
export default function EnteredLineups({ week }: { week: Week }) {
  const [load, setLoad] = useState<LoadState>({ state: "loading", lineups: [] });
  const [asked, setAsked] = useState(0); // a new ask: Check again, or coming back to this tab

  useEffect(() => {
    let current = true;
    setLoad((was) => ({ state: "loading", lineups: was.lineups }));
    void readEnteredWeek(week.slug).then((answer) => {
      if (!current) return;
      setLoad(
        answer.state === "ok"
          ? { state: "ready", lineups: answer.lineups, at: new Date(), saved: answer.saved }
          : { state: "unavailable", lineups: [], answer },
      );
    });
    return () => {
      current = false;
    };
  }, [week.slug, asked]);

  // Lineups entered on Sorare in another tab show up when you come back here (Control does the same for the extension).
  useEffect(() => {
    const again = () => {
      if (document.visibilityState === "visible") setAsked((n) => n + 1);
    };
    document.addEventListener("visibilitychange", again);
    return () => document.removeEventListener("visibilitychange", again);
  }, []);

  const now = new Date(); // only read once the lineups are in, which happens in the browser
  const entered = load.lineups.filter((lineup) => !lineup.draft).length;
  const drafts = load.lineups.length - entered;
  const issue =
    load.state === "unavailable"
      ? load.answer.state === "outdated"
        ? {
            title: "Reload the Sofix extension",
            says: `Chrome is still running v${load.answer.version}. This lineup view needs v${REQUIRED_EXTENSION_VERSION}.`,
            act: "Set it up",
          }
        : cannot(load.answer.state)
      : null;
  const rejected = load.state === "unavailable" && load.answer.state === "rejected" ? load.answer.errors.join(" · ") : null;
  const failure = load.state === "unavailable" ? load.answer.state : null;
  const reason =
    failure === "no-tab"
      ? { title: "No Sorare tab open", says: "Open sorare.com in this Chrome, signed in, then come back: the lineups load by themselves." }
      : failure === "no-bridge"
        ? { title: "Sorare's tab isn't answering yet", says: "Reload the sorare.com tab once, then come back here." }
        : failure === "signed-out"
          ? { title: "Signed out of Sorare", says: "Sign in on sorare.com, then come back here." }
          : null;
  const checked = load.state === "ready" ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(load.at) : null;

  return (
    <section className="pl-entered" aria-labelledby="entered-lineups-title">
      <div className="pl-entered-head">
        <div>
          <p className="pl-eyebrow">{load.state === "ready" && load.saved ? "Saved from Sorare" : "On Sorare"} · GW{week.number}</p>
          <h2 id="entered-lineups-title">Your Sorare lineups</h2>
        </div>
        <span className="pl-entered-side">
          {load.state === "loading" ? (
            <span className="pl-entered-count looking">Checking Sorare…</span>
          ) : load.lineups.length ? (
            <span className="pl-entered-count">
              {entered} entered{drafts ? ` · ${drafts} draft${drafts === 1 ? "" : "s"}` : ""}
            </span>
          ) : null}
          {/* asks your open sorare.com tab again; it never opens one */}
          {load.state === "ready" ? (
            <button type="button" className="pl-entered-again" onClick={() => setAsked((n) => n + 1)}>
              Check again
            </button>
          ) : null}
        </span>
      </div>

      {load.state === "loading" ? (
        <div className="pl-entered-wait" aria-live="polite">
          Reading this gameweek from your signed-in Sorare tab.
        </div>
      ) : load.state === "unavailable" ? (
        <div className="pl-entered-empty" role="status">
          <div>
            <b>{reason?.title ?? issue?.title ?? "Sorare lineups are unavailable"}</b>
            <span>{reason?.says ?? rejected ?? issue?.says ?? "Try again after opening your signed-in Sorare tab."}</span>
          </div>
          <button type="button" className="pl-entered-again" onClick={() => setAsked((n) => n + 1)}>
            Check again
          </button>
          {!reason && issue?.act ? (
            <a
              href={issue.act === "Set it up" ? "/control" : "https://sorare.com/football/my-lineups"}
              target={issue.act === "Set it up" ? undefined : "_blank"}
              rel={issue.act === "Set it up" ? undefined : "noreferrer"}
            >
              {issue.act}
            </a>
          ) : null}
        </div>
      ) : load.lineups.length ? (
        <div className="pl-entered-list">
          {load.lineups.map((lineup) => {
            const pending = pendingLine(lineup, week.lock, now);
            return (
            <article className="pl-entered-lineup" key={lineup.id}>
              <div className="pl-entered-name">
                <Foil rarity={lineup.cards[0]?.rarity ?? "limited"} className="sm" />
                <span>
                  <b>{lineup.competition}</b>
                  <small>{lineup.name ?? "Untitled lineup"}</small>
                </span>
              </div>
              <div className="pl-entered-cards" aria-label={`${lineup.cards.length} cards`}>
                {lineup.cards.map((card) => (
                  <CardZoom className="pl-entered-card" key={card.slug} aria-label={card.name}>
                    <SorareImage src={card.picture ?? undefined} alt={card.name} fill />
                    {!card.picture ? card.name.slice(0, 1).toUpperCase() : null}
                    {card.captain ? <i className="cap" title="Captain">C</i> : null}
                    {lineup.result && card.score !== null && !pending ? <b className="sc">{Math.round(card.score)}</b> : null}
                  </CardZoom>
                ))}
              </div>
              {lineup.result && !lineup.draft ? (
                <span className="pl-entered-result">
                  <b>{pending ? "–" : Math.round(lineup.result.score)}</b>
                  <small>{pending ?? resultLine(lineup.result)}</small>
                </span>
              ) : (
                <span className={`pl-entered-status${lineup.draft ? " draft" : ""}`}>
                  {lineup.draft ? "Draft" : "Entered"} · {lineup.cards.length} cards
                </span>
              )}
            </article>
            );
          })}
        </div>
      ) : (
        <div className="pl-entered-empty">
          <div>
            <b>{load.state === "ready" && load.saved ? "No entered lineups" : "None entered yet"} for GW{week.number}</b>
            <span>{load.state === "ready" && load.saved ? "Saved final Sorare read: no entered lineups. Drafts are not saved." : `Checked on Sorare at ${checked}: you have no lineup or draft in this gameweek.`}</span>
          </div>
        </div>
      )}
    </section>
  );
}
