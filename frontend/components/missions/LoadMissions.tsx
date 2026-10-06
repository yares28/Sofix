"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { askExtension, extensionAtLeast, MISSIONS_EXTENSION_VERSION, parseMissionsLoad, pingExtension } from "../../lib/extension";
import { missionsLoadNote } from "../../lib/missions";

/** Where the page stands with the extension: still asking, none in this browser, one too old to load, or one that can. */
type Reach = "asking" | "none" | "old" | "ready";

/** How long a load may take: it can open sorare.com in a background tab first. */
const LOAD_MS = 45_000;

/**
 * Loads today's missions from Sorare through the extension (read only): by itself once when the page opens with an older list, and whenever the
 * button is pressed. Pressing it may open sorare.com in a background tab for a moment; the automatic load never does.
 */
export default function LoadMissions({ stale, day }: { stale: boolean; day: string }) {
  const router = useRouter();
  const [reach, setReach] = useState<Reach>("asking");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const started = useRef(false);

  const load = useCallback(
    async (open: boolean) => {
      setBusy(true);
      setNote("Asking Sorare…");
      const answer = parseMissionsLoad(await askExtension({ type: "load-missions", open }, LOAD_MS));
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
      await load(false);
    })();
  }, [day, load, stale]);

  if (reach === "asking") return null;
  if (reach === "none") return <p className="ms-load-note">Load today&rsquo;s missions from Chrome with the Sofix extension.</p>;
  if (reach === "old") return <p className="ms-load-note">Reload the Sofix extension to load missions from here.</p>;
  return (
    <div className="ms-load">
      <button type="button" className="ms-load-btn" onClick={() => void load(true)} disabled={busy} aria-busy={busy}>
        {busy ? "Loading…" : "Load today’s missions"}
      </button>
      <p className="ms-load-note" role="status" aria-live="polite">
        {note}
      </p>
    </div>
  );
}
