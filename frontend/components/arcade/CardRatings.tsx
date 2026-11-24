"use client";

import { useContext } from "react";
import { baseScore, v3Number, type Outlook } from "../../lib/arcadePlan";
import { scoreColour } from "../../lib/cards";
import { FdrContext, sideOf } from "./Fdr";
import { BOARD_OF, fdrOf, leagueLabel } from "../../lib/arcadeFdr";

/** The same ratings on collection and lineup art: base xScore on top, FDR under it; bonuses are printed apart on the card. */
export default function CardRatings({ outlook, game, competition, home, detail }: {
  outlook?: Outlook; game?: string; competition?: { slug: string; name: string }; home: boolean; detail: string;
}) {
  // No rating says why: a league Sofix has no board for, or a board game not rated (yet).
  const missing = !game ? "FDR unavailable" : competition && !BOARD_OF[competition.slug] ? `no Sofix board for ${leagueLabel(competition)}` : "not rated on Sofix's board yet";
  const fixture = useContext(FdrContext).get(game ?? "");
  const side = sideOf(fixture, home)?.mine;
  const fdr = fdrOf(side);
  // Sofix v3, the app's default (24 Nov 2026): his most likely score if he starts, the start % beside it; v1's number without v3's model.
  const v3 = outlook ? v3Number(outlook) : null;
  const score = v3 ?? (outlook ? baseScore(outlook) : null);
  const look = scoreColour(score);
  return (
    <div className="arc-card-ratings">
      <span className="arc-card-score" aria-label={score === null ? "xS unavailable" : `xS ${Math.round(score)}`} style={{ background: look.fill, color: look.ink }} title={v3 !== null ? `${detail} · Sofix v3: his most likely score if he starts, before bonuses` : `${detail} · ${outlook?.scoreSource === "sofix" ? "Sofix" : outlook?.scoreSource === "sorare" ? "Sorare" : outlook?.scoreSource === "form" ? "Recent form" : "No"} projection × start chance, before bonuses${outlook?.start === null ? "; start chance unknown, assumed starting" : ""}`}>
        <b>{score === null ? "—" : Math.round(score)}</b>
      </span>
      <span className={`arc-card-fdr${side ? ` f${fdr.band}` : ""}`} title={`${detail} · ${side ? fdr.title : missing}`}>
        <small>FDR</small><b>{fdr.value ?? "—"}</b>
      </span>
    </div>
  );
}
