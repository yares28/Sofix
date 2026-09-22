"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS: Record<string, React.ReactNode> = {
  "/": <path d="M3.5 10 11 4l7.5 6v7.5a1 1 0 0 1-1 1H14v-5H8v5H4.5a1 1 0 0 1-1-1Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />,
  "/fixtures": (
    <>
      <rect x="3.5" y="4.5" width="15" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.5 9h15M8 3v3M14 3v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  "/difficulty": (
    <>
      <rect x="3.5" y="3.5" width="6" height="6" rx="1.8" fill="currentColor" />
      <rect x="12.5" y="3.5" width="6" height="6" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="3.5" y="12.5" width="6" height="6" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <rect x="12.5" y="12.5" width="6" height="6" rx="1.8" fill="currentColor" opacity=".45" />
    </>
  ),
  "/table": <path d="M4 6h14M4 11h14M4 16h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
};

const TABS = [
  { href: "/", label: "Home" },
  { href: "/fixtures", label: "Fixtures" },
  { href: "/difficulty", label: "Difficulty" },
  { href: "/table", label: "Table" },
];

/**
 * Phones: the sections along the bottom, like an app (the installed app has no browser bar). Rendered outside the
 * top bar on purpose: its backdrop-filter would trap a fixed element inside it.
 */
export default function TabBar() {
  const path = usePathname();
  return (
    <nav className="tabbar" aria-label="Sections">
      {TABS.map((tab) => (
        <Link key={tab.href} href={tab.href} aria-current={path === tab.href ? "page" : undefined}>
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
            {ICONS[tab.href]}
          </svg>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
