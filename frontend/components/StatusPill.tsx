"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pulseOf, type SystemStatus } from "../lib/control";
import { relativeTime } from "../lib/grid";
import ControlCenter from "./ControlCenter";

type Props = { syncedAt: string | null; system: SystemStatus | null; refreshEnabled: boolean };

const LABEL = { good: "All good", stale: "Data is old", failed: "Refresh failed" } as const;

/** The heartbeat in the top bar. Times depend on the viewer's clock, so they appear after hydration. */
export default function StatusPill({ syncedAt, system, refreshEnabled }: Props) {
  const [now, setNow] = useState<Date | null>(null);
  const [open, setOpen] = useState(false);
  const pill = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    pill.current?.focus();
  }, []);

  const pulse = now ? pulseOf(system, syncedAt, now) : null;
  const updated = now && syncedAt ? relativeTime(syncedAt, now) : null;

  return (
    <>
      <button
        ref={pill}
        type="button"
        className={`status-pill ${pulse?.state ?? ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <svg className="beat" viewBox="0 0 22 14" aria-hidden="true">
          <path d="M1 7h5l2-5 3 10 2-5h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{pulse ? LABEL[pulse.state] : "Status"}</span>
        {updated && <small>· updated {updated}</small>}
      </button>
      {open && now && <ControlCenter now={now} syncedAt={syncedAt} system={system} refreshEnabled={refreshEnabled} onClose={close} />}
    </>
  );
}
