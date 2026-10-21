"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import { COMPETITIONS, competitionHref, type Competition } from "../lib/competitions";
const subscribe = () => () => {};

export default function CompetitionPicker({ competition, week, through }: { competition: Competition; week?: string; through?: string }) {
  const router = useRouter();
  const path = usePathname();
  const search = useSearchParams();
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(competition);
  return <div className="competition-picker">
    <label htmlFor="football-competition">Competition</label>
    <select id="football-competition" disabled={!ready || pending} aria-busy={pending} value={pending ? selected : competition} onChange={e => {
      const next = e.target.value as Competition;
      setSelected(next);
      startTransition(() => router.push(competitionHref(path, search.toString(), next, week, through), { scroll: false }));
    }}>
      {Object.entries(COMPETITIONS).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
    </select>
    {pending && <span className="visually-hidden" role="status">Loading {COMPETITIONS[selected]}…</span>}
  </div>;
}
