import MissionsAudit from "./MissionsAudit";
import MatchAudit from "./MatchAudit";
import VersusAudit from "./VersusAudit";
import RewardsAudit from "./RewardsAudit";
import LineupsAudit from "./LineupsAudit";
import StrategiesAudit from "./StrategiesAudit";
import { freshLabel } from "../../lib/fresh";
import type { Audit } from "../../lib/audit";
import StartsAudit from "./StartsAudit";
import { selection } from "../../lib/startsBoard";
import type { LeagueAudit as League } from "../../lib/leagueAudit";
import LeagueAudit, { StartsCheck } from "./LeagueAudit";
import type { SavedWeek } from "../../lib/myWeeks";
import PlayerScores from "./PlayerScores";
import type { PlayerScoreWeek } from "../../lib/audit";

export type AuditShow = "xscore" | "starts" | "lineups" | "strategies" | "rewards" | "missions";

export default function AuditView({
  data,
  now,
  league,
  show = "xscore",
  season = [],
  saved = [],
  pics = {},
  playerWeek = null,
  playerWeekNumber = null,
  playerWeeks = [],
  startParams = {},
}: {
  data: Audit | null;
  now: Date;
  league: League | null;
  show?: AuditShow;
  /** The season's finished Sorare gameweeks, for what you won (Rewards). */
  season?: { slug: string; number: number }[];
  saved?: SavedWeek[];
  /** Sorare's card art by card slug: your collection and the cards of your saved lineups. */
  pics?: Record<string, string>;
  playerWeek?: PlayerScoreWeek | null;
  playerWeekNumber?: number | null;
  playerWeeks?: PlayerScoreWeek[];
  startParams?: Record<string, string | undefined>;
}) {
  if (!data) {
    return (
      <section className="au-w au-empty" role="status">
        <h1>Audit</h1>
        <p>The audit appears after the next refresh.</p>
      </section>
    );
  }
  const updated = data.generatedAt ? <p className="au-fresh">Updated {freshLabel(data.generatedAt, now)}</p> : null;
  if (show === "xscore") {
    return (
      <>
        <VersusAudit versus={data.versus} updated={updated} />
        {league ? <LeagueAudit data={league} /> : null}
        <MatchAudit data={data.matches} />
        <PlayerScores week={playerWeek} number={playerWeekNumber} weeks={playerWeeks} />
      </>
    );
  }
  if (show === "missions") {
    return (
      <>
        <header className="au-top">
          <h1>Missions</h1>
          <p>How often Sofix&apos;s mission picks were the best your cards could have done.</p>
          {updated}
        </header>
        <MissionsAudit missions={data.missions} floor={data.floor} />
      </>
    );
  }
  if (show === "lineups") return <LineupsAudit lineups={data.lineups} saved={saved} updated={updated} weeks={data.strategies.weeks} pics={pics} />;
  if (show === "strategies") return <StrategiesAudit strategies={data.strategies} pics={pics} updated={updated} selected={startParams?.resultsGw} sort={startParams?.rankBy} />;
  if (show === "rewards") {
    return (
      <>
        <header className="au-top">
          <h1>Rewards</h1>
          <p>The essence the plans expected over the season, against what was really won.</p>
          {updated}
        </header>
        <RewardsAudit rewards={data.rewards} floor={data.floor} season={season} saved={saved} frozen={data.frozenPlans} />
      </>
    );
  }
  return <StartsAudit board={data.startsBoard ?? null} updated={data.generatedAt ? `Updated ${freshLabel(data.generatedAt, now)}` : ""} initial={selection(startParams)} history={league ? <StartsCheck data={league} /> : undefined} />;
}
