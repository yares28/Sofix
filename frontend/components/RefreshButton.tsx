"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { REFRESH_HEADER, refreshLabel, viewAfterPoll, viewAfterStart, type RefreshView } from "../lib/refresh";
import type { ApiResponse, RefreshStatus } from "../lib/types";

const POLL_MS = 2000;
const DONE_MS = 4000;
const GIVE_UP_MS = 20 * 60_000; // the API releases a run as abandoned after 15 min

async function callRefresh(method: "GET" | "POST") {
  const response = await fetch("/api/refresh", { method, headers: { [REFRESH_HEADER]: "1" }, cache: "no-store" });
  const body = (await response.json().catch(() => null)) as ApiResponse<RefreshStatus> | null;
  return { status: response.status, body };
}

export default function RefreshButton() {
  const router = useRouter();
  const [view, setView] = useState<RefreshView>({ kind: "idle" });
  const [now, setNow] = useState(() => Date.now());

  const running = view.kind === "running";
  useEffect(() => {
    if (!running) return;
    const startedAt = Date.now();
    let cancelled = false;
    const timer = window.setInterval(async () => {
      if (Date.now() - startedAt > GIVE_UP_MS) {
        setView({ kind: "failed", message: "The refresh is taking too long.", availableAt: Date.now() });
        return;
      }
      try {
        const { status, body } = await callRefresh("GET");
        if (!cancelled) setView(viewAfterPoll(status, body, Date.now()));
      } catch {
        // a dropped poll is retried on the next tick
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [running]);

  useEffect(() => {
    if (view.kind === "done") {
      router.refresh(); // the route handler already revalidated the cached grid
      const timer = window.setTimeout(() => setView({ kind: "cooldown", availableAt: view.availableAt }), DONE_MS);
      return () => window.clearTimeout(timer);
    }
    if (view.kind === "cooldown" || view.kind === "failed") {
      const tick = () => {
        const current = Date.now();
        setNow(current);
        if (view.kind === "cooldown" && current >= view.availableAt) setView({ kind: "idle" });
      };
      tick();
      const timer = window.setInterval(tick, 15_000);
      return () => window.clearInterval(timer);
    }
  }, [view, router]);

  async function start() {
    setView({ kind: "starting" });
    try {
      const { status, body } = await callRefresh("POST");
      setView(viewAfterStart(status, body, Date.now()));
    } catch {
      setView({ kind: "failed", message: "Could not reach the server.", availableAt: Date.now() });
    }
  }

  const busy = view.kind === "starting" || view.kind === "running";
  const disabled = busy || view.kind === "done" || view.kind === "cooldown";
  const message = view.kind === "failed" ? view.message : undefined;

  return (
    <span className="refresh">
      <button
        type="button"
        className={`refresh-button${busy ? " busy" : ""}${view.kind === "failed" ? " failed" : ""}`}
        onClick={start}
        disabled={disabled}
        title={message}
        aria-describedby={message ? "refresh-message" : undefined}
      >
        <svg aria-hidden="true" width="13" height="13" viewBox="0 0 16 16" className="refresh-icon">
          <path
            d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89M13.5 2.5v3h-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {refreshLabel(view, now)}
      </button>
      <span className="visually-hidden" role="status" aria-live="polite">
        {busy || view.kind === "done" ? refreshLabel(view, now) : ""}
      </span>
      {message && (
        <span id="refresh-message" className="visually-hidden">
          {message}
        </span>
      )}
    </span>
  );
}
