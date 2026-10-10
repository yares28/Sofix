"use client";

import { useEffect, useState } from "react";
import { cannot } from "../../lib/apply";
import { percent, wonShare, type Rewards } from "../../lib/audit";
import { type WeekLineupsAnswer, type WeekWon } from "../../lib/entered";
import { archiveFinishedWeeks, remembered, wonWeeks } from "../../lib/myWeeksClient";
import { seasonWeeks, type SavedWeek } from "../../lib/myWeeks";
import type { FrozenWeek } from "../../lib/audit";
import { cashLabel, essenceLabel } from "../../lib/play";

type Week = { slug: string; number: number };
type Failure = Exclude<WeekLineupsAnswer, { state: "ok" }>;
type Reading = { state: "reading" } | { state: "done" } | { state: "stopped"; answer: Failure };

/**
 * Audit · Rewards. A reward is all or nothing, so Play never shows chance x reward; over a season it is the yardstick. Sofix's plans: what
 * they expected and what their lineups really won, from the weeks the job kept. You: what your own entered lineups won, read from Sorare
 * through the extension, a week at a time. Final weeks are saved on the server; old browser readings remain a fallback.
 */
export default function RewardsAudit({ rewards, floor, season, saved = [], frozen = [] }: { rewards: Rewards; floor: number; season: Week[]; saved?: SavedWeek[]; frozen?: FrozenWeek[] }) {
  const [weeks, setWeeks] = useState(saved);
  const [won, setWon] = useState<Record<string, WeekWon>>(() => wonWeeks(saved));
  const [unavailable, setUnavailable] = useState(false);
  const [reading, setReading] = useState<Reading>({ state: season.length ? "reading" : "done" });

  useEffect(() => {
    let current = true;
    void (async () => {
      const fallback = Object.fromEntries(season.flatMap((week) => { const known = remembered(week.slug); return known ? [[week.slug, known]] : []; }));
      if (current) setWon((all) => ({ ...fallback, ...all }));
      const result = await archiveFinishedWeeks();
      if (!current) return;
      setUnavailable(result.unavailable === true);
      if (!result.unavailable) {
        const kept = seasonWeeks(result.weeks, new Date());
        setWeeks(kept);
        setWon((all) => ({ ...all, ...wonWeeks(kept) }));
      }
      setReading(result.issue ? { state: "stopped", answer: result.issue } : { state: "done" });
    })();
    return () => {
      current = false;
    };
  }, [season]);

  const enough = rewards.lineups >= floor;
  const planShare = wonShare(rewards.won.essence, rewards.expected.essence);
  const listed = [...new Map([...season, ...weeks].map((week) => [week.slug, week])).values()];
  const read = listed.filter((week) => won[week.slug]);
  const yours = read.reduce((sum, week) => sum + (won[week.slug]?.essence ?? 0), 0);
  const yourCash = read.reduce((sum, week) => sum + (won[week.slug]?.cash ?? 0), 0);
  const kept = rewards.weeks.filter((week) => week.slug && won[week.slug]);
  const keptExpected = kept.reduce((sum, week) => sum + week.expected.essence, 0);
  const keptYours = kept.reduce((sum, week) => sum + (won[week.slug as string]?.essence ?? 0), 0);
  const yourShare = wonShare(keptYours, keptExpected);
  const savedCount = weeks.reduce((total, week) => total + week.lineups.filter(line => !line.draft).length, 0);
  const playedWeeks = weeks.filter(week => week.lineups.some(line => !line.draft)).length;
  const comparisons = frozen.filter(week => week.plans.some(plan => plan.lineups.length));
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
            : unavailable ? "Week storage is temporarily unavailable. Saved weeks and this browser's last readings are kept."
            : issue
              ? `${issue.title}. ${issue.says}`
              : read.length < season.length
                ? `${season.length - read.length} finished week${season.length - read.length === 1 ? "" : "s"} not saved. Open Home in Chrome with your signed-in Sorare tab.`
                : null}
        </p>
      </section>

      <section className="au-w" aria-label="Your lineups against the plan at lock">
        <h2>Your lineups against the plan at lock</h2>
        <p className="au-sub">{savedCount} entered lineup{savedCount === 1 ? "" : "s"} saved across {playedWeeks} GW{playedWeeks === 1 ? "" : "s"}. Plans are scored with their saved rules; rewards need the same GW&apos;s final cut-offs.</p>
        {comparisons.length ? comparisons.map((week) => <details key={week.slug} open>
          <summary>GW{week.number} · plan kept before lock</summary>
          {week.plans.map((plan) => <div className="au-record" key={plan.rank}><table>
            <caption>GW{week.number} · Plan {plan.rank}</caption>
            <thead><tr><th scope="col">Competition</th><th scope="col">Expected</th><th scope="col">Plan scored</th><th scope="col">You scored</th></tr></thead>
            <tbody>{plan.lineups.map((line, i) => {
              const entries = line.board ? weeks.find((saved) => saved.slug === week.slug)?.lineups.filter((lineup) => !lineup.draft && lineup.board === line.board) ?? [] : [];
              const yours = entries.flatMap(lineup => lineup.result ? [lineup.result.score.toFixed(1)] : []);
              const saved = weeks.some(saved => saved.slug === week.slug);
              return <tr key={`${line.board}:${i}`}><th scope="row">{line.competition}</th><td>{line.expected?.toFixed(1) ?? "-"}</td><td>{line.reason === "incomplete-plan" ? "Rules not saved" : line.score === null ? "Pending results" : line.score.toFixed(1)}</td><td>{yours.length ? yours.join(" / ") : entries.length ? "Pending results" : saved ? "No entry" : "Not saved"}</td></tr>;
            })}</tbody>
          </table></div>)}
        </details>) : <p className="au-sub">No finished plan at lock has been scored yet.</p>}
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
