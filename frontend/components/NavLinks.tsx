"use client";

import Link from "./navigation/NavigationLink";

import { useWeekSuffix } from "../lib/navWeek";
import { useNavigationPath } from "./navigation/NavigationProvider";
import LinkPending from "./LinkPending";
import { PLACES, placeOf } from "../lib/places";

/**
 * The four places in the top bar (PC). Client-side so it follows the board's own tab switches, which rewrite the
 * path without a navigation (hooks/useViewState.ts); usePathname picks those up.
 */
export default function NavLinks({ weekId }: { weekId?: string }) {
  const path = useNavigationPath();
  const week = useWeekSuffix(weekId); // the week you picked comes with you
  const current = placeOf(path);
  return (
    <div className="nav-links">
      {PLACES.map((place) => (
        <Link key={place.label} href={`${place.href}${week}`} aria-current={current === place ? "page" : undefined}>
          {place.label}
          <LinkPending />
        </Link>
      ))}
    </div>
  );
}
