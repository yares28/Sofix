import Link from "next/link";
import { freshLabel } from "../../lib/fresh";
import { RARITY_NAME, type MissionPlan, type Suggestion } from "../../lib/missions";
import type { MissionsStatus } from "../../lib/missionsToday";
import LoadMissions from "./LoadMissions";
import CardArt from "../cards/CardArt";
import type { HistoryCard, HistoryDay } from "../../lib/missionLog";

const shortDay = (day: string): string =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));

const TONE: Record<HistoryCard["state"], { tone: string; said: string }> = {
  did: { tone: "hit", said: "did it" },
  didnt: { tone: "miss", said: "did not" },
  void: { tone: "miss", said: "game not played" },
  waiting: { tone: "wait", said: "waiting for his game" },
};

function Past({ card, left }: { card: HistoryCard; left?: boolean }) {
  const { tone, said } = left ? { tone: "left", said: "did it, not picked" } : TONE[card.state];
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

function History({ days }: { days: HistoryDay[] }) {
  return (
    <section className="pd-card" aria-labelledby="ms-history">
      <h2 id="ms-history">History</h2>
      {days.length ? (
        <ol className="au-ms-days">
          {days.map((d) => (
            <li key={`${d.day}-${d.mission}`} className={d.score && d.score.best && d.score.got >= d.score.best ? "ok" : "short"}>
              <div className="au-ms-head">
                <b>{shortDay(d.day)}</b>
                <span>
                  {d.mission}
                  {d.loaded ? "" : " · not loaded"}
                </span>
                <strong>{!d.score ? "Checked a day after the games" : d.score.best ? `Sofix ${d.score.got} of ${d.score.best}` : "Nobody could"}</strong>
              </div>
              <div className="ms-hist-row">
                <span>Sofix</span>
                {d.sofix.length || d.missed.length ? (
                  <ul className="au-ms-cards" aria-label="Sofix's picks">
                    {d.sofix.map((c) => (
                      <Past key={c.slug} card={c} />
                    ))}
                    {d.missed.map((c) => (
                      <Past key={c.slug} card={c} left />
                    ))}
                  </ul>
                ) : (
                  <p className="pd-none">No pick: none of your cards had a game still to come when Sofix wrote this day down.</p>
                )}
              </div>
              {d.yours.length ? (
                <div className="ms-hist-row">
                  <span>You</span>
                  <ul className="au-ms-cards" aria-label="Your picks">
                    {d.yours.map((c) => (
                      <Past key={c.slug} card={c} />
                    ))}
                  </ul>
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="pd-none">Nothing yet. Sofix writes down its picks before each day&rsquo;s games.</p>
      )}
      {days.length ? (
        <p className="pd-foot">
          Green outline: did it. Faded: did not. Dashed: one of your cards did it and Sofix didn&rsquo;t pick him.{" "}
          <Link href="/audit/missions">How often Sofix was right</Link>
        </p>
      ) : null}
    </section>
  );
}

const loadedAt = (iso: string): string =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Madrid" }).format(new Date(iso)).replace(",", "");

const time = (iso: string): string =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Madrid" }).format(new Date(iso)).replace(",", "");
const dayLabel = (day: string): string => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));

/** A rate the way the mission counts it: a share of starts for a decisive action, else a count per start. */
const rate = (value: number, share: boolean): string => (share ? `${Math.round(value * 100)}%` : value.toFixed(1));

/** What the three numbers beside a player count, for this mission. */
const STAT: Record<MissionPlan["rule"]["kind"], string> = {
  decisive: "Share of his starts with a decisive action",
  interception: "Interceptions per start",
  assist: "Assists per start",
  goal: "Goals per start",
  score: "",
};

function Card({ pick, share, note }: { pick: Suggestion; share: boolean; note?: string }) {
  return (
    <li className="ms-pick">
      {note ? <span className="ms-note">{note}</span> : null}
      <span className="art" aria-hidden="true">
        <CardArt src={pick.pic} name={pick.name} />
      </span>
      <span className="who">
        <b>
          <Link href={`/players/${pick.slug}`}>{pick.name}</Link>
        </b>
        <span>
          {pick.venue === "H" ? "v" : "at"} {pick.opponent} · {time(pick.kickoff)}
        </span>
      </span>
      <span className="avg" aria-label="What he did per start over his last 5, last 8 and two seasons">
        <span><b>{rate(pick.average.l5, share)}</b>last 5</span>
        <span><b>{rate(pick.average.l8, share)}</b>last 8</span>
        <span><b>{rate(pick.average.season, share)}</b>seasons</span>
      </span>
      <span className="chance">
        <b>{Math.round(pick.chance * 100)}%</b>
      </span>
    </li>
  );
}

function Mission({ one, placed }: { one: MissionPlan; placed: Map<string, string> }) {
  const share = one.rule.kind === "decisive";
  const count = one.all.length + one.unrated.length;
  return (
    <section className="pd-card ms-mission" aria-label={one.mission.title}>
      <h2>
        {one.mission.title}
        {one.reward ? <span className="ms-reward">{one.reward}</span> : null}
      </h2>
      <p className="ms-rule">
        {one.rule.kind === "score" ? "Sofix can’t rank this one yet: it asks a player to beat his own average." : one.open > 0 ? `${one.open} to pick: ${one.rule.label}` : "All picked"}
        {one.mission.made > 0 && one.open > 0 ? ` (${one.mission.made} done)` : ""}
      </p>
      {one.picks.length ? (
        <ol className="ms-picks">
          {one.picks.map((pick) => (
            <Card key={pick.slug} pick={pick} share={share} />
          ))}
        </ol>
      ) : one.open > 0 && one.rule.kind !== "score" ? (
        <p className="pd-none">None of your cards with a game still to play today fits this one.</p>
      ) : null}
      {count ? (
        <details className="ms-all">
          <summary>
            All {count} of your players with a game still to play today
          </summary>
          {one.all.length ? (
            <>
              <p className="ms-all-key">{STAT[one.rule.kind]}: last 5, last 8, two seasons. Big number: his chance today.</p>
              <ol className="ms-picks">
                {one.all.map((pick) => {
                  const where = placed.get(pick.slug);
                  return <Card key={pick.slug} pick={pick} share={share} note={where === one.mission.title ? "Sofix’s pick" : where ? `Sofix: ${where}` : undefined} />;
                })}
              </ol>
            </>
          ) : null}
          {one.unrated.length ? (
            <p className="ms-all-key">
              {one.rule.kind === "score" ? "Not rated (Sofix can’t rank this mission yet)" : "No numbers for"}: {one.unrated.map((u) => u.name).join(", ")}
            </p>
          ) : null}
        </details>
      ) : null}
    </section>
  );
}

export default function MissionsView({
  rarity,
  tabs,
  day,
  plans,
  status,
  seenAt,
  missionDay,
  now,
  history,
}: {
  rarity: string;
  tabs: string[];
  day: string | null;
  plans: MissionPlan[];
  status: MissionsStatus;
  seenAt: string | null;
  missionDay: string;
  now: string;
  history: HistoryDay[];
}) {
  const today = status === "today";
  const placed = new Map(plans.flatMap((one) => one.picks.map((pick) => [pick.slug, one.mission.title] as const)));
  return (
    <div className="pd-wrap" data-testid="missions-page">
      <div className="ms-head">
        <h1 className="ms-h1">Daily missions{day ? <span className="sub"> · {dayLabel(day)}</span> : null}</h1>
        {tabs.length > 1 ? (
          <nav className="pd-pick" aria-label="Rarity">
            {tabs.map((r) => (
              <Link key={r} href={`/missions?rarity=${r}`} aria-current={r === rarity ? "page" : undefined}>
                {RARITY_NAME[r] ?? r}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
      <LoadMissions stale={!today} day={missionDay} />
      {today ? null : (
        <p className="ms-stale" role="status">
          Today&rsquo;s missions aren&rsquo;t loaded yet.{seenAt ? ` Last loaded ${loadedAt(seenAt)}.` : ""}
        </p>
      )}
      {today && !plans.length ? (
        <section className="pd-card">
          <p className="pd-none">No {RARITY_NAME[rarity] ?? rarity} missions on Sorare today.</p>
        </section>
      ) : null}
      {plans.map((one) => (
        <Mission key={one.mission.id} one={one} placed={placed} />
      ))}
      <p className="pd-foot">
        Your cards with a game still to play today, each in one mission only.{" "}
        {today && seenAt ? `Missions loaded from Sorare ${freshLabel(seenAt, new Date(now))}.` : ""}
      </p>
      <History days={history} />
    </div>
  );
}
