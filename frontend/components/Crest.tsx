"use client";

import Image from "next/image";
import { useState } from "react";
import { contrastRatio } from "../lib/contrast";
import type { GridTeam } from "../lib/types";

// Personal use only (club trademarks, no licence stated). Set NEXT_PUBLIC_SHOW_CLUB_CRESTS=false to show colour badges.
const SHOW_CRESTS = process.env.NEXT_PUBLIC_SHOW_CLUB_CRESTS !== "false";
const CREST_ORIGIN = "https://crests.football-data.org/";

/**
 * Black or white text, whichever contrasts more with the club colour. For pure black and white the better
 * of the two is always ≥ 4.58:1; a softer near-black can drop below 4.5 on mid reds (e.g. #ee2523).
 */
export function badgeText(background: string): string {
  try {
    return contrastRatio("#000000", background) >= contrastRatio("#ffffff", background) ? "#000" : "#fff";
  } catch {
    return "#fff"; // not a hex colour: the API validates colours, so this is only a safe default
  }
}

export function crestSource(url: string | null | undefined): string | null {
  // The API already allowlists the host; checked again because this ends up in an <img src>.
  return SHOW_CRESTS && url && url.startsWith(CREST_ORIGIN) ? url : null;
}

/**
 * The club crest on a white disc, or the colour badge with the club code when crests are off,
 * missing, or fail to load. Decorative: the team name is always next to it or in the control's label.
 */
export default function Crest({
  team,
  size = 28,
}: {
  team: Pick<GridTeam, "code" | "color" | "crest_url">;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const src = failed ? null : crestSource(team.crest_url);
  const box = { width: size, height: size };

  if (src) {
    const inner = Math.round(size * 0.72);
    return (
      <span className="crest crest-img" style={box} aria-hidden="true">
        <Image
          src={src}
          alt=""
          width={inner}
          height={inner}
          unoptimized // served straight from football-data.org; the Next image proxy would fetch it server-side
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  return (
    <span
      className="crest"
      style={{ ...box, background: team.color, color: badgeText(team.color) }}
      aria-hidden="true"
    >
      {team.code}
    </span>
  );
}
