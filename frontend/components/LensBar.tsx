"use client";

import Link from "./navigation/NavigationLink";
import { useSearchParams } from "next/navigation";
import { competitionOf, COMPETITIONS } from "../lib/competitions";
import { useWeekSuffix } from "../lib/navWeek";
import { useNavigationPath } from "./navigation/NavigationProvider";
import LinkPending from "./LinkPending";
import { placeOf, viewOf } from "../lib/places";

/** The page-wide switch under the top bar: the views of the current place. Hidden where a place has one view. */
export default function LensBar({ weekId }: { weekId?: string }) {
  const path = useNavigationPath();
  const competition = competitionOf(useSearchParams().get("league"));
  const week = useWeekSuffix(weekId);
  const place = placeOf(path);
  if (!place || place.views.length < 2) return null;
  const view = viewOf(place, path);
  return (
    <div className="lens">
      <nav className="lens-seg" aria-label={place.label}>
        {place.views.map((v) => (
          <Link key={v.href} href={v.href.includes("#") ? v.href.replace("#", `${week}#`) : `${v.href}${week}`} aria-current={view === v ? "page" : undefined}>
            {v.href === "/fixtures" ? COMPETITIONS[competition] : v.label}
            <LinkPending />
          </Link>
        ))}
      </nav>
    </div>
  );
}
