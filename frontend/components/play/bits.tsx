import type { Group, Lineup, PlayCard } from "../../lib/play";
import SorareImage from "./SorareImage";
import { chanceLabel, formatOf, rangeScale, rewardChips } from "../../lib/play";

/** Small shared pieces of the Play page: the icons, the foil chip, the ring, the range bar and the card art. */

export const GROUP_CLASS: Record<Group, string> = { "In-season": "season", Classic: "classic", Room: "room" };
export const GROUP_COLOUR: Record<Group | "Unused", string> = {
  "In-season": "var(--g-season)",
  Classic: "var(--g-classic)",
  Room: "var(--g-room)",
  Unused: "#e2e2e7",
};

export function Essence({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <defs>
        <linearGradient id={`ess${size}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe38a" />
          <stop offset=".55" stopColor="#e8a917" />
          <stop offset="1" stopColor="#a86f00" />
        </linearGradient>
      </defs>
      <path d="M8 1 14 6 8 15 2 6Z" fill={`url(#ess${size})`} />
      <path d="M2 6h12M8 1 5.5 6 8 15l2.5-9L8 1" fill="none" stroke="rgba(255,255,255,.55)" strokeWidth=".8" />
    </svg>
  );
}

export function Cash({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="#1f7a4f" />
      <path
        d="M8 3.8v8.4M10.2 5.6c-.4-.6-1.2-.9-2.2-.9-1.3 0-2.2.6-2.2 1.5 0 2.1 4.6 1 4.6 3.3 0 .9-.9 1.6-2.3 1.6-1.1 0-2-.4-2.4-1.1"
        fill="none"
        stroke="#fff"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Chevron({ className = "hm-chev" }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="m5 2 5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Foil({ rarity, className = "" }: { rarity: string; className?: string }) {
  return <span className={`foil ${rarity === "rare" ? "rare" : "limited"} ${className}`.trim()} aria-hidden="true" />;
}

/** The one big percentage of a view, drawn as a ring. */
export function Ring({ value, label, small = false }: { value: number; label: string; small?: boolean }) {
  const circumference = 2 * Math.PI * 50;
  const tone = value >= 0.5 ? "" : value >= 0.2 ? "mid" : "low";
  return (
    <div className={`pl-ring ${tone} ${small ? "sm" : ""}`.trim()} role="img" aria-label={`${chanceLabel(value)} ${label}`}>
      <svg viewBox="0 0 116 116">
        <circle className="trk" cx="58" cy="58" r="50" fill="none" strokeWidth="10" />
        <circle
          className="bar"
          cx="58"
          cy="58"
          r="50"
          fill="none"
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value)}
        />
      </svg>
      <div className="val">
        <b>
          {Math.round(value * 100)}
          <small>%</small>
        </b>
        <span>{label}</span>
      </div>
    </div>
  );
}

/** A lineup's range: a bad week to a good week, the score that pays, and what it really scored. */
export function RangeBar({ lineup, after }: { lineup: Lineup; after: boolean }) {
  const scale = rangeScale(lineup, after);
  const actual = after ? lineup.actual : undefined;
  const need = actual?.need ?? lineup.need;
  const label = lineup.group === "Room" ? `${need} for 3rd` : `${need} needed`;
  return (
    <div
      className="pl-range"
      role="img"
      aria-label={`xScore ${lineup.x}, from ${lineup.lo} on a bad week to ${lineup.hi} on a good one${
        need ? `; ${label}` : ""
      }${actual ? `; scored ${actual.total}` : ""}`}
    >
      <span className="rail" />
      <span className="band" style={{ left: `${scale.at(lineup.lo)}%`, width: `${scale.at(lineup.hi) - scale.at(lineup.lo)}%` }} />
      {need ? (
        <span className={`need${actual?.need ? " act" : ""}`} style={{ left: `${scale.at(need)}%` }}>
          <span>{label}</span>
        </span>
      ) : null}
      <span className="dot" style={{ left: `${scale.at(lineup.x)}%` }} />
      {actual ? (
        <span className="act" style={{ left: `${scale.at(actual.total)}%` }} />
      ) : (
        <span className="ends">
          <span>{lineup.lo}</span>
          <span>{lineup.hi}</span>
        </span>
      )}
    </div>
  );
}

const ribbon = (score: number | null) =>
  score === null ? "s0" : score >= 70 ? "s9" : score >= 55 ? "s7" : score >= 40 ? "s5" : score >= 25 ? "s3" : "s1";

/** The lineup itself: every card, the captain marked, in-season dotted, substitutes after a divider. */
export function MiniCards({ lineup, after }: { lineup: Lineup; after: boolean }) {
  const cameIn = new Set((lineup.actual?.cameIn ?? []).map((swap) => swap.sub));
  const card = (entry: PlayCard, isSub: boolean) => {
    const out = after && entry.actual === null && !isSub;
    const joined = isSub && cameIn.has(entry.slug);
    return (
      <span
        key={entry.slug}
        className={`pl-mc${isSub ? " sub" : ""}${entry.captain ? " captain" : ""}${out ? " out" : ""}${joined ? " in" : ""}`}
        title={`${entry.name}${entry.captain ? " · captain" : ""}${entry.inSeason ? " · in-season" : ""}`}
      >
        <span className="art">
          <SorareImage src={entry.pic} fill />
        </span>
        {entry.captain ? <i className="c">C</i> : null}
        {entry.inSeason ? <i className="is" /> : null}
        {after && !isSub ? (
          entry.actual === null ? (
            <span className="sc dnp">DNP</span>
          ) : (
            <span className="sc" style={{ background: scoreColour(entry.actual) }}>
              {Math.round(entry.actual)}
            </span>
          )
        ) : null}
        {after && joined && entry.actual !== null ? (
          <span className="sc" style={{ background: "var(--accent, #0071e3)" }}>
            {Math.round(entry.actual)}
          </span>
        ) : null}
      </span>
    );
  };
  return (
    <div className="pl-cards" aria-hidden="true">
      {lineup.starters.map((entry) => card(entry, false))}
      {lineup.subs.length ? (
        <>
          <span className="div" />
          <span className="sl">Subs</span>
          {lineup.subs.map((entry) => card(entry, true))}
        </>
      ) : null}
    </div>
  );
}

function scoreColour(score: number): string {
  if (score >= 70) return "#2b8a3e";
  if (score >= 55) return "#37b24d";
  if (score >= 40) return "#e0b000";
  if (score >= 25) return "#fd7e14";
  return "#fa5252";
}

export function RewardChips({ lineup, after }: { lineup: Lineup; after: boolean }) {
  return (
    <>
      {rewardChips(lineup, after).map((chip) => (
        <span
          key={`${chip.kind}-${chip.label}`}
          className={`pl-rw${chip.won ? " won" : ""}${chip.kind === "none" ? " none" : ""}${
            chip.kind === "essence" && lineup.eEss < 0 && !after ? " neg" : ""
          }`}
        >
          {chip.kind === "essence" ? <Essence /> : chip.kind === "cash" ? <Cash /> : null}
          {chip.label}
        </span>
      ))}
    </>
  );
}

export function ribbonClass(score: number | null): string {
  return ribbon(score);
}

export { formatOf };
