"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
import Image from "next/image";
import { COMPETITIONS, competitionHref, type Competition } from "../lib/competitions";
const subscribe = () => () => {};

export default function CompetitionPicker({ competition, week, through, icons = false }: { competition: Competition; week?: string; through?: string; icons?: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const search = useSearchParams();
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(competition);
  const choose = (next: Competition) => {
    setSelected(next);
    startTransition(() => router.push(competitionHref(path, search.toString(), next, week, through), { scroll: false }));
  };
  if (icons) return <div className="competition-icons" role="group" aria-label="Competition" aria-busy={pending}>
    {Object.entries(COMPETITIONS).map(([value, name]) => <button key={value} type="button" title={name}
      aria-label={name} aria-pressed={(pending ? selected : competition) === value} disabled={!ready || pending}
      onClick={() => choose(value as Competition)}>
      {value === "ALL" ? <span>All</span> : <CompetitionIcon competition={value as Competition} />}
    </button>)}
    {pending && <span className="visually-hidden" role="status">Loading {COMPETITIONS[selected]}…</span>}
  </div>;
  return <><div className="competition-picker">
    <label htmlFor="football-competition">Competition</label>
    <select id="football-competition" disabled={!ready || pending} aria-busy={pending} value={pending ? selected : competition} onChange={e => {
      const next = e.target.value as Competition;
      setSelected(next);
      startTransition(() => router.push(competitionHref(path, search.toString(), next, week, through), { scroll: false }));
    }}>
      {Object.entries(COMPETITIONS).filter(([value]) => value !== "ALL" || path === "/difficulty").map(([value, name]) => <option key={value} value={value}>{name}</option>)}
    </select>
    {pending && <span className="visually-hidden" role="status">Loading {COMPETITIONS[selected]}…</span>}
  </div>{competition === "CONF" && <p role="note">Conference FDR and xScore are provisional. Historical results are encouraging; the extra benefit of opponent information remains uncertain.</p>}</>;
}

export function CompetitionIcon({ competition }: { competition: Competition }) {
  const [failed, setFailed] = useState(false);
  const src = competition === "EL"
    ? "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/UEFA_Europa_League_logo_%282024_version%29.svg/250px-UEFA_Europa_League_logo_%282024_version%29.svg.png"
    : competition === "CONF"
      ? "https://upload.wikimedia.org/wikipedia/commons/4/4b/UEFA_Conference_League_full_logo_%282024_version%29.svg"
      : `https://crests.football-data.org/${competition}.png`;
  return failed ? <span>{competition}</span> : <Image src={src} alt="" width={26} height={30} unoptimized onError={() => setFailed(true)} />;
}
