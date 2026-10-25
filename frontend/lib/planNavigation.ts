import type { PlanBy } from "./play";

/** Preserve bookmarks while moving the planning alternatives out of Play. */
export function alternativeAddress(values: Record<string, unknown>): string {
  const params = new URLSearchParams({ view: "plans" });
  for (const key of ["w", "gw", "plan", "by", "after"]) if (typeof values[key] === "string") params.set(key, values[key]);
  return `/audit/strategies?${params}`;
}

export function planAddress({ w, gw, by = "sofix", index, after = false, alternatives }: { w?: string; gw: string; by?: PlanBy; index?: number; after?: boolean; alternatives: boolean }): string {
  const params = new URLSearchParams(alternatives ? { view: "plans" } : {});
  if (w) params.set("w", w); else params.set("gw", gw);
  if (alternatives) {
    if (by !== "sofix") params.set("by", by);
    if (index !== undefined) params.set("plan", String(index + 1));
    if (after) params.set("after", "1");
  }
  return `${alternatives ? "/audit/strategies" : "/play"}?${params}`;
}
