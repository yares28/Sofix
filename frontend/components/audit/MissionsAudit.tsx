import { percent, type MissionCard, type Missions } from "../../lib/audit";
import { RARITY_NAME } from "../../lib/missions";
import CardArt from "../cards/CardArt";

const dayLabel = (day: string): string =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));

function Card({ card, tone }: { card: MissionCard; tone: "hit" | "miss" | "left" }) {
  const said = tone === "hit" ? "did it" : tone === "miss" ? "did not" : "did it, not picked";
  return (
    <li className={`au-ms-card ${tone}`} title={`${card.name}: ${said}`}>
      <span className="art" aria-hidden="true">
        <CardArt src={card.pic} name={card.name} />
      </span>
      <span className="nm">{card.name}</span>
      <span className="visually-hidden">, {said}</span>
    </li>
  );
}

/**
 * Audit · Missions. Each mission day is scored against what your cards could have done: the players who did what it asks are the achievers, the best
 * possible is the mission's picks or the achievers, whichever is fewer, and the day is a success when Sofix's picks hold that many. A day nobody could
 * do is not counted.
 */
export default function MissionsAudit({ missions, floor }: { missions: Missions; floor: number }) {
  const enough = missions.counted >= floor;
  const rate = missions.counted ? missions.success / missions.counted : null;
  return (
    <>
      <section className="au-w au-hero" aria-label="Sofix's picks">
        <div className="au-hero-main">
          <p className="au-label">Sofix&apos;s picks</p>
          {enough && rate !== null ? (
            <>
              <p className="au-big figure">
                {Math.round(rate * 100)}
                <span>%</span>
              </p>
              <h2>of mission days, the best your cards could have done</h2>
            </>
          ) : (
            <>
              <h2 className="au-none">Too few to tell yet</h2>
              <p className="au-sub">
                <b>
                  {missions.counted} of {floor}
                </b>{" "}
                mission days needed before the rate means more than luck.
              </p>
            </>
          )}
        </div>
        <div>
          <dl className="au-src-more au-rw-totals">
            <div>
              <dt>Best possible</dt>
              <dd>
                {missions.success} of {missions.counted} days
              </dd>
            </div>
            <div>
              <dt>Achievers caught</dt>
              <dd>
                {missions.caught} of {missions.best}
              </dd>
            </div>
            <div>
              <dt>Your picks, best possible</dt>
              <dd>{missions.yours.counted ? `${missions.yours.success} of ${missions.yours.counted} days` : "–"}</dd>
            </div>
            <div>
              <dt>Chance given · happened</dt>
              <dd>{missions.said === null || missions.happened === null ? "–" : `${percent(missions.said)} · ${percent(missions.happened)}`}</dd>
            </div>
            <div>
              <dt>Nobody could · waiting</dt>
              <dd>
                {missions.nobody} · {missions.pending}
              </dd>
            </div>
          </dl>
          <p className="au-sub">
            A day counts when at least one of your cards did what the mission asked. The Decisive Picker is written down every day; the other missions on
            the days you loaded them.
          </p>
        </div>
      </section>

      {missions.byMission.length ? (
        <section className="au-w" aria-label="By mission">
          <div className="au-record">
            <table>
              <caption className="visually-hidden">Mission days where Sofix&apos;s picks were the best possible, by mission</caption>
              <thead>
                <tr>
                  <th scope="col">Mission</th>
                  <th scope="col">Days</th>
                  <th scope="col">Best possible</th>
                </tr>
              </thead>
              <tbody>
                {missions.byMission.map((row) => (
                  <tr key={row.mission}>
                    <th scope="row">{row.mission}</th>
                    <td>{row.counted}</td>
                    <td>{row.success}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="au-w" aria-labelledby="au-ms-days">
        <h2 id="au-ms-days">Day by day</h2>
        {missions.days.length ? (
          <ol className="au-ms-days">
            {missions.days.map((day) => (
              <li key={`${day.day}-${day.rarity}-${day.mission}`} className={day.got >= day.best ? "ok" : "short"}>
                <div className="au-ms-head">
                  <b>{dayLabel(day.day)}</b>
                  <span>
                    {day.mission} · {RARITY_NAME[day.rarity] ?? day.rarity}
                    {day.loaded ? "" : " · not loaded"}
                  </span>
                  <strong>
                    {day.got} of {day.best}
                  </strong>
                </div>
                <ul className="au-ms-cards" aria-label="Sofix's picks">
                  {day.picks.map((card) => (
                    <Card key={card.slug} card={card} tone={card.hit ? "hit" : "miss"} />
                  ))}
                  {day.missed.map((card) => (
                    <Card key={card.slug} card={card} tone="left" />
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        ) : (
          <p className="au-sub">Nothing checked yet. Each day&apos;s picks are checked a day after their games.</p>
        )}
      </section>
    </>
  );
}
