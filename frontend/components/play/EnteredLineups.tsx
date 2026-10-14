"use client";

import CardZoom from "../ui/CardZoom";
import { useEffect, useRef, useState } from "react";
import { cannot } from "../../lib/apply";
import { pendingLine, resultLine, type GameweekLineup, type WeekLineupsAnswer } from "../../lib/entered";
import { readEnteredWeek, type EnteredRead } from "../../lib/myWeeksClient";
import { REQUIRED_EXTENSION_VERSION } from "../../lib/extension";
import SorareImage from "./SorareImage";
import { chanceLabel, type GameweekPlan } from "../../lib/play";
import { enteredScore } from "../../lib/lineupScores";
import { ComparisonCards, ComparisonScores } from "../recap/LineupComparison";
import { scoreColour } from "../../lib/cards";

type Week = { slug: string; number: number; lock?: string; end?: string };
type Failure = Exclude<WeekLineupsAnswer, { state: "ok" }>;
type LoadState =
  | { state: "loading"; lineups: GameweekLineup[] }
  | { state: "ready"; lineups: GameweekLineup[]; at: Date; saved?: boolean; archived?: boolean; saving?: boolean; refreshing?: boolean; refreshIssue?: Failure }
  | { state: "unavailable"; lineups: GameweekLineup[]; answer: Failure };

