"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { REFRESH_HEADER, refreshLabel, viewAfterPoll, viewAfterStart, type RefreshView } from "../lib/refresh";
import type { ApiResponse, RefreshStatus } from "../lib/types";
import DataAction from "./ui/DataAction";

// Each poll is a billed function call and a refresh takes minutes: every 2 s was 84 calls an hour (27 Oct 2026).
const pollAfter = (elapsedMs: number) => (elapsedMs < 30_000 ? 3_000 : 15_000);
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
    let timer = 0;
    const poll = async () => {
      if (Date.now() - startedAt > GIVE_UP_MS) {
        setView({ kind: "failed", message: "The refresh is taking too long.", availableAt: Date.now() });
        return;
      }
      // A hidden tab does not ask (AGENTS.md "Pages"); the next tick after it is shown again does.
      if (document.visibilityState === "visible") {
        try {
          const { status, body } = await callRefresh("GET");
          if (!cancelled) setView(viewAfterPoll(status, body, Date.now()));
        } catch {
          // a dropped poll is retried on the next tick
        }
      }
      if (!cancelled) timer = window.setTimeout(poll, pollAfter(Date.now() - startedAt));
    };
    timer = window.setTimeout(poll, pollAfter(0));
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
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
      <DataAction
        label={refreshLabel(view, now)}
        busy={busy}
        onClick={start}
        disabled={disabled}
        title={message ?? refreshLabel(view, now)}
        aria-describedby={message ? "refresh-message" : undefined}
      />
      <span role="status" aria-live="polite">
        {view.kind !== "idle" ? message ?? refreshLabel(view, now) : ""}
      </span>
      {message && (
        <span id="refresh-message" className="visually-hidden">
          {message}
        </span>
      )}
    </span>
  );
}
