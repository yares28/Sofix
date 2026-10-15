import type { EuropeGame, Side } from "../lib/europe";
import SorareImage from "./play/SorareImage";

const MADRID = "Europe/Madrid";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: MADRID, year: "numeric", month: "2-digit", day: "2-digit" });
const dayTitle = new Intl.DateTimeFormat("en-GB", { timeZone: MADRID, weekday: "long", day: "numeric", month: "long" });
const time = new Intl.DateTimeFormat("en-GB", { timeZone: MADRID, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** The week's Champions, Europa and Conference League games of clubs holding one of your players, by day (Madrid time). */
export default function EuropeFixtures({ games }: { games: EuropeGame[] }) {
  const days = new Map<string, EuropeGame[]>();
  for (const game of games) {
    const key = dayKey.format(new Date(game.kickoff));
    days.set(key, [...(days.get(key) ?? []), game]);
  }
  return (
    <section className="card fixtures" aria-labelledby="europe-title">
      <header className="section-head">
        <div>
          <h2 id="europe-title">In Europe</h2>
          <div className="insight-meta">
            {games.length} {games.length === 1 ? "match" : "matches"} of clubs with your players · Madrid time
          </div>
        </div>
      </header>
      {[...days.values()].map((list) => (
        <div key={list[0]!.kickoff} className="fixture-day">
          <h3 className="fixture-day-title">{dayTitle.format(new Date(list[0]!.kickoff))}</h3>
          <ul className="fixture-rows">
            {list.map((game) => (
              <li key={game.key}>
                <div className="fixture-row" role="group" aria-label={`${game.competition}: ${game.home.name} v ${game.away.name}, kick-off ${time.format(new Date(game.kickoff))}`}>
                  <Team side={game.home} home />
                  <span className="fixture-middle time" aria-hidden="true">
                    {time.format(new Date(game.kickoff))}
                  </span>
                  <Team side={game.away} />
                </div>
                <div className="fixture-comp" aria-hidden="true">
                  <span className={`comp-tag ${compClass(game.competition)}`}>{game.competition}</span>
                  {game.players} of your players
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

export const compClass = (name: string) => `comp-${name.split(" ")[0]!.toLowerCase()}`;

function Team({ side, home = false }: { side: Side; home?: boolean }) {
  const crest = side.crest ? <SorareImage src={side.crest} alt="" width={24} height={24} /> : <span className="crest-none" />;
  return (
    <span className={`fixture-team ${home ? "home" : "away"}`}>
      {!home && crest}
      <span className="fixture-team-name">{side.name}</span>
      {home && crest}
    </span>
  );
}
