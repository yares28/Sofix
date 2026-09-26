"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWeekSuffix } from "../../lib/navWeek";

const PAGES = [
  { href: "/play", label: "Play" },
  { href: "/cards", label: "My cards" },
  { href: "/players", label: "Players" },
] as const;

/** The Sorare pages, as a segmented sub-nav shared by Play, My cards and Player search. */
export default function SorareSubnav() {
  const path = usePathname();
  const week = useWeekSuffix();
  return (
    <nav className="s5-tabs" aria-label="Sorare pages">
      {PAGES.map((page) => (
        <Link
          key={page.href}
          href={`${page.href}${week}`}
          aria-current={path === page.href ? "page" : undefined}
        >
          {page.label}
        </Link>
      ))}
    </nav>
  );
}
