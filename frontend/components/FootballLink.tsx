"use client";
import Link from "./navigation/NavigationLink";
import type { ComponentProps } from "react";
import { useWeekSuffix } from "../lib/navWeek";
import { usePathname } from "next/navigation";

/** Football details keep the selected league and date when opened in another tab. */
export default function FootballLink(props: ComponentProps<typeof Link>) {
  const suffix = useWeekSuffix();
  const pathname = usePathname();
  let href = props.href;
  if (typeof href === "string" && href.startsWith("/")) {
    const url = new URL(href, "http://sofix.local");
    new URLSearchParams(suffix.slice(1)).forEach((value, key) => {
      if (key === "league" && !["/fixtures", "/difficulty", "/table", "/season"].includes(pathname) && !pathname.startsWith("/team/")) return;
      if (!url.searchParams.has(key)) url.searchParams.set(key, value);
    });
    href = `${url.pathname}${url.search}${url.hash}`;
  }
  return <Link {...props} href={href} />;
}
