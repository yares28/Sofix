"use client";

import { useEffect, useState } from "react";
import { relativeTime } from "../lib/grid";

/** Relative time depends on the viewer's clock, so render it after hydration. */
export default function UpdatedAt({ iso }: { iso: string }) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    const update = () => setLabel(relativeTime(iso));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [iso]);
  return <time dateTime={iso}>{label ?? ""}</time>;
}
