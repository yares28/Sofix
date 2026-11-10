"use client";

import { createContext, useContext } from "react";
import { fdrOf, type FdrFixture, type FdrSide } from "../../lib/arcadeFdr";

/** Each Arcade game's board fixture, by Sorare game id (only games of a league with a board). */
export const FdrContext = createContext<Map<string, FdrFixture>>(new Map());

/** A club's side of a game: home when its slug is the game's home club, else away. */
export function sideOf(fixture: FdrFixture | undefined, home: boolean): { mine: FdrSide; theirs: FdrSide } | null {
  if (!fixture) return null;
  return home ? { mine: fixture.home, theirs: fixture.away } : { mine: fixture.away, theirs: fixture.home };
}

const pctOf = (x: number | null) => (x === null ? null : `${Math.round(x * 100)}%`);

/**
 * The board's difficulty for a card's club in a game, out of 100 in its band colour (fdrOf), with what matters for the card's position: a
 * goalkeeper's or defender's clean-sheet chance, an attacker's expected goals. Nothing for a league without a board (Ligue 1, Europe).
 */
export function FdrChip({ game, home, position }: { game: string; home: boolean; position?: string | null }) {
  const side = sideOf(useContext(FdrContext).get(game), home);
  if (!side) return null;
  const { mine, theirs } = side;
  const back = position === "Goalkeeper" || position === "Defender";
  const fdr = fdrOf(mine);
  const detail = back ? (pctOf(mine.cleanSheet) ? `${pctOf(mine.cleanSheet)} clean sheet` : null) : mine.xgFor !== null ? `${mine.xgFor.toFixed(1)} xG` : null;
  return (
    <span className={`arc-fdr f${mine.bucket}`} title={`${mine.name} v ${theirs.name}: ${fdr.title}${mine.cleanSheet !== null ? ` · clean sheet ${pctOf(mine.cleanSheet)}` : ""}${mine.xgFor !== null ? ` · ${mine.xgFor.toFixed(1)} expected goals for, ${mine.xgAgainst?.toFixed(1) ?? "?"} against` : ""}`}>
      <b>{fdr.value ?? "—"}</b>{detail ? <small>{detail}</small> : null}
    </span>
  );
}
