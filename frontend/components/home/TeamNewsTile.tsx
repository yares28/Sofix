import Link from "next/link";
import { readLabel, type LineupsGlance } from "../../lib/lineups";
import type { GameweekPlan, NewsGame, NewsMove, NewsRisk } from "../../lib/play";
import { gameLine, idleNote, lockChip, movedWhy, shares, sinceLabel, splitLabel } from "../../lib/teamNews";
import { KindIcon } from "../lineups/Icons";
import SorareImage from "../play/SorareImage";
import SourceMark from "../SourceMark";

const FACES: Record<string, string> = {
  limited: "linear-gradient(165deg, #fff4d6 0%, #f1c95f 50%, #c78a1c 100%)",
  rare: "linear-gradient(165deg, #ffd9d3 0%, #e0503e 48%, #97170e 100%)",
  super_rare: "linear-gradient(165deg, #d8e8ff 0%, #4a84e8 48%, #1b3f96 100%)",
  unique: "linear-gradient(165deg, #f0f0f2 0%, #4b4b52 48%, #16161a 100%)",
  common: "linear-gradient(165deg, #ffffff 0%, #eef0f4 52%, #dde1e8 100%)",
};
const BAND_TEXT = { likely: "likely · 70%+", doubtful: "in doubt · 40–69%", unlikely: "unlikely", out: "out" } as const;

function Face({ pic, rarity }: { pic: string; rarity: string }) {
  return (
    <span className="hm-nw-face" style={{ background: FACES[rarity] ?? FACES.common }}>
      <SorareImage src={pic} fill />
    </span>
  );
}

const pct = (p: number) => `${Math.round(p * 100)}%`;

/**
 * Team news under Sorare: how the owner's players look for the gameweek being planned, which of his plan's starters might not
 * start, and what moved since yesterday. Everything comes from the job (`TeamNews`); only Futbol Fantasy's numbers are news.
 * Design: the "Team news" boards of the futbolfantasy design canvas.
 */
export default function TeamNewsTile({ week, now, glance }: { week: GameweekPlan; now: Date; glance: LineupsGlance | null }) {
  const news = week.teamNews;
  if (!news) {
    const note = idleNote(week, glance);
    return (
      <section className="hm-tile hm-news hm-nw-idle" aria-labelledby="hm-news">
        <header className="hm-nw-head">
          <h2 id="hm-news">Team news</h2>
          <Link href="/lineups" className="hm-nw-link">
            Lineups
          </Link>
        </header>
        <p role="status">
          <b>{note.lead}</b> {note.rest}
          {note.lineups ? ` ${note.lineups}` : null}
        </p>
      </section>
    );
  }
  const hasPlan = week.plans.length > 0;
  return (
    <section className="hm-tile hm-news" aria-labelledby="hm-news">
      <header className="hm-nw-head">
        <div className="hm-nw-title">
          <h2 id="hm-news">Team news</h2>
          <span>FF read {readLabel(news.readAt, now)}</span>
        </div>
        <div className="hm-nw-tools">
          <span className="hm-nw-lock">
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <circle cx="8" cy="8.6" r="5.9" />
              <path d="M8 5.6v3l2 1.4M6.4 1.6h3.2" />
            </svg>
            {lockChip(week.gameweek.lock, now)}
          </span>
          <Link href="/lineups" className="hm-nw-link">
            Lineups
          </Link>
        </div>
      </header>

      <div className="hm-nw-split">
        <div className="hm-nw-count">
          <span>
            <b>{news.players}</b> of your players have an FF chance this round
          </span>
          {news.without > 0 ? <span className="muted">{news.without} more without one: SO or SF</span> : null}
        </div>
        <div className="hm-nw-bar" role="img" aria-label={splitLabel(news.split)}>
          {shares(news.split).map((part) => (
            <span key={part.key} data-band={part.key} style={{ flex: part.flex }} />
          ))}
        </div>
        <ul className="hm-nw-key">
          {shares(news.split).map((part) => (
            <li key={part.key}>
              <i data-band={part.key} aria-hidden="true" />
              <b>{part.count}</b> {BAND_TEXT[part.key]}
            </li>
          ))}
        </ul>
      </div>

      <div className="hm-nw-cols">
        <div className="hm-nw-col">
          <div className="hm-nw-sub">
            {!hasPlan ? (
              <h3>Your plan appears once Sorare&apos;s numbers are in</h3>
            ) : news.atRisk.total === 0 ? (
              <h3>Every starter in your plan is likely to start</h3>
            ) : (
              <h3>
                <b className="hm-nw-n">{news.atRisk.total}</b> {news.atRisk.total === 1 ? "starter" : "starters"} in your plan might not start
              </h3>
            )}
            {hasPlan ? (
              <Link href="/play" className="hm-nw-link sm">
                Open Play
              </Link>
            ) : null}
          </div>
          <ul className="hm-nw-rows">
            {news.atRisk.players.map((row) => (
              <Risk key={row.player} row={row} />
            ))}
          </ul>
          {news.atRisk.total > news.atRisk.players.length ? <p className="hm-nw-more">and {news.atRisk.total - news.atRisk.players.length} more in Play</p> : null}
        </div>

        <div className="hm-nw-col">
          <div className="hm-nw-sub">
            <h3>{news.moved ? `Moved ${sinceLabel(news.moved.since, now)}` : "Moved since yesterday"}</h3>
            <span className="muted">your players only</span>
          </div>
          {news.moved === null ? (
            <p className="hm-nw-none">Moves show once a reading a day old exists to compare with.</p>
          ) : news.moved.players.length === 0 ? (
            <p className="hm-nw-none">Nobody moved by 10 points or more.</p>
          ) : (
            <ul className="hm-nw-rows">
              {news.moved.players.map((row) => (
                <Move key={row.player} row={row} />
              ))}
            </ul>
          )}
          {news.moved && news.moved.total > news.moved.players.length ? (
            <p className="hm-nw-more">and {news.moved.total - news.moved.players.length} more</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

const gameOf = (game: NewsGame) => gameLine(game);

function Risk({ row }: { row: NewsRisk }) {
  return (
    <li className="hm-nw-row">
      <Face pic={row.pic} rarity={row.rarity} />
      <span className="hm-nw-who">
        <b>{row.name}</b>
        <span>
          {gameOf(row.game)} · {row.comp}
          {row.captain ? " · captain" : ""}
        </span>
      </span>
      {row.kind ? <KindIcon kind={row.kind} size={18} /> : null}
      <SourceMark source="futbolfantasy" />
      <b className="hm-nw-pct" data-tone={row.p >= 0.4 ? "mid" : "low"}>
        {pct(row.p)}
      </b>
    </li>
  );
}

function Move({ row }: { row: NewsMove }) {
  const up = row.to > row.from;
  return (
    <li className="hm-nw-row">
      <span className="hm-nw-arrow" data-up={up ? "" : undefined} aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ transform: up ? "none" : "rotate(180deg)" }}>
          <path d="M6 10V2M2.8 5.2L6 2l3.2 3.2" />
        </svg>
      </span>
      <span className="hm-nw-who">
        <b>{row.name}</b>
        <span>{movedWhy(row)}</span>
      </span>
      <span className="hm-nw-from">{row.from} →</span>
      <b className="hm-nw-pct" data-up={up ? "" : undefined}>
        {row.to}%
      </b>
      <span className="visually-hidden">{up ? "up" : "down"} from {row.from}%</span>
    </li>
  );
}