/** Lineups the signed-in manager actually put on Sorare, read from this exact Sorare gameweek. */
export default function EnteredLineups({ week, forecast = null, variant = "play" }: { week: Week; forecast?: GameweekPlan | null; variant?: "play" | "recap" }) {
  const [load, setLoad] = useState<LoadState>({ state: "loading", lineups: [] });
  const [asked, setAsked] = useState(0); // a new ask: Check again, or coming back to this tab
  const last = useRef<{ slug: string; lineups: GameweekLineup[] } | null>(null);

  useEffect(() => {
    let current = true;
    const previous = last.current?.slug === week.slug ? last.current.lineups : [];
    setLoad({ state: "loading", lineups: previous });
    const receive = (answer: EnteredRead) => {
      if (!current) return;
      if (answer.state === "ok") last.current = { slug: week.slug, lineups: answer.lineups };
      setLoad(
        answer.state === "ok"
          ? { state: "ready", lineups: answer.lineups, at: answer.savedAt ? new Date(answer.savedAt) : new Date(), saved: answer.saved, archived: answer.archived, saving: answer.saving, refreshing: answer.refreshing, refreshIssue: answer.refreshIssue }
          : { state: "unavailable", lineups: previous, answer },
      );
    };
    void readEnteredWeek(week.slug, Boolean(week.end && Date.parse(week.end) < Date.now()), receive).then(receive);
    return () => {
      current = false;
    };
  }, [week.slug, week.end, asked]);

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
    <section className={variant === "recap" ? "rc-entered" : "pl-entered"} aria-labelledby="entered-lineups-title">
      <div className="pl-entered-head">
        <div>
          <p className="pl-eyebrow">{load.state === "ready" && load.saved ? "Saved from Sorare" : "On Sorare"} · GW{week.number}</p>
          {variant === "recap" ? <h3 id="entered-lineups-title">Your Sorare lineups</h3> : <h2 id="entered-lineups-title">Your Sorare lineups</h2>}
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

      {load.state === "ready" ? <p className="pl-entered-storage" role="status">{load.saving ? "Saving your latest lineups…" : load.saved ? load.archived ? "Final lineups saved in Sofix." : "Latest lineups saved in Sofix." : "Saved on this device; Sofix storage is unavailable."}{load.refreshing ? " Checking Sorare in the background…" : load.refreshIssue ? " Sorare is unavailable; showing your last saved read." : ""}</p> : null}

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
      ) : null}
      {load.lineups.length ? (
        <div className="pl-entered-list">
          {variant === "play" ? (
            <div className="pl-cols" aria-hidden="true">
              <span>Competition</span>
              <span>Cards, score or xScore under each</span>
              <span>Team score</span>
              <span>Result</span>
            </div>
          ) : null}
          {load.lineups.map((lineup) => {
            const pending = pendingLine(lineup, week.lock, now);
            const expected = enteredScore(lineup, forecast, week.slug);
            const options = forecast?.gameweek.slug === week.slug ? forecast.plans.flatMap(p => p.lineups) : [];
            const known = new Map(options.flatMap(l => [...l.starters, ...l.subs]).map(c => [c.slug, c]));
            const players = new Map(forecast?.gameweek.slug === week.slug ? forecast.playing.players.map(p => [p.player, p]) : []);
            const size = lineup.scoring?.slots.filter(s => !s.sub).length ?? options.find(l => l.board === lineup.board)?.starters.length;
            const cards = [...lineup.cards].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
              .map((c, i) => ({ ...c, x: known.get(c.slug)?.x ?? (c.player ? players.get(c.player)?.x : null) ?? null, bench: size !== undefined && i >= size }));
            if (variant === "recap") {
              return <article className="rc-lu pl-entered-lineup" key={lineup.id}>
                <div className="rc-lu-c"><b>{lineup.competition}</b><span>{lineup.name ?? "Untitled lineup"}</span><span>{lineup.draft ? "Draft" : "Entered"} · {cards.length} cards</span></div>
                <ComparisonCards cards={cards} />
                <div className="rc-score">
                  <ComparisonScores expected={expected.value} estimated={expected.estimated} actual={pending || lineup.draft ? null : lineup.result?.score ?? null} actualLabel={lineup.result?.rank === null ? "Actual so far" : "Actual"} entered />
                  {expected.value === null ? <span>{forecast ? "Forecast unavailable" : "Not recorded"}</span> : null}
                </div>
                <div className="rc-rew">
                  {/* the same one chance as a plan lineup, until the week is over and the result says it */}
                  {expected.chance !== undefined && (!week.end || Date.parse(week.end) > now.getTime()) ? (
                    <div className="rc-any" title={`The chance of any cash, essence or card${expected.estimated ? ", estimated from this GW's forecasts" : ""}`}>
                      <b>{chanceLabel(expected.chance)}</b>
                      <span>Reward</span>
                    </div>
                  ) : null}
                  <span>{lineup.draft ? "Draft" : pending ?? (lineup.result ? resultLine(lineup.result) : "Entered")}</span>
                </div>
              </article>;
            }
            // The same row as a lineup of the Sofix plan: competition, cards with a number under each, team score, result.
            const result = lineup.draft || pending ? null : lineup.result;
            // While the games are on, a card that has no points yet keeps its xScore, and nothing is called won or lost.
            const live = !week.end || Date.parse(week.end) > now.getTime();
            const won = result ? result.cash > 0 || result.essence > 0 || result.card : false;
            const xLabel = `xScore${expected.estimated ? " estimate" : ""}`;
            const xTitle = expected.estimated ? "Estimated from this GW's forecasts, card bonuses, captain and substitutions, with independent playing chances." : "The recorded Sofix forecast for this lineup and GW.";
            const mini = (card: (typeof cards)[number]) => {
              const scored = Boolean(result) && (Boolean(card.score) || !live);
              const value = scored ? card.score : card.x;
              return (
                <span className={`pl-mc pl-entered-card${card.bench ? " sub" : ""}${card.captain ? " captain" : ""}`} key={card.slug}>
                  <CardZoom className="art" aria-label={card.name}>
                    <SorareImage src={card.picture ?? undefined} alt={card.name} fill />
                    {!card.picture ? card.name.slice(0, 1).toUpperCase() : null}
                  </CardZoom>
                  {card.captain ? <i className="c" title="Captain">C</i> : null}
                  {value === null ? null : (
                    <span className={`hx${scored ? " scored" : ""}`} style={{ background: scoreColour(value).fill, color: scoreColour(value).ink }}>{Math.round(value)}</span>
                  )}
                  <span className="nm">{card.name}</span>
                </span>
              );
            };
            return (
            <article className="pl-entered-lineup" key={lineup.id}>
              <div className="pl-lu-c">
                <span className="nm">{lineup.competition}</span>
                <span className="pl-fmt">{lineup.name ?? "Untitled lineup"}</span>
                <span className="pl-lu-tags">
                  <span className={`pl-entered-status${lineup.draft ? " draft" : ""}`}>{lineup.draft ? "Draft" : "Entered"}</span>
                  <span className="pl-fmt">{cards.length} cards</span>
                </span>
              </div>
              <div className="pl-cards" aria-label={`${cards.length} cards`}>
                {cards.filter((card) => !card.bench).map(mini)}
                {cards.some((card) => card.bench) ? (
                  <>
                    <span className="div" />
                    <span className="sl">Subs</span>
                    {cards.filter((card) => card.bench).map(mini)}
                  </>
                ) : null}
              </div>
              <div className="pl-lu-score" role="group" aria-label="Lineup scores">
                {result ? (
                  <>
                    <span className="pl-kv pl-entered-result">
                      <b>{Math.round(result.score)}</b>
                      <span>{result.rank === null ? "scored so far" : "scored"}</span>
                    </span>
                    <span className="need pl-entered-expected" title={xTitle}>
                      {xLabel} <b>{expected.value === null ? "–" : Math.round(expected.value)}</b>
                    </span>
                  </>
                ) : (
                  <span className="pl-kv pl-entered-expected" title={xTitle}>
                    <b>{expected.value === null ? "–" : Math.round(expected.value)}</b>
                    <span>{expected.value === null ? (forecast ? "Forecast unavailable" : "Not recorded") : xLabel}</span>
                  </span>
                )}
              </div>
              <div className="pl-lu-rew">
                {result && result.rank !== null && !live ? (
                  <span className={`pl-dial ${won ? "won" : "low"}`} style={{ ["--p" as string]: won ? "100%" : "0%" }} aria-hidden="true">
                    <span className="pl-kv"><b>{won ? "✓" : "–"}</b></span>
                  </span>
                ) : null}
                <span className="pl-lu-foot">
                  {lineup.draft ? <span className="pl-note">Not entered on Sorare yet</span> : <span className="pl-note pl-entered-verdict">{pending ?? (lineup.result ? resultLine(lineup.result) : "Entered")}</span>}
                </span>
              </div>
            </article>
            );
          })}
        </div>
      ) : load.state === "ready" ? (
        <div className="pl-entered-empty">
          <div>
            <b>{load.state === "ready" && load.saved ? "No entered lineups" : "None entered yet"} for GW{week.number}</b>
            <span>{load.state === "ready" && load.saved ? load.archived ? "Saved final Sorare read: no entered lineups. Drafts are not saved." : "Last saved Sorare read: no lineup or draft in this gameweek." : `Checked on Sorare at ${checked}: you have no lineup or draft in this gameweek.`}</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
