"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const EVERY_MS = 5 * 60_000;
/** From the lock until three hours after the week's end (late games and Sorare's last scores). */
export const isPlaying = (from: string | null | undefined, to: string | null | undefined, now: number) =>
  !!from && !!to && Date.parse(from) <= now && now <= Date.parse(to) + 3 * 3_600_000;

/**
 * While a gameweek is being played, the page's data (published scores, rewards) is read again every five minutes, only while the
 * tab is in front, and once more when it comes back to the front (owner, 2 Nov 2026: the Recap's rewards card did not update in real
 * time). Outside the week, nothing runs. AGENTS.md "Pages": a timer runs minutes apart and only while its tab is visible.
 */
export default function LiveRefresh({ from, to }: { from: string | null | undefined; to: string | null | undefined }) {
  const router = useRouter();
  useEffect(() => {
    if (!from || !to) return;
    let last = Date.now();
    const tick = () => {
      if (document.visibilityState !== "visible" || !isPlaying(from, to, Date.now()) || Date.now() - last < EVERY_MS - 1000) return;
      last = Date.now();
      router.refresh();
    };
    const timer = window.setInterval(tick, EVERY_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [from, to, router]);
  return null;
}
