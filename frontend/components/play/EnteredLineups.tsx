"use client";

import { useEffect, useState } from "react";
import { cannot } from "../../lib/apply";
import { runWeekLineups, type GameweekLineup, type WeekLineupsAnswer } from "../../lib/entered";
import { REQUIRED_EXTENSION_VERSION } from "../../lib/extension";
import { Foil } from "./bits";
import SorareImage from "./SorareImage";

type Week = { slug: string; number: number };
type Failure = Exclude<WeekLineupsAnswer, { state: "ok" }>;
type LoadState =
  | { state: "loading"; lineups: GameweekLineup[] }
  | { state: "ready"; lineups: GameweekLineup[] }
  | { state: "unavailable"; lineups: GameweekLineup[]; answer: Failure };

/** Lineups the signed-in manager actually put on Sorare, read from this exact Sorare gameweek. */
export default function EnteredLineups({ week }: { week: Week }) {
  const [load, setLoad] = useState<LoadState>({ state: "loading", lineups: [] });

  useEffect(() => {
    let current = true;
    setLoad({ state: "loading", lineups: [] });
    void runWeekLineups(week.slug).then((answer) => {
      if (!current) return;
      setLoad(
        answer.state === "ok"
          ? { state: "ready", lineups: answer.lineups }
          : { state: "unavailable", lineups: [], answer },
      );
    });
    return () => {
      current = false;
    };
  }, [week.slug]);

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

  return (
    <section className="pl-entered" aria-labelledby="entered-lineups-title">
      <div className="pl-entered-head">
        <div>
          <p className="pl-eyebrow">On Sorare · GW{week.number}</p>
          <h2 id="entered-lineups-title">Your Sorare lineups</h2>
        </div>
        {load.state === "loading" ? (
          <span className="pl-entered-count looking">Checking Sorare…</span>
        ) : load.lineups.length ? (
          <span className="pl-entered-count">
            {entered} entered{drafts ? ` · ${drafts} draft${drafts === 1 ? "" : "s"}` : ""}
          </span>
        ) : null}
      </div>

      {load.state === "loading" ? (
        <div className="pl-entered-wait" aria-live="polite">
          Reading this gameweek from your signed-in Sorare tab.
        </div>
      ) : load.state === "unavailable" ? (
        <div className="pl-entered-empty" role="status">
          <div>
            <b>{issue?.title ?? "Sorare lineups are unavailable"}</b>
            <span>{rejected ?? issue?.says ?? "Try again after opening your signed-in Sorare tab."}</span>
          </div>
          {issue?.act ? (
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
          {load.lineups.map((lineup) => (
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
                  <span className="pl-entered-card" key={card.slug} title={card.name}>
                    <SorareImage src={card.picture ?? undefined} alt={card.name} fill />
                    {!card.picture ? card.name.slice(0, 1).toUpperCase() : null}
                  </span>
                ))}
              </div>
              <span className={`pl-entered-status${lineup.draft ? " draft" : ""}`}>
                {lineup.draft ? "Draft" : "Entered"} · {lineup.cards.length} cards
              </span>
            </article>
          ))}
        </div>
      ) : (
        <div className="pl-entered-empty">
          <div>
            <b>No Sorare lineups entered for GW{week.number}</b>
            <span>Lineups entered in another gameweek stay with that gameweek.</span>
          </div>
          <a href="https://sorare.com/football/my-lineups" target="_blank" rel="noreferrer">
            Open Sorare
          </a>
        </div>
      )}
    </section>
  );
}
