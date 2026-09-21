import Link from "next/link";
import type { SystemStatus } from "../lib/control";
import type { GridMeta } from "../lib/types";
import StatusPill from "./StatusPill";

type Props = { meta: GridMeta | null; system: SystemStatus | null; current?: "control" };

export default function SiteNav({ meta, system, current }: Props) {
  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/" className="brand" aria-label="Sofix home">
          <div className="brand-mark" />
          <span className="brand-name">Sofix</span>
        </Link>
        <div className="nav-meta">
          <StatusPill syncedAt={meta?.last_synced_at ?? meta?.last_predicted_at ?? null} system={system} current={current === "control"} />
        </div>
      </div>
    </nav>
  );
}
