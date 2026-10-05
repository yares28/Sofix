"use client";

import { useEffect } from "react";

/** Opens a long page on one element (the round in play), unless the address already names a place to go. */
export default function ScrollToRound({ id }: { id: string }) {
  useEffect(() => {
    if (!window.location.hash) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [id]);
  return null;
}
