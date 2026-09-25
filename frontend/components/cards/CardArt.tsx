"use client";

import { useState } from "react";
import { initials } from "../../lib/cards";
import SorareImage from "../play/SorareImage";

/**
 * A card's art with a graceful fallback: if the Sorare picture can't be fetched (offline, blocked, or an
 * environment that can't reach assets.sorare.com), the frame shows the player's initials instead of staying blank.
 */
export default function CardArt({ src, name }: { src: string | null | undefined; name: string }) {
  const [failed, setFailed] = useState(false);
  const usable = !!src && src.startsWith("https://assets.sorare.com/") && !failed;
  if (usable) {
    return <SorareImage src={src} fill onError={() => setFailed(true)} />;
  }
  return (
    <span className="s5-art-fallback" aria-hidden="true">
      {initials(name)}
    </span>
  );
}
