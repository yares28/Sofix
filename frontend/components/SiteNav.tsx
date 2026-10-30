import Link from "./navigation/NavigationLink";
import type { SystemStatus } from "../lib/control";
import type { GridMeta } from "../lib/types";
import type { Week } from "../lib/weeks";
import NavLinks from "./NavLinks";
import { NavigationComplete } from "./navigation/NavigationProvider";
import PlayerSearch from "./PlayerSearch";
import StatusPill from "./StatusPill";
import LensBar from "./LensBar";
import TabBar from "./TabBar";
import ThemeSwitch from "./ThemeSwitch";
import WeekPicker from "./WeekPicker";
import type { Competition } from "../lib/competitions";

type Props = {
  competition?: Competition;
  meta: GridMeta | null;
  system: SystemStatus | null;
  current?: "control";
  /** The app-wide week. Every page computes it the same way (`lib/weeks.weekContext`). */
  week?: { weeks: Week[]; current: Week | null; now: Week | null };
};

export default function SiteNav({ meta, system, current, week, competition }: Props) {
  return (
    <>
      <NavigationComplete />
      <nav className="nav">
        <div className="nav-inner">
          <Link href="/" className="brand" aria-label="Sofix home">
            <div className="brand-mark" />
            <span className="brand-name">Sofix</span>
          </Link>
          <NavLinks weekId={week?.current?.id} />
          <div className="nav-meta">
            {week ? <WeekPicker weeks={week.weeks} current={week.current} now={week.now} competition={competition} /> : null}
            <StatusPill syncedAt={meta?.last_synced_at ?? meta?.last_predicted_at ?? null} system={system} current={current === "control"} />
            <PlayerSearch />
            <ThemeSwitch />
          </div>
        </div>
      </nav>
      <LensBar weekId={week?.current?.id} />
      <TabBar weekId={week?.current?.id} />
    </>
  );
}
