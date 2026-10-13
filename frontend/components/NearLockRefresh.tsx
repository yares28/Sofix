"use client";

import { useEffect } from "react";
import { REFRESH_HEADER } from "../lib/refresh";

const KEY = "sofix-near-lock-asked";
const EVERY_MS = 10 * 60_000;

/** Opening Sofix asks once per 10 minutes whether a lock is near; the server starts a refresh if so (it never waits for GitHub's clock). */
export default function NearLockRefresh() {
  useEffect(() => {
    try {
      if (Date.now() - Number(localStorage.getItem(KEY) ?? 0) < EVERY_MS) return;
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      return; // no storage: skip rather than ask on every page
    }
    void fetch("/api/refresh?near=1", { method: "POST", headers: { [REFRESH_HEADER]: "1" }, cache: "no-store" }).catch(() => undefined);
  }, []);
  return null;
}
