"use client";

import Image from "next/image";
import { useState } from "react";

/** Futbol Fantasy's photo of a player, by his number on its pages; gone (the drawn silhouette shows) when it does not load. */
export const photoOf = (ffId: string) => `https://static.futbolfantasy.com/uploads/images/jugadores/ficha/${encodeURIComponent(ffId)}.png`;

export default function FacePhoto({ ffId }: { ffId: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !/^\d+$/.test(ffId)) return null;
  return (
    <Image
      className="lu-photo"
      src={photoOf(ffId)}
      alt=""
      width={120}
      height={120}
      unoptimized
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
