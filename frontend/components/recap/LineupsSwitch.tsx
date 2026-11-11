"use client";

import { createContext, useCallback, useContext, useId, useState, type ReactNode } from "react";

/** Entered lineups tell the switch how many there are once read, so its tab can say it and an empty side never opens first. */
const EnteredCount = createContext<((count: number) => void) | null>(null);
export const useEnteredCount = () => useContext(EnteredCount);

/**
 * Your lineups: what you entered on Sorare, or the Sofix plan, one at a time. Both stay mounted (the entered read feeds the hero's
 * numbers); the other is only hidden. When the read finds nothing entered, the plan shows instead, unless you picked a side.
 */
export default function LineupsSwitch({ entered, plan, planCount }: { entered: ReactNode | null; plan: ReactNode; planCount: number }) {
  const [picked, setPicked] = useState<"entered" | "plan" | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const report = useCallback((n: number) => setCount(n), []);
  const id = useId();
  const tab = picked ?? (entered && count !== 0 ? "entered" : "plan");
  const tabs = [
    ...(entered ? [{ key: "entered" as const, label: `Entered${count ? ` · ${count}` : ""}` }] : []),
    { key: "plan" as const, label: `Sofix plan${planCount ? ` · ${planCount}` : ""}` },
  ];
  return (
    <EnteredCount.Provider value={report}>
      {tabs.length > 1 ? (
        <div className="rx-seg" role="tablist" aria-label="Whose lineups">
          {tabs.map((t) => (
            <button key={t.key} type="button" role="tab" id={`${id}-${t.key}`} aria-selected={tab === t.key} aria-controls={`${id}-${t.key}-panel`} className={tab === t.key ? "on" : undefined} onClick={() => setPicked(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      ) : null}
      {entered ? <div role="tabpanel" id={`${id}-entered-panel`} aria-labelledby={`${id}-entered`} hidden={tab !== "entered"}>{entered}</div> : null}
      <div role="tabpanel" id={`${id}-plan-panel`} aria-labelledby={`${id}-plan`} hidden={tab !== "plan"}>{plan}</div>
    </EnteredCount.Provider>
  );
}
