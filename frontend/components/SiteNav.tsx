import Link from "next/link";
import type { SystemStatus } from "../lib/control";
import type { GridMeta } from "../lib/types";
import type { Week } from "../lib/weeks";
import NavLinks from "./NavLinks";
import StatusPill from "./StatusPill";
import TabBar from "./TabBar";
import WeekPicker from "./WeekPicker";

type Props = {
  meta: GridMeta | null;
  system: SystemStatus | null;
  current?: "control";
  /** The app-wide week. Every page computes it the same way (`lib/weeks.weekContext`). */
  week?: { weeks: Week[]; current: Week | null; now: Week | null };
};

export default function SiteNav({ meta, system, current, week }: Props) {
  return (
    <>
      <nav className="nav">
        <div className="nav-inner">
          <Link href="/" className="brand" aria-label="Sofix home">
            <div className="brand-mark" />
            <span className="brand-name">Sofix</span>
          </Link>
          <NavLinks />
          <div className="nav-meta">
            {week ? <WeekPicker weeks={week.weeks} current={week.current} now={week.now} /> : null}
            <StatusPill syncedAt={meta?.last_synced_at ?? meta?.last_predicted_at ?? null} system={system} current={current === "control"} />
          </div>
        </div>
      </nav>
      <TabBar />
    </>
  );
}
