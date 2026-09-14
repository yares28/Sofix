import Link from "next/link";
import type { GridMeta } from "../lib/types";
import Freshness from "./Freshness";
import RefreshButton from "./RefreshButton";

export default function SiteNav({ meta }: { meta: GridMeta | null }) {
  const refreshEnabled = Boolean(process.env.REFRESH_TOKEN);
  return (
    <nav className="nav">
      <div className="nav-inner">
        <Link href="/" className="brand" aria-label="FixtureDiff home">
          <div className="brand-mark" />
          <span className="brand-name">FixtureDiff</span>
        </Link>
        <div className="nav-meta">
          <Freshness syncedAt={meta?.last_synced_at ?? null} predictedAt={meta?.last_predicted_at ?? null} />
          {refreshEnabled && <RefreshButton />}
        </div>
      </div>
    </nav>
  );
}
