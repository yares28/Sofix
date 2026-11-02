"use client";

import { useState } from "react";
import type { NeedBadge } from "../lib/pointsNeeded";

/**
 * The points-needed pill at a lineup card's bottom right (lib/pointsNeeded.ts). Where the card is not itself a link or a button the
 * pill is a button: hover, keyboard focus or a tap opens its explanation. Inside a link or button it explains on hover and to a
 * screen reader only.
 */
export default function NeedPill({ badge, interactive = true }: { badge: NeedBadge; interactive?: boolean }) {
  const [open, setOpen] = useState(false);
  const words = badge.tone === "need" || badge.tone === "live" ? `Points needed ${badge.label}. ${badge.detail}` : badge.detail;
  return interactive
    ? <button type="button" className="need-pill" data-tone={badge.tone} data-open={open || undefined} aria-label={words} data-detail={badge.detail}
        onClick={() => setOpen((o) => !o)} onBlur={() => setOpen(false)}>{badge.label}</button>
    : <span className="need-pill" data-tone={badge.tone} title={badge.detail}><span aria-hidden="true">{badge.label}</span><span className="visually-hidden">{words}</span></span>;
}
