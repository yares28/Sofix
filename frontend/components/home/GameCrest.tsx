"use client";

import { useState } from "react";
import SorareImage from "../play/SorareImage";

/**
 * A club's crest in a fixed tile. A quiet grey shield holds its place until the crest has loaded and stays when there is
 * none (a national team with no badge, a picture that fails), so a fixture drawn only with crests is never missing a side.
 * Decorative: the fixture row's own label names both clubs.
 */
export default function GameCrest({ src, name, mine = false, size = 28 }: { src: string | null; name: string; mine?: boolean; size?: number }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: Math.round(size * 1.1) };
  return (
    <span className={mine ? "hm-crest mine" : "hm-crest"} title={name} aria-hidden="true">
      <span className="hm-crest-art" style={box}>
        <svg className="hm-crest-fb" viewBox="0 0 24 26" width={size} height={box.height} style={{ opacity: loaded ? 0 : 1 }}>
          <path d="M12 1l10 4v8c0 6.5-4.4 10.6-10 12C6.4 23.6 2 19.5 2 13V5z" fill="#c7c7cc" />
          <path d="M12 1l10 4v8c0 6.5-4.4 10.6-10 12z" fill="rgba(255,255,255,0.35)" />
        </svg>
        {failed ? null : <SorareImage src={src} width={size} height={box.height} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />}
      </span>
    </span>
  );
}
