"use client";

import { useNavigationRouter } from "./navigation/NavigationProvider";

import Link from "./navigation/NavigationLink";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { findPlayers, searchPlayerHref, type SearchPlayer } from "../lib/playerSearch";
import SorareImage from "./play/SorareImage";

// Read once per page load, when the search first opens; never refetched (Neon egress, AGENTS.md "Neon projects").
let index: Promise<SearchPlayer[]> | null = null;
const loadIndex = () => (index ??= fetch("/api/players").then((r) => (r.ok ? r.json() : [])).catch(() => { index = null; return []; }));

/** The top bar's search: a name opens his player page. */
export default function PlayerSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState<SearchPlayer[] | null>(null);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const router = useNavigationRouter();
  const search = useSearchParams();
  const list = useId();

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    loadIndex().then(setPlayers);
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const found = players ? findPlayers(players, query) : [];
  const go = (p: SearchPlayer | undefined) => {
    if (!p) return;
    setOpen(false);
    setQuery("");
    router.push(searchPlayerHref(p.slug, search));
  };
  const key = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, found.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(found[active]); }
    else if (e.key === "Escape") setOpen(false);
  };

  return (
    <div className="nav-search" ref={box}>
      <button type="button" className="theme-switch" aria-label="Search players" aria-expanded={open} title="Search players" onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
      </button>
      {open ? (
        <div className="nav-search-pop">
          <input
            ref={input}
            type="search"
            name="player-search"
            autoComplete="off"
            placeholder="Player name"
            aria-label="Player name"
            role="combobox"
            aria-expanded={found.length > 0}
            aria-controls={list}
            aria-activedescendant={found[active] ? `${list}-${active}` : undefined}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={key}
          />
          {query.trim() ? (
            found.length ? (
              <ul id={list} role="listbox" aria-label="Players">
                {found.map((p, i) => (
                  <li key={p.slug} id={`${list}-${i}`} role="option" aria-selected={i === active} onPointerEnter={() => setActive(i)}>
                    <Link href={searchPlayerHref(p.slug, search)} tabIndex={-1} onClick={() => { setOpen(false); setQuery(""); }}>
                      <span className="art"><SorareImage src={p.pic} width={24} height={39} /></span>
                      <span><b>{p.name}</b>{p.club ? <small>{p.club}</small> : null}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p role="status">{players ? "No player found" : "Loading players…"}</p>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
