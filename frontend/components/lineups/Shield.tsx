"use client";

import Image from "next/image";
import { useState } from "react";
import { crestSource } from "../../lib/lineups";

// Club crests are hot-linked (personal use, no licence stated): the ones the board already shows, and Futbol Fantasy's for
// clubs the board does not keep (the Champions League's foreign clubs). Both hosts are in the Content-Security-Policy.

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * A club's crest, or a drawn shield in its colour with its code when there is no crest or it does not load. Decorative:
 * the club's name is always written beside it.
 */
export default function Shield({
  crest,
  color,
  code,
  width = 28,
}: {
  crest: string | null;
  color?: string;
  code: string;
  width?: number;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const height = Math.round(width * 1.1);
  const src = failed ? null : crestSource(crest);
  const fill = color && HEX.test(color) ? color : "#8e8e93";
  const shield = (
    <svg className="lu-crest lu-shield-fb" aria-hidden="true" width={width} height={height} viewBox="0 0 24 26" style={{ opacity: loaded ? 0 : 1 }}>
      <path d="M12 1l10 4v8c0 6.5-4.4 10.6-10 12C6.4 23.6 2 19.5 2 13V5z" fill={fill} />
      <path d="M12 1l10 4v8c0 6.5-4.4 10.6-10 12z" fill="rgba(255,255,255,0.22)" />
      {width >= 40 ? (
        <text x="12" y="15" textAnchor="middle" fontSize="5.6" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">
          {code}
        </text>
      ) : null}
    </svg>
  );
  // The shield in his colour holds the crest's place from the first paint and steps back once the crest is there; a crest that never
  // arrives leaves it. The room is the same either way, so nothing moves when it does.
  if (!src) return <span className="lu-shield" style={{ width, height }}>{shield}</span>;
  return (
    <span className="lu-shield" style={{ width, height }}>
      {shield}
      <Image
        src={src}
        alt=""
        width={width}
        height={height}
        unoptimized
        loading="lazy"
        referrerPolicy="no-referrer"
        className="lu-crest lu-crest-img"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </span>
  );
}
