/**
 * Players-tab filters on Arcade (owner, 30 Oct 2026): tier, L5, L10, L40, the day of the next game, and xScore.
 * L5 is Sorare's last-five average, L10 the last-ten-played average, L40 the last-forty average — the same three Gallery uses.
 */

/** The tier menu, in Sorare's order. Star+ is its own choice; any other plus tier uses the tier it sits above. */
export const TIER_OPTIONS = [
  ["icon", "Icon"],
  ["star+", "Star+"],
  ["star", "Star"],
  ["impact", "Impact"],
  ["roster", "Roster"],
  ["reserve", "Reserve"],
] as const;

const TIER_CHOICE: Record<string, (typeof TIER_OPTIONS)[number][0]> = {
  GOAT: "icon",
  STAR_PLUS: "star+",
  STAR: "star",
  IMPACT_PLUS: "impact",
  IMPACT: "impact",
  ROSTER_PLUS: "roster",
  ROSTER: "roster",
  DNP_PLUS: "reserve",
  DNP: "reserve",
};

/** Sorare's gameplay tier as the menu value, or null when Sorare gave none this menu names. */
export const tierChoice = (tier: string | null | undefined) => (tier ? TIER_CHOICE[tier] ?? null : null);

export const SCORE_CUTS = [40, 50, 60] as const;

/** A number menu: empty passes, "unknown" is a missing number, and a cut is the rounded number at or above it. Zero is a number. */
export function passesCut(value: number | null, cut: string): boolean {
  if (!cut) return true;
  if (cut === "unknown") return value === null;
  return value !== null && Math.round(value) >= Number(cut);
}

/** The Madrid day a filter stores (`2026-10-31`) as the menu shows it. */
export function dayLabel(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year!, (month ?? 1) - 1, date, 12)).toLocaleDateString("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export type CardPick = {
  tier: string | null;
  l5: number | null;
  l10: number | null;
  l40: number | null;
  /** Madrid date of the next game, "none" when the board has no game for him, null when the board's games were not read. */
  day: string | null;
  score: number | null;
};

export type CardFilters = { tier: string; l5: string; l10: string; l40: string; day: string; score: string };

/** The six Players filters. A day the board never read matches neither a date nor "no game". */
export function matchesPick(card: CardPick, pick: CardFilters): boolean {
  return (!pick.tier || card.tier === pick.tier)
    && passesCut(card.l5, pick.l5) && passesCut(card.l10, pick.l10) && passesCut(card.l40, pick.l40)
    && (!pick.day || card.day === pick.day)
    && passesCut(card.score, pick.score);
}
