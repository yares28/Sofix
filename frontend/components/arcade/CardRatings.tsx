"use client";

import { useContext } from "react";
import { predicted, type Outlook } from "../../lib/arcadePlan";
import { scoreColour } from "../../lib/cards";
import { FdrContext, sideOf } from "./Fdr";
import { BOARD_OF, fdrOf, leagueLabel } from "../../lib/arcadeFdr";

/** The same fixture ratings on collection and lineup art; captain points belong to that lineup's xScore. */
export default function CardRatings({ outlook, game, competition, home, detail, captain = false, captainBonus = 0 }: {
  outlook?: Outlook; game?: string; competition?: { slug: string; name: string }; home: boolean; detail: string; captain?: boolean; captainBonus?: number;
}) {
  // No rating says why: a league Sofix has no board for, or a board game not rated (yet).
  const missing = !game ? "FDR unavailable" : competition && !BOARD_OF[competition.slug] ? `no Sofix board for ${leagueLabel(competition)}` : "not rated on Sofix's board yet";
  const fixture = useContext(FdrContext).get(game ?? "");
  const side = sideOf(fixture, home)?.mine;
  const fdr = fdrOf(side);
  const score = outlook ? predicted(outlook, captain, captainBonus) : null;
  const look = scoreColour(score);
  return (
    <div className="arc-card-ratings">
      <span className={`arc-card-fdr${side ? ` f${side.bucket}` : ""}`} title={`${detail} · ${side ? fdr.title : missing}`}>
        <small>FDR</small><b>{fdr.value ?? "—"}</b>
      </span>
      <span className="arc-card-score" aria-label={score === null ? "xScore unavailable" : `xScore ${Math.round(score)}`} style={{ background: look.fill, color: look.ink }} title={`${detail} · ${outlook?.scoreSource === "sofix" ? "Sofix" : outlook?.scoreSource === "sorare" ? "Sorare" : outlook?.scoreSource === "form" ? "Recent form" : "No"} projection × start chance × card bonus${captain ? " (captain included)" : ""}${outlook?.start === null ? "; start chance unknown, assumed starting" : ""}`}>
        <b>{score === null ? "—" : Math.round(score)}</b>
      </span>
    </div>
  );
}
