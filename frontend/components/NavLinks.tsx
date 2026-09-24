"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWeekSuffix } from "../lib/navWeek";

export const SECTIONS = [
  { href: "/play", label: "Play" },
  { href: "/fixtures", label: "Fixtures" },
  { href: "/difficulty", label: "Difficulty" },
  { href: "/table", label: "Table" },
] as const;

/**
 * The board's pages in the top bar (PC). Client-side so it follows the board's own tab switches, which rewrite the
 * path without a navigation (hooks/useViewState.ts); usePathname picks those up.
 */
export default function NavLinks() {
  const path = usePathname();
  const week = useWeekSuffix(); // the week you picked comes with you
  return (
    <div className="nav-links">
      {SECTIONS.map((section) => (
        <Link key={section.href} href={`${section.href}${week}`} aria-current={path === section.href ? "page" : undefined}>
          {section.label}
        </Link>
      ))}
    </div>
  );
}
