import Link from "../navigation/NavigationLink";
import type { CSSProperties } from "react";
import { scoreColour } from "../../lib/cards";
import type { LaLigaRound, RoundGame, RoundPick } from "../../lib/laliga";
import type { AfterRow } from "../../lib/recap";
import Crest from "../Crest";
import { MatchRow, TableAfter } from "../recap/Recap";

/**
 * This week · LaLiga, as the canvas draws it (board "3 · This week · LaLiga"): the round's hero (your players this round,
 * by day), the kindest games and the likeliest clean sheets, the games as cards (Sofix's chances with the bookmakers'
 * beside them) and the table after the round.
 */

const pct = (p: number | null) => (p === null ? "–" : `${Math.round(p * 100)}%`);
const band = (p: number | null): CSSProperties => {
  if (p === null) return { background: "var(--track)", color: "var(--ink-2)" };
  const { fill, ink } = scoreColour(p * 100);
  return { background: fill, color: ink };
};
const madrid = (iso: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", ...options }).format(new Date(iso));

export default function LaLigaView({
  round,
  number,
  dates,
  table,
}: {
  round: LaLigaRound;
  number: number;
  dates: string;
  table: AfterRow[];
}) {
  return (
    <main className="ll">
      <section className="ll-hero">
        <div className="ll-lead">
          <h1>LaLiga round {number}</h1>
          <p className="ll-sub">{dates}, Madrid time</p>
          <p className="ll-big">
            <b>{round.playing}</b>
            <span>of your players play this round</span>
          </p>
          {round.days.length ? (
            <ul className="ll-days" aria-label="Your players by day">
              {round.days.map((d) => (
                <li key={d.day}>
                  {d.day} <strong>{d.players}</strong>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <Picks title="Kindest games" note="points to expect, chance to win" picks={round.kindest} value={(p) => p.value.toFixed(2)} chip={(p) => p.win} delay={0.08} />
        <Picks title="Clean sheets" note="likeliest this round" picks={round.cleanSheets} value={() => null} chip={(p) => p.value} delay={0.14} />
      </section>

      <section className="ll-cols">
        <article className="ll-tile ll-games-tile" style={{ animationDelay: ".2s" }} aria-labelledby="ll-games-h">
          <div className="ll-th">
            <h2 id="ll-games-h">The {round.games.length} games</h2>
            <span>Sofix&apos;s chances, bookmakers&apos; beside them</span>
            <Link href="/season">Every round ›</Link>
          </div>
          <div className="ll-games">
            {round.games.map((game, i) => (
              <Game key={game.fixtureId} game={game} index={i} />
            ))}
          </div>
        </article>
        <TableAfter rows={table} round={number} href="/table" />
      </section>
    </main>
  );
}

function Picks({
  title,
  note,
  picks,
  value,
  chip,
  delay,
}: {
  title: string;
  note: string;
  picks: RoundPick[];
  value: (p: RoundPick) => string | null;
  chip: (p: RoundPick) => number | null;
  delay: number;
}) {
  const max = Math.max(...picks.map((p) => p.value), 0.0001);
  return (
    <article className="ll-tile" style={{ animationDelay: `${delay}s` }} aria-label={title}>
      <div className="ll-th">
        <h2>{title}</h2>
        <span>{note}</span>
      </div>
      <ol className="ll-rank">
        {picks.map((p, i) => (
          <li key={p.team.code}>
            <span className="i">{i + 1}</span>
            <Crest team={p.team} size={24} />
            <span className="n">
              <Link href={`/team/${p.team.code}`} prefetch={false}>
                {p.team.name}
              </Link>
              <span>
                {p.venue === "H" ? "v" : "at"} {p.opponent.name}
                {value(p) ? `, ${value(p)}` : ""}
              </span>
            </span>
            <span className="ll-meter">
              <i style={{ width: `${Math.round((p.value / max) * 100)}%`, ...band(chip(p)) }} />
            </span>
            <span className="ll-chip" style={band(chip(p))} title={title === "Clean sheets" ? "Chance of a clean sheet" : "Chance to win"}>
              {pct(chip(p))}
            </span>
          </li>
        ))}
      </ol>
    </article>
  );
}

function Game({ game, index }: { game: RoundGame; index: number }) {
  const { home, away } = game;
  return (
    <MatchRow
      className="ll-g"
      style={{ animationDelay: `${0.24 + index * 0.03}s` }}
      label={`${home.team.name} v ${away.team.name}`}
      linkTeams
      when={
        <div className="when rc-when">
          <b>{madrid(game.kickoff, { weekday: "short", day: "numeric", month: "short" })}</b>
          <span>{game.score ?? (game.confirmed ? madrid(game.kickoff, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "TBC")}</span>
        </div>
      }
      home={home}
      away={away}
      draw={game.draw}
      bothScore={game.bothScore}
      extra={
        <span className="rc-odds">
          {home.market === null ? "Bookmakers: no odds" : (
            <>Bookmakers <b>{pct(home.market)}</b> · <b>{pct(game.marketDraw)}</b> · <b>{pct(away.market)}</b></>
          )}
        </span>
      }
    />
  );
}
