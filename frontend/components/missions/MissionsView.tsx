import Link from "next/link";
import { freshLabel } from "../../lib/fresh";
import type { MissionPlan, Suggestion } from "../../lib/missions";
import CardArt from "../cards/CardArt";

const RARITY_NAME: Record<string, string> = { limited: "Limited", rare: "Rare", super_rare: "Super Rare", unique: "Unique" };

const time = (iso: string): string =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Madrid" }).format(new Date(iso)).replace(",", "");
const dayLabel = (day: string): string => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));

/** A rate the way the mission counts it: a share of starts for a decisive action, else a count per start. */
const rate = (value: number, share: boolean): string => (share ? `${Math.round(value * 100)}%` : value.toFixed(1));

function Card({ pick, share }: { pick: Suggestion; share: boolean }) {
  return (
    <li className="ms-pick">
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

function Mission({ one }: { one: MissionPlan }) {
  const share = one.rule.kind === "decisive";
  return (
    <section className="pd-card ms-mission" aria-label={one.mission.title}>
      <h2>
        {one.mission.title}
        {one.reward ? <span className="ms-reward">{one.reward}</span> : null}
      </h2>
      <p className="ms-rule">
        {one.open > 0 ? `${one.open} to pick: ${one.rule.label}` : "All picked"}
        {one.mission.made > 0 && one.open > 0 ? ` (${one.mission.made} done)` : ""}
      </p>
      {one.picks.length ? (
        <ol className="ms-picks">
          {one.picks.map((pick) => (
            <Card key={pick.slug} pick={pick} share={share} />
          ))}
        </ol>
      ) : one.open > 0 ? (
        <p className="pd-none">None of your cards with a game still to play today fits this one.</p>
      ) : null}
    </section>
  );
}

export default function MissionsView({
  rarity,
  seen,
  day,
  plans,
  seenAt,
  now,
}: {
  rarity: string;
  seen: string[];
  day: string | null;
  plans: MissionPlan[];
  seenAt: string | null;
  now: string;
}) {
  if (!plans.length) {
    return (
      <section className="pd-card">
        <h1 className="ms-h1">Daily missions</h1>
        <p className="pd-none" role="status">
          Open Sorare&rsquo;s Missions page once with the extension on, and the open missions appear here with the cards that fit them.
        </p>
      </section>
    );
  }
  return (
    <div className="pd-wrap" data-testid="missions-page">
      <div className="ms-head">
        <h1 className="ms-h1">Daily missions{day ? <span className="sub"> · {dayLabel(day)}</span> : null}</h1>
        {seen.length > 1 ? (
          <nav className="pd-pick" aria-label="Rarity">
            {seen.map((r) => (
              <Link key={r} href={`/missions?rarity=${r}`} aria-current={r === rarity ? "page" : undefined}>
                {RARITY_NAME[r] ?? r}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
      {plans.map((one) => (
        <Mission key={one.mission.id} one={one} />
      ))}
      <p className="pd-foot">
        Your cards with a game still to play today, each in one mission only. 
        {seenAt ? `Missions read from Sorare ${freshLabel(seenAt, new Date(now))}.` : ""}
      </p>
    </div>
  );
}
