import type { GameweekPlan, PlayerGame, PlayingPlayer } from "../lib/play";
import { dayName } from "../lib/weeks";
import SorareImage from "./play/SorareImage";

const COMPETITION: Record<string, string> = {
  "uefa-nations-league": "Nations League",
  "uefa-champions-league": "Champions League",
  "uefa-europa-league": "Europa League",
  "uefa-europa-conference-league": "Conference League",
  "segunda-division-es": "Segunda",
  "copa-del-rey": "Copa del Rey",
  "fifa-world-cup-qualifiers-europe": "World Cup qualifiers",
  friendly: "Friendly",
};

/** Sorare's own slug, tidied: "uefa-nations-league" reads as a competition, not as an id. */
export const competitionName = (slug: string): string =>
  COMPETITION[slug] ??
  slug
    .replace(/-(es|en|fr|it|de|us)$/, "")
    .split("-")
    .map((word) => (word.length <= 4 && word === word.toLowerCase() && /^[a-z]+$/.test(word) && word.length <= 4 ? word.toUpperCase() : word))
    .join(" ")
    .replace(/^./, (first) => first.toUpperCase());

const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

type Row = { player: PlayingPlayer; game: PlayerGame };

const rows = (players: PlayingPlayer[]): Row[] =>
  players
    .flatMap((player) => player.games.map((game) => ({ player, game })))
    .sort((a, b) => a.game.kickoff.localeCompare(b.game.kickoff));

/**
 * The board in a week LaLiga is away.
 *
 * There is no round to draw and no difficulty to rate — our model only knows LaLiga — so the page shows what
 * is actually happening to the owner: the games his own Sorare players play, and, on the Difficulty tab, the
 * two numbers Sofix does have for them, the chance each plays and what he is expected to score.
 */
export default function AwayWeek({
  plan,
  variant,
  dates,
}: {
  plan: GameweekPlan | null;
  variant: "fixtures" | "difficulty";
  dates: string;
}) {
  const players = plan?.playing.players ?? [];

  if (!players.length) {
    return (
      <section className="card empty-state ow-none" role="status">
        <h2>No LaLiga this week</h2>
        <p>{plan ? "None of your players has a game either." : "Sorare hasn't opened this week yet."}</p>
      </section>
    );
  }

  const games = rows(players);
  const competitions = [...new Set(games.map((row) => row.game.competition))].map(competitionName);

  if (variant === "difficulty") {
    const ranked = [...players].sort((a, b) => b.x - a.x);
    const best = ranked[0]!;
    return (
      <section className="card ow" aria-labelledby="away-t">
        <AwayHead
          id="away-t"
          hero={String(Math.round(best.x))}
          unit="xScore"
          title="Your week"
          caption={
            <>
              <b>{best.name}</b> leads · {dates}
            </>
          }
          competitions={competitions}
        />
        <ol className="ow-rank">
          {ranked.map((player) => (
            <li key={player.name}>
              <Card player={player} />
              <span className="who">
                <b>{player.name}</b>
                <span>
                  {player.pos} · {player.club ?? "no club"}
                </span>
              </span>
              <span className="ow-meter" role="img" aria-label={`${Math.round(player.p * 100)}% chance of playing`}>
                <i style={{ width: `${Math.round(player.p * 100)}%` }} />
              </span>
              <span className="pct">{Math.round(player.p * 100)}%</span>
              <span className="xs">
                <b>{Math.round(player.x)}</b>
                <span>xScore</span>
              </span>
              <span className="opp">
                {player.games.map((game) => (
                  <Opponent key={game.kickoff} game={game} />
                ))}
              </span>
            </li>
          ))}
        </ol>
        <p className="footnote">
          Outside LaLiga there is no difficulty to rate: these are the chance each plays and what he is expected
          to score, the same numbers the Play page builds its lineups from.
        </p>
      </section>
    );
  }

  const byDay = new Map<string, Row[]>();
  for (const row of games) {
    const key = dayName(row.game.kickoff);
    byDay.set(key, [...(byDay.get(key) ?? []), row]);
  }

  return (
    <section className="card ow" aria-labelledby="away-t">
      <AwayHead
        id="away-t"
        hero={String(games.length)}
        unit={games.length === 1 ? "game" : "games"}
        title="Your week"
        caption={
          <>
            <b>{players.length}</b> of your players · {dates} · LaLiga is away
          </>
        }
        competitions={competitions}
      />
      {[...byDay].map(([label, list]) => (
        <div key={label} className="ow-day">
          <h3>{label}</h3>
          <ul className="ow-games">
            {list.map((row) => (
              <li key={`${row.player.name}-${row.game.kickoff}`}>
                <Card player={row.player} />
                <span className="who">
                  <b>{row.player.name}</b>
                  <span>
                    {row.player.pos} · {row.player.club ?? "no club"}
                  </span>
                </span>
                <Opponent game={row.game} />
                <span className="at">{clock.format(new Date(row.game.kickoff))}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function AwayHead({
  id,
  hero,
  unit,
  title,
  caption,
  competitions,
}: {
  id: string;
  hero: string;
  unit: string;
  title: string;
  caption: React.ReactNode;
  competitions: string[];
}) {
  return (
    <div className="ow-head">
      <div>
        <h2 id={id}>{title}</h2>
        <p className="ow-num">
          <b>{hero}</b>
          <i>{unit}</i>
        </p>
        <p className="ow-cap">{caption}</p>
      </div>
      <div className="ow-comps">
        {competitions.map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
    </div>
  );
}

function Card({ player }: { player: PlayingPlayer }) {
  return (
    <span className={`ow-card ${player.rarity === "rare" ? "rare" : "limited"}`}>
      <SorareImage src={player.pic} alt="" fill />
      {player.cards > 1 ? <i>{player.cards}</i> : null}
    </span>
  );
}

function Opponent({ game }: { game: PlayerGame }) {
  return (
    <span className="ow-opp">
      <SorareImage src={game.opponentCrest} alt="" width={18} height={18} />
      <b>{game.opponent}</b>
      <em>{game.venue}</em>
      <span>{competitionName(game.competition)}</span>
    </span>
  );
}
