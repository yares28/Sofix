"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWeekSuffix } from "../lib/navWeek";
import { PLACES, placeOf } from "../lib/places";

const ICONS: Record<string, React.ReactNode> = {
  "/": <path d="M3.5 10 11 4l7.5 6v7.5a1 1 0 0 1-1 1H14v-5H8v5H4.5a1 1 0 0 1-1-1Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
  "/cards": (
    <>
      <rect x="4" y="3.5" width="10" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16.5 6.5 18.5 7l-2.6 11.5-2-.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </>
  ),
  "/fixtures": (
    <>
      <rect x="3.5" y="4.5" width="15" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 9h15M8 3v3M14 3v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  "/season": (
    <>
      <rect x="3.5" y="3.5" width="6" height="6" rx="1.8" fill="currentColor" />
      <rect x="12.5" y="3.5" width="6" height="6" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3.5" y="12.5" width="6" height="6" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="12.5" y="12.5" width="6" height="6" rx="1.8" fill="currentColor" opacity=".45" />
    </>
  ),
  "/table": <path d="M4 6h14M4 11h14M4 16h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
  "/lineups": (
    <>
      <rect x="3.5" y="4" width="15" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 11h15" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="11" cy="11" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </>
  ),
  "/play": (
    <>
      <rect x="6" y="3" width="10" height="16" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 15h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  "/audit": (
    <>
      <circle cx="11" cy="11" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="m7.6 11.2 2.5 2.5 4.4-4.9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

const TABS = PLACES.map((place) => ({ href: place.href, label: place.label }));

/**
 * Phones: the four places along the bottom, like an app (the installed app has no browser bar). Rendered outside the
 * top bar on purpose: its backdrop-filter would trap a fixed element inside it.
 */
export default function TabBar() {
  const path = usePathname();
  const week = useWeekSuffix(); // the week you picked comes with you
  return (
    <nav className="tabbar" aria-label="Sections">
      {TABS.map((tab) => (
        <Link key={tab.href} href={`${tab.href}${week}`} aria-current={placeOf(path)?.href === tab.href ? "page" : undefined}>
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
            {ICONS[tab.href]}
          </svg>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
