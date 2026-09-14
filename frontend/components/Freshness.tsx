"use client";

import { useEffect, useState } from "react";
import { relativeTime } from "../lib/grid";
import { isStale, STALE_AFTER_HOURS } from "../lib/refresh";

/** "Updated 3 h ago", plus a warning pill when fixtures haven't been synced for a while.
 * Both depend on the viewer's clock, so they render after hydration. */
export default function Freshness({ syncedAt, predictedAt }: { syncedAt: string | null; predictedAt: string | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const shown = syncedAt ?? predictedAt;
  if (!shown) return null;
  const stale = now !== null && isStale(syncedAt, now);
  return (
    <>
      {stale && (
        <span className="stale-pill" title={`Fixtures were last synced more than ${STALE_AFTER_HOURS} hours ago.`}>
          Data may be out of date
        </span>
      )}
      <span>
        Updated <time dateTime={shown}>{now === null ? "" : relativeTime(shown, new Date(now))}</time>
      </span>
    </>
  );
}
