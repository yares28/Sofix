"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PlayingPlayer } from "../../lib/play";
import type { ProRebuild as Rebuild } from "../../lib/playData";
import { REFRESH_HEADER } from "../../lib/refresh";
import Lineup from "./Lineup";

const clock = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));

/**
 * Under a Pro lineup of the plan: "Load from Sorare" reads the announced elevens and starts the rebuild (pro-rebuild.yml); the rebuilt
 * lineup then sits here, beside Sofix's, with the swaps named. It never replaces the plan (the owner, 20 Oct 2026).
 */
export default function ProRebuild({ comp, week, plan, rebuild, players }: { comp: string; week: string; plan: number; rebuild: Rebuild | null; players: PlayingPlayer[] }) {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; said: string | null }>({ busy: false, said: null });
  const mine = rebuild?.plan === plan ? rebuild : null;
  const lineup = mine?.lineups.find((lu) => lu.comp === comp);
  const missing = mine?.missing.find((m) => m.comp === comp);

  async function load() {
    setState({ busy: true, said: "Reading the elevens on Sorare…" });
    try {
      const response = await fetch("/api/pro-rebuild", { method: "POST", headers: { "content-type": "application/json", [REFRESH_HEADER]: "1" }, body: JSON.stringify({ week, plan }) });
      const body = (await response.json()) as { success: boolean; data: { games: number; starters: number; bench: number } | null; error: string | null };
      if (!body.success) return setState({ busy: false, said: body.error ?? "The rebuild did not start." });
      const d = body.data!;
      setState({ busy: true, said: `${d.games} eleven${d.games === 1 ? "" : "s"} out: ${d.starters} of your players start, ${d.bench} on the bench. Rebuilding, about a minute…` });
      setTimeout(() => { router.refresh(); setState({ busy: false, said: null }); }, 75_000); // one reload when the job is done, no polling
    } catch {
      setState({ busy: false, said: "Sofix could not reach Sorare or GitHub." });
    }
  }

  return (
    <div className="pl-rebuild">
      <div className="pl-rebuild-bar">
        <span>
          {lineup ? <b>{`Rebuilt at ${clock(mine!.at)} on the announced elevens`}</b> : missing ? `Rebuilt at ${clock(mine!.at)}: ${missing.why}.` : "Teams out? Rebuild this lineup on who actually starts."}
        </span>
        <button type="button" className="pl-rebuild-btn" onClick={load} disabled={state.busy}>
          {state.busy ? "Loading…" : "Load from Sorare"}
        </button>
      </div>
      {state.said ? <p className="pl-rebuild-said" role="status">{state.said}</p> : null}
      {lineup ? (
        <>
          <p className="pl-rebuild-swaps">
            {lineup.swaps.length
              ? lineup.swaps.map((s) => `${s.out} ${s.why} → ${s.in}`).join(" · ")
              : "Same five as Sofix's lineup: they all start."}
          </p>
          <Lineup lineup={lineup} after={false} index={900} players={players} />
        </>
      ) : null}
    </div>
  );
}
