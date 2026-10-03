"use client";

import { createContext, useContext } from "react";
import { CHANCE_SOURCES, chanceFor, chancePercent, type ChanceView } from "../../lib/lineupChances";
import { chanceTone, type LineupPlayer } from "../../lib/lineups";

export const ChanceContext = createContext<ChanceView>({ source: "futbolfantasy", values: {}, url: "" });

/** Every displayed percentage names its selected source; FF numbers link to the match that supplied them. */
export default function Chance({ player, small = false, inline = false }: { player: LineupPlayer; small?: boolean; inline?: boolean }) {
  const view = useContext(ChanceContext);
  const p = chanceFor(player, view);
  const title = `${player.name}: ${p === null ? "no estimate for this match" : `${chancePercent(p)} to start`} · ${CHANCE_SOURCES[view.source]}`;
  const props = { className: inline ? "lu-chance-inline" : `lu-pct${small ? " lu-pct-sm" : ""}`, "data-tone": chanceTone(p), title };
  return view.source === "futbolfantasy" && p !== null && view.url
    ? <a {...props} href={view.url} target="_blank" rel="noopener noreferrer" aria-label={title}>{chancePercent(p)}</a>
    : <span {...props}>{chancePercent(p)}</span>;
}
