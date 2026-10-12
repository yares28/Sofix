"use client";

import { createContext, useContext, type CSSProperties } from "react";
import { CHANCE_SOURCES, chanceFor, chancePercent, type ChanceView } from "../../lib/lineupChances";
import { chanceTone, type LineupPlayer } from "../../lib/lineups";
import { scoreColour } from "../../lib/cards";
import { SCORE_TAGS, scoreWords, sideScores, type ScoreView } from "../../lib/matchScores";

export const ChanceContext = createContext<ChanceView>({ source: "futbolfantasy", values: {}, url: "" });

/** Every displayed percentage names its selected source; FF numbers link to the match that supplied them. */
export default function Chance({ player, small = false, inline = false }: { player: LineupPlayer; small?: boolean; inline?: boolean }) {
  const view = useContext(ChanceContext);
  if (view.scores) {
    const n = player.slug ? (view.scores.values[player.slug]?.[view.scores.show] ?? null) : null;
    // What he scored is a filled pill; what was expected of him is the same pill outlined, so the two are told apart at a glance.
    const look = (kind: ScoreView, value: number | null) => ({ "data-kind": kind === "actual" ? "actual" : "said", style: value === null ? undefined : ({ "--c": scoreColour(value).fill, "--k": scoreColour(value).ink } as CSSProperties) });
    const title = scoreWords(player, view.scores);
    if (inline) return <span className="lu-chance-inline" data-tone="none" title={title}>{n === null ? "—" : Math.round(n)}</span>;
    const others = sideScores(player, view.scores);
    return (
      <>
        <span className={`lu-pct${small ? " lu-pct-sm" : ""}`} data-tone="none" title={title} {...look(view.scores.show, n)}>{n === null ? "—" : Math.round(n)}</span>
        {others.length ? (
          <span className="lu-sc-more" aria-hidden="true" title={title}>
            {others.map((one) => (
              <span key={one.view} className="lu-sc" {...look(one.view, one.n)}>
                {one.view === "actual" ? null : <i>{SCORE_TAGS[one.view]}</i>}
                {Math.round(one.n)}
              </span>
            ))}
          </span>
        ) : null}
      </>
    );
  }
  if(player.actual)return <span className={inline?"lu-chance-inline":"lu-pct"} data-tone="good">{player.actual==="starter"?"Starter":"Bench"}</span>;
  const p = chanceFor(player, view);
  const title = `${player.name}: ${p === null ? "no estimate for this match" : `${chancePercent(p)} to start`} · ${CHANCE_SOURCES[view.source]}`;
  const props = { className: inline ? "lu-chance-inline" : `lu-pct${small ? " lu-pct-sm" : ""}`, "data-tone": chanceTone(p), title };
  return view.source === "futbolfantasy" && p !== null && view.url
    ? <a {...props} href={view.url} target="_blank" rel="noopener noreferrer" aria-label={title}>{chancePercent(p)}</a>
    : <span {...props}>{chancePercent(p)}</span>;
}
