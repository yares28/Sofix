"use client";

import { useEffect, useState } from "react";
import { cannot } from "../../lib/apply";
import { percent, wonShare, type Rewards } from "../../lib/audit";
import { runWeekLineups, weekWon, type WeekLineupsAnswer, type WeekWon } from "../../lib/entered";
import { cashLabel, essenceLabel } from "../../lib/play";

type Week = { slug: string; number: number };
type Failure = Exclude<WeekLineupsAnswer, { state: "ok" }>;
type Reading = { state: "reading" } | { state: "done" } | { state: "stopped"; answer: Failure };

const CACHE = "sofix:won:v1:";
/** Answers that mean the extension or the Sorare tab is missing: no other week will do better, so reading stops. */
const BLOCKING = new Set(["no-extension", "no-tab", "no-bridge", "signed-out", "outdated"]);

function remembered(slug: string): WeekWon | null {
  try {
    const raw = window.localStorage.getItem(CACHE + slug);
    const value = raw ? (JSON.parse(raw) as WeekWon) : null;
    return value && value.final && typeof value.essence === "number" ? value : null;
  } catch {
    return null;
  }
}

function remember(slug: string, won: WeekWon): void {
  if (!won.final) return; // a week still being ranked can change
  try {
    window.localStorage.setItem(CACHE + slug, JSON.stringify(won));
  } catch {
    /* private window or storage full: it is read again next time */
  }
}

/**
 * Audit · Rewards. A reward is all or nothing, so Play never shows chance x reward; over a season it is the yardstick. Sofix's plans: what
 * they expected and what their lineups really won, from the weeks the job kept. You: what your own entered lineups won, read from Sorare
 * through the extension, a week at a time (a finished week is remembered in this browser, since it never changes).
 */
export default function RewardsAudit({ rewards, floor, season }: { rewards: Rewards; floor: number; season: Week[] }) {
  const [won, setWon] = useState<Record<string, WeekWon>>({});
  const [reading, setReading] = useState<Reading>({ state: season.length ? "reading" : "done" });

  useEffect(() => {
    let current = true;
    void (async () => {
      for (const week of season) {
        const known = remembered(week.slug);
        if (known) {
          if (current) setWon((all) => ({ ...all, [week.slug]: known }));
          continue;
        }
        const answer = await runWeekLineups(week.slug);
        if (!current) return;
        if (answer.state === "ok") {
          const result = weekWon(answer.lineups);
          remember(week.slug, result);
          setWon((all) => ({ ...all, [week.slug]: result }));
        } else if (BLOCKING.has(answer.state)) {
          setReading({ state: "stopped", answer });
          return;
        }
      }
      if (current) setReading({ state: "done" });
    })();
    return () => {
      current = false;
    };
  }, [season]);

  const enough = rewards.lineups >= floor;
  const planShare = wonShare(rewards.won.essence, rewards.expected.essence);
  const read = season.filter((week) => won[week.slug]);
  const yours = read.reduce((sum, week) => sum + (won[week.slug]?.essence ?? 0), 0);
  const yourCash = read.reduce((sum, week) => sum + (won[week.slug]?.cash ?? 0), 0);
  const kept = rewards.weeks.filter((week) => week.slug && won[week.slug]);
  const keptExpected = kept.reduce((sum, week) => sum + week.expected.essence, 0);
  const keptYours = kept.reduce((sum, week) => sum + (won[week.slug as string]?.essence ?? 0), 0);
  const yourShare = wonShare(keptYours, keptExpected);
  const issue = reading.state === "stopped" ? (reading.answer.state === "outdated" ? { title: "Reload the Sofix extension", says: "Chrome is running an older version." } : cannot(reading.answer.state)) : null;

  return (
    <>
      <section className="au-w au-hero" aria-label="Sofix's plans">
        <div className="au-hero-main">
          <p className="au-label">Sofix&apos;s plans</p>
          {enough && planShare !== null ? (
            <>
              <p className="au-big figure">
                {Math.round(planShare * 100)}
                <span>%</span>
              </p>
              <h2>of the essence they expected was won</h2>
            </>
          ) : (
            <>
              <h2 className="au-none">Too few to tell yet</h2>
              <p className="au-sub">
                <b>
                  {rewards.lineups} of {floor}
                </b>{" "}
                lineups needed before the share means more than luck.
              </p>
            </>
          )}
        </div>
        <div>
          <dl className="au-src-more au-rw-totals">
            <div>
              <dt>Expected essence</dt>
              <dd>{essenceLabel(rewards.expected.essence)}</dd>
            </div>
            <div>
              <dt>Won by the plans</dt>
              <dd>{essenceLabel(rewards.won.essence)}</dd>
            </div>
            <div>
              <dt>Expected cash</dt>
              <dd>{cashLabel(rewards.expected.cash)}</dd>
            </div>
            <div>
              <dt>Cash won by the plans</dt>
              <dd>{cashLabel(rewards.won.cash)}</dd>
            </div>
            <div>
              <dt>Weeks · lineups</dt>
              <dd>
                {rewards.weeks.length} · {rewards.lineups}
              </dd>
            </div>
          </dl>
          <p className="au-sub">Expected is each lineup&apos;s chance of each reward times that reward, added up week by week.</p>
        </div>
      </section>

      <section className="au-w au-rw-you" aria-label="You">
        <p className="au-label">You</p>
        <p className="au-rw-big figure">
          {read.length ? essenceLabel(yours) : "–"}
          <span> essence</span>
          {yourCash >= 0.01 ? <span> · {cashLabel(yourCash)}</span> : null}
        </p>
        <p className="au-sub" hidden={!read.length}>
          won with your own lineups over <b>{read.length}</b> finished week{read.length === 1 ? "" : "s"}
          {kept.length ? (
            <>
              {" "}
              · in the {kept.length} week{kept.length === 1 ? "" : "s"} Sofix kept: <b>{essenceLabel(keptYours)}</b>
              {enough && yourShare !== null ? (
                <>
                  , <b>{percent(yourShare)}</b> of what its plans expected
                </>
              ) : (
                <> against {essenceLabel(keptExpected)} expected</>
              )}
            </>
          ) : null}
        </p>
        <p className="au-fresh" role="status">
          {reading.state === "reading"
            ? `Reading your lineups from Sorare · ${read.length} of ${season.length} weeks`
            : issue
              ? `${issue.title}. ${issue.says}`
              : read.length < season.length
                ? `${season.length - read.length} week${season.length - read.length === 1 ? "" : "s"} Sorare did not answer for`
                : null}
        </p>
      </section>

      {rewards.weeks.length ? (
        <section className="au-w" aria-label="Week by week">
          <div className="au-record">
            <table>
              <caption className="visually-hidden">Essence expected by Sofix&apos;s plan, won by it, and won by you, each finished week</caption>
              <thead>
                <tr>
                  <th scope="col">Week</th>
                  <th scope="col">Expected</th>
                  <th scope="col">Plan won</th>
                  <th scope="col">You won</th>
                </tr>
              </thead>
              <tbody>
                {[...rewards.weeks].reverse().map((week) => {
                  const mine = week.slug ? won[week.slug] : undefined;
                  return (
                    <tr key={week.gameweek}>
                      <th scope="row">GW{week.gameweek}</th>
                      <td>{essenceLabel(week.expected.essence)}</td>
                      <td>{essenceLabel(week.won.essence)}</td>
                      <td>{mine ? essenceLabel(mine.essence) : "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}
