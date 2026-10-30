import type { CSSProperties } from "react";
import Link from "../navigation/NavigationLink";
import { playerHref } from "../../lib/links";
import type { Board, BoardCard, BoardRow, Verdict } from "../../lib/audit";
import { scoreColour } from "../../lib/cards";
import { PRIZE_NAME } from "../../lib/lineupsAudit";
import CardArt from "../cards/CardArt";

/** What each strategy a lineup fits is called (backend/app/sorare/strategies.py). */
export const FIT_NAME: Record<string, string> = {
  "keeper-defender": "Keeper with his defender",
  "club-stack": "Three from one club",
  "no-clash": "No attacker against his keeper",
  surest: "Surest starters",
  favourites: "Favourites only",
};
const VERDICT: Record<Verdict, string> = { lucky: "Lucky", good: "Good week", expected: "As expected", poor: "Poor week" };
const names = (list: string[]) => (list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}` : (list[0] ?? ""));

/** The lineup's cards as Sorare's art with what each really scored (a dash when it is not known); substitutes after a rule. */
function Cards({ cards, pics }: { cards: BoardCard[]; pics: Record<string, string> }) {
  return (
    <ol className="au-cd" aria-label={`${cards.length} cards`}>
      {cards.map((card) => {
        const tint: CSSProperties =
          card.score === null || !card.played ? { background: "var(--track)", color: "var(--ink-2)" } : { background: scoreColour(card.score).fill, color: scoreColour(card.score).ink };
        return (
          <li key={card.slug} className={card.sub ? "bench" : undefined}>
            <Link prefetch={false} className="au-cd-art" href={playerHref(card.player)} aria-label={`${card.name}: open his page`}>
              <CardArt src={pics[card.slug] ?? null} name={card.name} />
            </Link>
            {card.captain ? <span className="au-cd-cap" title="Captain">C</span> : null}
            <span className="au-cd-score" style={tint} title={card.played === null ? "Score not checked" : card.played ? "What he scored" : "Did not play"}>
              {card.score === null || !card.played ? "–" : Math.round(card.score)}
            </span>
            <span className="au-cd-name">{card.name}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Row({ row, pics }: { row: BoardRow; pics: Record<string, string> }) {
  const range = row.x !== null && row.lo !== null && row.hi !== null ? `expected ${row.x} (${row.lo}–${row.hi})` : null;
  return (
    <li className={`au-cmp-row${row.who === "you" ? " you" : ""}`}>
      <div className="au-cmp-head">
        <b>{row.label}</b>
        <span className="au-cmp-n">{row.score === null ? (row.state === "unavailable" ? "Rules not saved" : "Pending results") : Math.round(row.score)}</span>
        <small>
          {[
            row.score === null ? null : "points",
            range,
            row.rank ? `rank ${row.rank.toLocaleString("en-GB")}` : null,
            row.won ? PRIZE_NAME[row.won] : null,
            row.verdict ? VERDICT[row.verdict] : null,
          ].filter(Boolean).join(" · ")}
        </small>
      </div>
      {row.fits.length ? <p className="au-cmp-fits">Fits: {row.fits.map((fit) => FIT_NAME[fit] ?? fit).join(" · ")}</p> : null}
      {row.beat.length ? <p className="au-cmp-fits">{names(row.beat)} scored above {row.beat.length === 1 ? "his" : "their"} own range</p> : null}
      <Cards cards={row.cards} pics={pics} />
    </li>
  );
}

/**
 * One gameweek, leaderboard by leaderboard: the lineup you entered first, then Sofix's best plan and every strategy, best score first, each
 * with its cards and what each card scored. Your lineups are a mix of the strategies, so each says which ones it fits.
 */
export default function WeekComparison({ boards, pics }: { boards: Board[]; pics: Record<string, string> }) {
  if (!boards.length) return <p className="au-sub">No lineup of this week has been scored yet.</p>;
  return (
    <div className="au-cmp">
      {boards.map((board) => (
        <section key={board.board} aria-label={board.comp ?? board.board}>
          <h3>{board.comp ?? board.board}</h3>
          {[board.rows.filter(row => ["you", "sofix", "sorare-plan"].includes(row.who)), board.rows.filter(row => !["you", "sofix", "sorare-plan"].includes(row.who))].filter(group => group.length).map((group, index) => <ul key={index} className="au-cmp-list">
            {group.map((row, i) => <Row key={`${row.who}-${i}`} row={row} pics={pics} />)}
          </ul>)}
        </section>
      ))}
    </div>
  );
}
