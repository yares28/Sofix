"use client";

import { useState } from "react";
import { essenceName } from "../../lib/play";
import { REFRESH_HEADER } from "../../lib/refresh";
import { Essence } from "./bits";

/**
 * The essence the plans fill first (the owner, 6 Oct 2026): LaLiga, then Champion, then All Star unless he changes it. Plans are made
 * by the job, so saving starts a refresh and the new order shows once it has run.
 */
export default function EssenceOrder({ saved, kinds }: { saved: string[]; kinds: (string | undefined)[] }) {
  // the saved order first, then any other kind this week's competitions pay
  const known = [...new Set([...saved, ...kinds.filter((kind): kind is string => Boolean(kind))])];
  const [order, setOrder] = useState(known);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const changed = order.some((kind, i) => kind !== known[i]);

  const move = (i: number, by: -1 | 1) => {
    const next = [...order];
    [next[i], next[i + by]] = [next[i + by]!, next[i]!];
    setOrder(next);
    setState("idle");
  };

  const save = async () => {
    setState("saving");
    const response = await fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json", [REFRESH_HEADER]: "1" },
      body: JSON.stringify({ essenceOrder: order }),
      cache: "no-store",
    }).catch(() => null);
    setState(response?.ok ? "saved" : "error");
  };

  return (
    <div className="pl-ess" role="group" aria-label="Essence filled first">
      <span className="pl-ess-l">
        <Essence size={12} /> Essence first
      </span>
      <ol>
        {order.map((kind, i) => (
          <li key={kind}>
            <span>{essenceName(kind)}</span>
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${essenceName(kind)} up`}>
              ↑
            </button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={`Move ${essenceName(kind)} down`}>
              ↓
            </button>
          </li>
        ))}
      </ol>
      {changed || state !== "idle" ? (
        <button type="button" className="pl-ess-save" onClick={save} disabled={state === "saving" || state === "saved"}>
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Save and replan"}
        </button>
      ) : null}
      <span className="pl-ess-n" role="status">
        {state === "saved" ? "The plans follow it after the refresh (about 6 min)" : state === "error" ? "Not saved, try again" : ""}
      </span>
    </div>
  );
}
