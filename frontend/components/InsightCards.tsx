import { BUCKET_STRONG, type RunStats } from "../lib/grid";
import type { GridTeam } from "../lib/types";
import Crest from "./Crest";

export interface Insight {
  label: string;
  dot: string;
  team: GridTeam;
  stats: RunStats;
  describe: (stats: RunStats) => string;
}

export default function InsightCards({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) {
    return (
      <section className="insights single">
        <article className="card insight">
          <div className="insight-label">No upcoming fixtures in this window</div>
          <div className="insight-meta">Move the window forward to see predictions.</div>
        </article>
      </section>
    );
  }
  return (
    <section className="insights">
      {insights.map(({ label, dot, team, stats, describe }) => (
        <article className="card insight" key={label}>
          <div className="insight-label">
            <span className="dot" style={{ background: dot }} />
            {label}
          </div>
          <div className="insight-team">
            <Crest team={team} />
            <strong>{team.name}</strong>
          </div>
          <div className="insight-meta">{describe(stats)}</div>
          <div className="strip">
            {stats.buckets.map((bucket, i) => (
              <span key={i} style={{ background: BUCKET_STRONG[bucket] }} />
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}
