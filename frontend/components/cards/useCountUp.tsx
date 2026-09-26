"use client";

import { useEffect, useState } from "react";

/**
 * Count a number up to its target once, after mount. It renders the final value on the server and on the first
 * client render (so hydration matches), then animates from zero — and stays put when the user asks for less
 * motion.
 */
export default function useCountUp(target: number, ms = 750): number {
  const [value, setValue] = useState(target);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    setValue(0);
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / ms);
      setValue(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}
