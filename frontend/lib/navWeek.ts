"use client";

import { useSearchParams } from "next/navigation";

/**
 * The week in the address, for the links in the bars.
 *
 * One week drives every page, so moving between them has to keep it: pick a week on Play, open Fixtures, and
 * it is still that week rather than the board's own default. The picker sets it with a real navigation, so
 * Next's search params carry it; the board's own `history.replaceState` only has to leave it alone
 * (hooks/useViewState.ts).
 */
export function useWeekSuffix(): string {
  const week = useSearchParams().get("w");
  return week ? `?w=${encodeURIComponent(week)}` : "";
}
