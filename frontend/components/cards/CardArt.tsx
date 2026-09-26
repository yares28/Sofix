"use client";

import Image from "next/image";
import { useState } from "react";
import { initials } from "../../lib/cards";
import SorareImage from "../play/SorareImage";

const SORARE_ORIGINS = ["https://assets.sorare.com/", "https://frontend-assets.sorare.com/"];

/**
 * A card's art, resilient in three stages:
 *  1. hot-link the Sorare picture directly (the app's normal behaviour);
 *  2. if that fails, load it through the same-origin proxy (/api/sorare-image) — for environments whose
 *     browser can't reach assets.sorare.com but can reach the app;
 *  3. if that also fails, show the player's initials instead of a blank frame.
 */
export default function CardArt({ src, name }: { src: string | null | undefined; name: string }) {
  const [stage, setStage] = useState<"direct" | "proxy" | "failed">("direct");
  const usable = !!src && SORARE_ORIGINS.some((origin) => src.startsWith(origin));

  if (!usable || stage === "failed") {
    return (
      <span className="s5-art-fallback" aria-hidden="true">
        {initials(name)}
      </span>
    );
  }
  if (stage === "direct") {
    return <SorareImage src={src} fill onError={() => setStage("proxy")} />;
  }
  return (
    <Image
      alt=""
      src={`/api/sorare-image?u=${encodeURIComponent(src!)}`}
      unoptimized
      fill
      sizes="120px"
      loading="lazy"
      referrerPolicy="no-referrer"
      style={{ objectFit: "cover" }}
      onError={() => setStage("failed")}
    />
  );
}
