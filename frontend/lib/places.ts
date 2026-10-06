/**
 * The app's four places (top bar, phone bottom bar) and the views inside each (the page-wide switch under the top
 * bar). Restructure of 5 Oct 2026 (plans/restructure.md): every route keeps its address; the places group them.
 */
export type View = { href: string; label: string };
export type Place = { label: string; href: string; views: View[] };

export const PLACES: Place[] = [
  {
    label: "This week",
    href: "/",
    views: [
      { href: "/", label: "Recap" },
      { href: "/play", label: "Sorare" },
      { href: "/fixtures", label: "LaLiga" },
      { href: "/lineups", label: "Lineups" },
      { href: "/missions", label: "Missions" },
    ],
  },
  {
    label: "Season",
    href: "/season",
    views: [
      { href: "/season", label: "Fixtures" },
      { href: "/difficulty", label: "Difficulty" },
      { href: "/table", label: "Table" },
    ],
  },
  {
    label: "Gallery",
    href: "/cards",
    views: [
      { href: "/cards", label: "Cards" },
      { href: "/players", label: "Players" },
    ],
  },
  {
    label: "Audit",
    href: "/audit",
    views: [
      { href: "/audit", label: "xScore" },
      { href: "/audit/starts", label: "Who starts" },
      { href: "/audit/record", label: "Written down" },
      { href: "/audit/rewards", label: "Rewards" },
    ],
  },
];

const owns = (view: View, path: string) => (view.href === "/" ? path === "/" : path === view.href || path.startsWith(`${view.href}/`));

/** The place a path belongs to (team pages sit in Season), or null for pages outside the four (Control). */
export function placeOf(path: string): Place | null {
  if (path.startsWith("/team/")) return PLACES[1] ?? null;
  return PLACES.find((place) => place.views.some((view) => owns(view, path))) ?? null;
}

/** The view of a place a path shows. */
export function viewOf(place: Place, path: string): View | null {
  // The longest address that owns the path wins, so /audit/starts is "Who starts", not "xScore".
  return place.views.filter((view) => owns(view, path)).sort((a, b) => b.href.length - a.href.length)[0] ?? null;
}
