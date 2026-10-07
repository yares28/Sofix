"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { askExtension, extensionAtLeast, MISSIONS_EXTENSION_VERSION, parseMissionsLoad, pingExtension } from "../../lib/extension";
import { missionsLoadNote } from "../../lib/missions";

/** Where the page stands with the extension: still asking, none in this browser, one too old to load, or one that can. */
type Reach = "asking" | "none" | "old" | "ready";

/** How long a load may take. */
const LOAD_MS = 25_000;

/**
 * Loads today's missions from Sorare through the extension (read only): by itself once when the page opens with an older list, and whenever the
 * button is pressed. It needs a sorare.com tab open in this browser and never opens one.
 */
export default function LoadMissions({ stale, day }: { stale: boolean; day: string }) {
  const router = useRouter();
  const [reach, setReach] = useState<Reach>("asking");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const started = useRef(false);

  const load = useCallback(
    async () => {
      setBusy(true);
      setNote("Asking Sorare…");
      const answer = parseMissionsLoad(await askExtension({ type: "load-missions" }, LOAD_MS));
      setBusy(false);
      setNote(missionsLoadNote(answer));
      if (answer?.state === "ok") router.refresh();
    },
    [router],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const ping = await pingExtension();
      const next: Reach = !ping ? "none" : extensionAtLeast(ping.version, MISSIONS_EXTENSION_VERSION) ? "ready" : "old";
      setReach(next);
      if (next !== "ready" || !stale) return;
      // Once a mission day, so a load that finds nothing new never loops.
      const key = `sofix:missions-auto:${day}`;
      try {
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
      } catch {
        // no storage (a private window): load anyway, this page view only
      }
      await load();
    })();
  }, [day, load, stale]);

  if (reach === "asking") return null;
  if (reach === "old") return <p className="ms-load-note">Reload the Sofix extension to load missions from here.</p>;
  return (
    <div className="ms-load">
      <button type="button" className="ms-load-btn" onClick={() => void load()} disabled={busy} aria-busy={busy}>
        {busy ? "Loading…" : "Load today’s missions"}
      </button>
      <p className="ms-load-note" role="status" aria-live="polite">
        {note ?? (reach === "none" ? "Couldn’t reach the Sofix extension in this browser. Press Load to try again." : null)}
      </p>
    </div>
  );
}
