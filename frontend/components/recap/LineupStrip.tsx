import type { CSSProperties } from "react";
import { leagueArt } from "../../lib/rewardBars";
import SeasonIcon from "../SeasonIcon";
import { Essence } from "../play/bits";

/**
 * The Recap's lineup row parts (plans/recap-matchnight.md, step 2): the competition with Sorare's own icon, the score track and
 * the reward pair. Entered lineups and the Sofix plan's share them, so both read alike.
 */

/** "Pro · LALIGA EA SPORTS", "Champion – Limited" or a plan's "LaLiga" → the league key Sorare's art is kept under, and a short label. */
export function compOf(raw: string): { league: string; label: string; pro: boolean } {
  const pro = /^Pro · /.test(raw) || / Pro$/.test(raw);
  const name = raw.replace(/^Pro · /, "").replace(/ Pro$/, "").replace(/ – .*$/, "").replace(/ \| .*$/, "").trim();
  const league = name === "LaLiga" ? "LALIGA EA SPORTS" : name;
  return { league, label: league === "LALIGA EA SPORTS" ? "LaLiga" : name, pro };
}

/** The competition: Sorare's league icon on its colour (initials while it has none), the PRO pill, and In season / Classic / the Pro step. */
export function CompTag({ comp, pro, mode }: { comp: string; pro?: boolean; mode: { kind: "in-season" | "classic" | "pro"; text: string } | null }) {
  const { league, label, pro: named } = compOf(comp);
  const art = leagueArt(`${league} | Limited`);
  return (
    <div className="rx-cp">
      <span className="rx-disc" style={{ background: art?.colour ?? "var(--ink)" } as CSSProperties} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- Sorare's league icon, hot-linked */}
        {art ? <img src={art.icon} alt="" width={22} height={22} loading="lazy" /> : label.split(/\s+/).map((w) => w[0]).join("").slice(0, 2)}
      </span>
      <span className="rx-cpt">
        <b>{label}{pro || named ? <span className="tg-pro">PRO</span> : null}</b>
        {mode ? <span className="rx-mode">{mode.kind === "pro" ? null : <SeasonIcon inSeason={mode.kind === "in-season"} />}{mode.text}</span> : null}
      </span>
    </div>
  );
}

const SCALE = 600;
const tone = (ratio: number) => (ratio >= 1 ? "#46c05a" : ratio >= 0.75 ? "#e6b91e" : ratio >= 0.5 ? "#ef8a3c" : "#c0433f");

/**
 * The lineup's score on a track: what it scored (striped while games are still to come) against its xS mark, and a Pro step's
 * target line. The numbers keep the comparison's classes (pl-entered-expected/result) the Play page and its tests read.
 */
export function ScoreTrack({ expected, actual, soFar, target = null, label = "xS", xd }: { expected: number | null; actual: number | null; soFar: boolean; target?: number | null; label?: string; xd?: number | null }) {
  const top = Math.max(SCALE, (actual ?? 0) * 1.05, (expected ?? 0) * 1.05, (target ?? 0) * 1.05);
  const at = (v: number) => `${Math.min(100, (v / top) * 100).toFixed(1)}%`;
  const ref = expected ?? target;
  const colour = actual !== null && ref ? tone(actual / ref) : "var(--ink-3)";
  const delta = actual !== null && ref ? Math.round(actual - ref) : null;
  return (
    <div className="rx-trk rc-score-pair" role="group" aria-label="Lineup scores">
      <div className="rx-rail" aria-hidden="true">
        {actual !== null ? <i className={`rx-fill${soFar ? " live" : ""}`} style={{ width: at(actual), "--c": colour } as CSSProperties} /> : null}
        {target !== null ? <span className="rx-gate" style={{ left: at(target) }}><span>needs {target}</span></span> : null}
        {expected !== null ? <span className="rx-xm" style={{ left: at(expected) }}><span>{label} {Math.round(expected)}</span></span> : null}
      </div>
      <div className="rx-act">
        <span className="pl-entered-expected visually-hidden"><span>{label}</span><b>{expected === null ? "-" : Math.round(expected)}</b></span>
        <span className="pl-entered-result"><span className="visually-hidden">{soFar ? "Actual so far" : "Actual"}</span><b>{actual === null ? "-" : Math.round(actual)}</b></span>
        {delta !== null ? <small style={{ color: delta >= 0 ? "var(--win)" : "var(--loss)" }}>{delta >= 0 ? "+" : "−"}{Math.abs(delta)} {expected !== null ? `on ${label}` : "over the target"}</small> : soFar && actual === null ? <small>Not started</small> : null}
        {xd !== undefined ? <span className="rc-xd" title={xd === null ? "No xD yet: not every starter's game is worked out" : "Expected decisive actions from the starters"}>{xd === null ? "–" : xd.toFixed(1)} xD</span> : null}
      </div>
    </div>
  );
}

/** xR, the prize Sofix expected before the lock, and what Sorare paid (or reaches so far). */
export function RewardPair({ expected, won, wonLabel = "Won" }: { expected: string; won: string | null; wonLabel?: string }) {
  // rewardShort's "500 essence · 1,000 XP": each part with its own mark instead of its word.
  const show = (text: string, muted: boolean) => (
    <dd className={text === "No prize" || text === "—" ? "none" : muted ? "x" : undefined}>
      {text.split(" · ").map((part) => (
        <span key={part}>
          {/ essence$/.test(part) ? <Essence size={15} /> : / XP$/.test(part) ? <i className="rx-xp">XP</i> : null}
          {part.replace(/ essence$/, "").replace(/ XP$/, "")}
        </span>
      ))}
    </dd>
  );
  return (
    <dl className="rx-rwd">
      <dt>xR</dt>{show(expected, true)}
      {won !== null ? <><dt>{wonLabel}</dt>{show(won, false)}</> : null}
    </dl>
  );
}
