"use client";

import { useState } from "react";
import { REFRESH_HEADER } from "../../lib/refresh";
import DataAction from "../ui/DataAction";

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
      <DataAction label="Read now" title="Read league game history" kind="board" onClick={start} busy={said === "Starting…"} disabled={said === "Started · about 5 min"} />
      {said ? <span role="status">{said}</span> : null}
    </span>
  );
}
