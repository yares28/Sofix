"use client";

import { useState } from "react";
import { REFRESH_HEADER } from "../../lib/refresh";

/** Starts the League history workflow now; the line beside it updates when the run ends (about five minutes). */
export default function LeagueButton() {
  const [said, setSaid] = useState<string | null>(null);
  const start = async () => {
    setSaid("Starting…");
    try {
      const response = await fetch("/api/league-history", { method: "POST", headers: { [REFRESH_HEADER]: "1" } });
      const body = (await response.json()) as { error: string | null };
      setSaid(response.ok ? "Started · about 5 min" : (body.error ?? "Could not start"));
    } catch {
      setSaid("Could not start");
    }
  };
  return (
    <span className="cc-league">
      <button type="button" className="cc-btn soft" onClick={start} disabled={said === "Starting…" || said === "Started · about 5 min"}>
        Read now
      </button>
      {said ? <span role="status">{said}</span> : null}
    </span>
  );
}
