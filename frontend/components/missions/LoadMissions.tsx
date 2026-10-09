"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { askExtension, extensionAtLeast, MISSIONS_EXTENSION_VERSION, parseMissionsLoad, pingExtension } from "../../lib/extension";
import { missionsLoadNote } from "../../lib/missions";

type Reach = "asking" | "none" | "old" | "ready";

/** Read-only. Recheck the installed build on retry so Reload in Chrome needs no Sofix page refresh. */
export default function LoadMissions({ stale, day }: { stale: boolean; day: string }) {
  const router = useRouter();
  const [reach, setReach] = useState<Reach>("asking");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const started = useRef(false);

  const load = useCallback(async () => {
    setBusy(true);
    setNote("Asking Sorare…");
    const answer = parseMissionsLoad(await askExtension({ type: "load-missions" }, 60_000));
    setBusy(false);
    setNote(missionsLoadNote(answer));
    if (answer?.state === "ok") {
      try { sessionStorage.setItem(`sofix:missions-auto:${day}`, "1"); } catch { /* no storage */ }
      router.refresh();
    }
  }, [router, day]);

  const check = useCallback(async () => {
    const ping = await pingExtension();
    setVersion(ping?.version ?? null);
    const next: Reach = !ping ? "none" : extensionAtLeast(ping.version, MISSIONS_EXTENSION_VERSION) ? "ready" : "old";
    setReach(next);
    return next;
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      if (await check() !== "ready" || !stale) return;
      try { if (sessionStorage.getItem(`sofix:missions-auto:${day}`)) return; } catch { /* this page view only */ }
      await load();
    })();
  }, [check, day, load, stale]);

  const retry = async () => {
    setBusy(true);
    const next = await check();
    if (next === "ready") await load();
    else {
      setBusy(false);
      setNote(next === "old" ? "The older build is still running. Reload Sofix in Chrome’s extension manager, then retry." : "Couldn’t reach the Sofix extension in this browser. Press Load to try again.");
    }
  };

  if (reach === "asking") return null;
  return <>
    <div className="ms-load">
      <button type="button" className="ms-load-btn" onClick={() => void retry()} disabled={busy} aria-busy={busy}>
        {busy ? "Loading…" : reach === "old" ? "Check extension and load" : "Load today's missions"}
      </button>
      <p className="ms-load-note" role="status" aria-live="polite">{note ?? (reach === "none" ? "Couldn’t reach the Sofix extension in this browser. Press Load to try again." : null)}</p>
    </div>
    {reach === "old" ? <div className="ms-extension-help">
      <p><b>Extension {version}</b> is running. Missions need {MISSIONS_EXTENSION_VERSION} or later.</p>
      <p>Press Reload on Sofix in <code>chrome://extensions</code>, reload Sorare, then try again. <Link href="/control">Extension setup</Link></p>
    </div> : null}
  </>;
}
