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
export function weekSuffix(search: Pick<URLSearchParams, "get">, resolvedWeek?: string): string {
  const params = new URLSearchParams();
  const day = search.get("w") || (search.get("gw") ? resolvedWeek : null);
  if (day) params.set("w", day);
  for (const key of ["end", "league"]) {
    const value = search.get(key);
    if (value) params.set(key, value);
  }
  return params.size ? `?${params}` : "";
}

export function useWeekSuffix(resolvedWeek?: string): string {
  return weekSuffix(useSearchParams(), resolvedWeek);
}
