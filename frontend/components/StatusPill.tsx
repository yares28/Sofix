"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PILL_LABEL, pulseOf, type SystemStatus } from "../lib/control";
import { relativeTime } from "../lib/grid";

type Props = { syncedAt: string | null; system: SystemStatus | null; current: boolean };

/**
 * The heartbeat in the top bar; it opens the Control Center page. Times depend on the viewer's clock, so they
 * appear after hydration.
 */
export default function StatusPill({ syncedAt, system, current }: Props) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const pulse = now ? pulseOf(system, syncedAt, now) : null;
  const updated = now && syncedAt ? relativeTime(syncedAt, now) : null;
  const label = pulse ? PILL_LABEL[pulse.state] : "Status";
  const name = updated ? `Control Center: ${label}, updated ${updated}` : `Control Center: ${label}`;

  return (
    <Link href="/control" className={`status-pill ${pulse?.state ?? ""}`} aria-label={name} aria-current={current ? "page" : undefined}>
      <svg className="beat" viewBox="0 0 22 14" aria-hidden="true">
        <path d="M1 7h5l2-5 3 10 2-5h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}
