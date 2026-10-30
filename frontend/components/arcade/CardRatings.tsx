"use client";

import { useContext } from "react";
import { predicted, type Outlook } from "../../lib/arcadePlan";
import { scoreColour } from "../../lib/cards";
import { FdrContext, sideOf } from "./Fdr";

/** The same fixture ratings on collection and lineup art; captain points belong to that lineup's xScore. */
export default function CardRatings({ outlook, game, home, detail, captain = false, captainBonus = 0 }: {
  outlook?: Outlook; game?: string; home: boolean; detail: string; captain?: boolean; captainBonus?: number;
}) {
  const fixture = useContext(FdrContext).get(game ?? "");
  const side = sideOf(fixture, home)?.mine;
  const score = outlook ? predicted(outlook, captain, captainBonus) : null;
  const look = scoreColour(score);
  return (
    <div className="arc-card-ratings">
      <span className={`arc-card-fdr${side ? ` f${side.bucket}` : ""}`} title={side ? `${detail} · ${side.label} · difficulty ${side.difficulty ?? "unknown"} of 100 (lower is easier)` : `${detail} · FDR unavailable`}>
        <small>FDR</small><b>{side?.difficulty == null ? "—" : Math.round(side.difficulty)}</b>
      </span>
      <span className="arc-card-score" aria-label={score === null ? "xScore unavailable" : `xScore ${Math.round(score)}`} style={{ background: look.fill, color: look.ink }} title={`${detail} · ${outlook?.scoreSource === "sofix" ? "Sofix" : outlook?.scoreSource === "sorare" ? "Sorare" : outlook?.scoreSource === "form" ? "Recent form" : "No"} projection × start chance × card bonus${captain ? " (captain included)" : ""}${outlook?.start === null ? "; start chance unknown, assumed starting" : ""}`}>
        <b>{score === null ? "—" : Math.round(score)}</b>
      </span>
    </div>
  );
}
