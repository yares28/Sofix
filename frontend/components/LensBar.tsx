"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWeekSuffix } from "../lib/navWeek";
import { placeOf, viewOf } from "../lib/places";

/** The page-wide switch under the top bar: the views of the current place. Hidden where a place has one view. */
export default function LensBar() {
  const path = usePathname();
  const week = useWeekSuffix();
  const place = placeOf(path);
  if (!place || place.views.length < 2) return null;
  const view = viewOf(place, path);
  return (
    <div className="lens">
      <nav className="lens-seg" aria-label={place.label}>
        {place.views.map((v) => (
          <Link key={v.href} href={`${v.href}${week}`} aria-current={view === v ? "page" : undefined}>
            {v.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
