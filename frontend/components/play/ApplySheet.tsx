"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { appearances, broken, cannot, runStep, type Answer, type Entered, type Verdict } from "../../lib/apply";
import { chanceLabel, essenceLabel, type GameweekPlan, type Lineup } from "../../lib/play";
import { Foil } from "./bits";
import SorareImage from "./SorareImage";

const STEPS = ["Check", "Draft", "Enter"] as const;
type Stage = 0 | 1 | 2 | 3; // 3 = entered

const lockTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));

/**
 * Apply: entering one of the plan's lineups on sorare.com, one step at a time.
 *
 * Sofix syncs with a read-only key, so this goes through your own session in Chrome (`lib/apply.ts`). Nothing
 * here runs by itself: **check** asks Sorare's verdict and writes nothing, **draft** saves a lineup that is not
 * entered and can still be deleted, and **enter** is the one step that spends a lineup slot. Sorare's own words
 * are shown as they come back — a disagreement with our rules is a bug in Sofix, not something to hide.
 * Design: docs/sorare/design/S6-apply.html.
 */
export default function ApplySheet({
  lineups,
  week,
  rank,
  now,
}: {
  lineups: Lineup[];
  week: GameweekPlan;
  rank: number;
  now: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0); // which lineup of the plan
  const [stage, setStage] = useState<Stage>(0);
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [problem, setProblem] = useState<Exclude<Answer, Verdict> | null>(null);
  const [held, setHeld] = useState<Entered[]>([]);
  const [cap, setCap] = useState(0);
  const [draftId, setDraftId] = useState<string | null>(null);
  const id = useId();

  const lineup = lineups[at];
  const locked = week.played || new Date(week.gameweek.lock).getTime() <= new Date(now).getTime();

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const outside = (event: MouseEvent) => {
      if (event.target === node) setOpen(false);
    };
    node.addEventListener("click", outside);
    return () => node.removeEventListener("click", outside);
  }, []);

  const take = useCallback((answer: Answer) => {
    if (answer.state === "ok") {
      setProblem(null);
      setVerdict(answer);
      return answer;
    }
    setProblem(answer);
    return null;
  }, []);

  // What Sorare already holds for this competition: read-only, and the only thing that runs without a press.
  const readEntered = useCallback(
    async (target: Lineup) => {
      setBusy(true);
      const answer = await runStep("entered", { slug: target.board });
      const ok = take(answer);
      if (ok) {
        setHeld(ok.entered);
        setCap(ok.cap);
      }
      setBusy(false);
    },
    [take],
  );

  // A plan published before Apply existed carries no leaderboard: there is nothing to enter it with until the
  // job runs again (PAYLOAD_VERSION 4).
  const stale = Boolean(lineup) && (!lineup?.board || !lineup?.boardId);

  useEffect(() => {
    if (!open || !lineup || stale) return;
    setStage(0);
    setVerdict(null);
    setProblem(null);
    setDraftId(null);
    void readEntered(lineup);
  }, [open, lineup, stale, readEntered]);

  if (!lineups.length || !lineup) return null;

  const press = async () => {
    setBusy(true);
    if (stage === 0) {
      const ok = take(await runStep("check", { slug: lineup.board, appearances: appearances(lineup) }));
      if (ok) setStage(1);
    } else if (stage === 1) {
      const ok = take(
        await runStep("draft", {
          boardId: lineup.boardId,
          appearances: appearances(lineup),
          name: `Sofix · plan ${rank}`,
        }),
      );
      if (ok?.lineupId) {
        setDraftId(ok.lineupId);
        setStage(2);
      } else if (ok) {
        setProblem({ state: "error" }); // saved but unnamed: without an id the next step has nothing to enter
      }
    } else if (stage === 2 && draftId) {
      const ok = take(await runStep("enter", { lineupIds: [draftId] }));
      if (ok) setStage(3);
    }
    setBusy(false);
  };

  const cards = [
    ...lineup.starters.map((card) => ({ card, sub: false })),
    ...lineup.subs.map((card) => ({ card, sub: true })),
  ];
  const bad = verdict ? broken(verdict.rules) : [];
  const stuck = stale
    ? { title: "This plan came before Apply", says: "The next refresh gives it what entering takes.", act: null }
    : problem
      ? problem.state === "rejected"
        ? null
        : cannot(problem.state)
      : null;
  const left = cap ? cap - held.filter((entry) => !entry.draft).length : null;
  const tone = stage === 1 ? "amber" : stage === 3 ? "good" : bad.length || problem ? "red" : "good";

  const caption =
    stage === 0 ? (
      <>
        {lineup.need ? (
          <>
            <b>{lineup.need}</b> needed to pay ·{" "}
          </>
        ) : null}
        {chanceLabel(lineup.pReturn)} chance of a reward
      </>
    ) : stage === 1 ? (
      <>
        saved as a draft · <b>not entered</b>
      </>
    ) : stage === 2 ? (
      <>
        ready to enter · <b>nothing spent yet</b>
      </>
    ) : (
      <>
        entered · locks <b>{lockTime(week.gameweek.lock)}</b>
      </>
    );

  const action =
    stage === 0
      ? { note: "Sorare checks it. Nothing is saved.", label: "Check with Sorare" }
      : stage === 1
        ? { note: "A draft can be changed or deleted on sorare.com.", label: "Save as a draft" }
        : { note: "Entering spends one of your lineup slots here, and can't be undone after the lock.", label: "Enter the competition" };

  return (
    <>
      <button
        ref={opener}
        type="button"
        className="pl-btn"
        aria-haspopup="dialog"
        aria-controls={id}
        disabled={locked}
        title={locked ? "This gameweek has locked" : undefined}
        onClick={() => setOpen(true)}
      >
        Apply plan
      </button>

      <dialog
        id={id}
        ref={dialog}
        className="pl-scrim"
        aria-label={`Apply ${lineup.comp}`}
        onClose={() => {
          setOpen(false);
          opener.current?.focus();
        }}
      >
        <div className={`ap ${tone}`}>
          <div className="ap-head">
            <Foil rarity={lineup.rarity} />
            <b>{lineup.comp}</b>
            <span className="ap-what">
              {lineup.size} + {lineup.subSlots} subs · GW{week.gameweek.number}
              {lineups.length > 1 ? ` · lineup ${at + 1} of ${lineups.length}` : ""}
            </span>
            <button type="button" className="pl-x" aria-label="Close" onClick={() => setOpen(false)}>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                <path d="m3 3 8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <nav className="ap-rail" aria-label="Step">
            {STEPS.map((step, index) => (
              <div key={step} className="ap-step">
                <span className={index < stage ? "done" : index === stage ? "on" : ""}>
                  <i>{index < stage ? "✓" : index + 1}</i>
                  <span>{step}</span>
                </span>
                {index < 2 ? (
                  <span className="ap-bar">
                    <i style={{ width: index < stage ? "100%" : "0" }} />
                  </span>
                ) : null}
              </div>
            ))}
          </nav>

          <div className="ap-lead">
            <div>
              <p className="ap-num">
                <b>{lineup.x}</b>
                <i>xScore</i>
              </p>
              <p className="ap-cap">{caption}</p>
            </div>
            <div className="ap-chips">
              <span className="chip">{lineup.fee ? `${essenceLabel(lineup.fee)} to enter` : "Free to enter"}</span>
              <span className="chip">{cards.length} of your cards</span>
              {left !== null ? <span className="chip">{left} of {cap} slots left</span> : null}
              {held.some((entry) => entry.draft) ? <span className="chip tone">Draft on sorare.com</span> : null}
            </div>
          </div>

          <div className="ap-cards">
            {cards.map(({ card, sub }, index) => (
              <div key={card.slug} className={`ap-pc${sub ? " sub" : ""}`} style={{ "--i": index } as React.CSSProperties}>
                <span className="art">
                  <SorareImage src={card.pic} alt="" fill />
                  <span className="rib">{card.x}</span>
                  {card.captain ? <span className="cap-mark">C</span> : null}
                </span>
                <span className="who">
                  <b>{card.name}</b>
                  <span>
                    {sub ? "SUB · " : ""}
                    {Math.round(card.p * 100)}% · ×{card.mult.toFixed(2)}
                  </span>
                </span>
              </div>
            ))}
          </div>

          <div className="ap-verdict">
            <div className="vt">
              <s>{problem ? "!" : verdict && !bad.length ? "✓" : "·"}</s>
              {stale
                ? stuck!.title
                : problem
                  ? problem.state === "rejected"
                    ? "Sorare says no"
                    : (stuck?.title ?? "That didn't go through")
                  : stage === 0
                  ? "Sorare hasn't checked it yet"
                  : bad.length
                    ? "Sorare found a problem"
                    : stage === 3
                      ? "Sorare has it"
                      : "Sorare checked it"}
              {verdict?.multiplier ? <em>reward ×{verdict.multiplier.toFixed(2)}</em> : null}
            </div>

            {problem?.state === "rejected" ? (
              <ul className="ap-says">
                {problem.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            ) : stuck ? (
              <p className="ap-says-one">
                {stuck.says}
                {stuck.act ? (
                  <a
                    className="ap-link"
                    href={stuck.act === "Set it up" ? "/control" : "https://sorare.com"}
                    target={stuck.act === "Set it up" ? undefined : "_blank"}
                    rel="noreferrer"
                  >
                    {stuck.act} →
                  </a>
                ) : null}
              </p>
            ) : verdict?.rules.length ? (
              <div className="ap-rules">
                {verdict.rules.map((rule) => (
                  <span key={rule.ruleName} className={`rule${rule.state === "INVALID" ? " bad" : ""}`}>
                    <s>{rule.state === "INVALID" ? "✕" : "✓"}</s>
                    {rule.message ?? rule.ruleName}
                  </span>
                ))}
              </div>
            ) : (
              <p className="ap-says-one">
                {held.length
                  ? `${held.length} lineup${held.length === 1 ? "" : "s"} of yours already here.`
                  : "Nothing of yours is entered here yet."}
              </p>
            )}
          </div>

          <div className="ap-foot">
            {stage === 3 ? (
              <>
                <span className="note">Sofix shows what it scores once the games are on.</span>
                {at + 1 < lineups.length ? (
                  <button type="button" className="ap-go" onClick={() => setAt(at + 1)}>
                    Next lineup →
                  </button>
                ) : (
                  <a className="ap-link" href="https://sorare.com/football/my-lineups" target="_blank" rel="noreferrer">
                    See it on sorare.com →
                  </a>
                )}
              </>
            ) : (
              <>
                <span className="note">{stuck ? "Nothing has been saved." : action.note}</span>
                {stale ? null : stuck ? (
                  // Opening sorare.com or setting the extension up happens in another tab: one press looks again.
                  <button type="button" className="ap-go" onClick={() => void readEntered(lineup)} disabled={busy}>
                    {busy ? "Looking…" : "Try again"}
                  </button>
                ) : (
                  <button type="button" className="ap-go" onClick={press} disabled={busy}>
                    {busy ? "Asking Sorare…" : action.label}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
