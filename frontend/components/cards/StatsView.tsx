"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { leaders, statGroups, statValue, type StatPlayer } from "../../lib/statLeaders";
import SorareImage from "../play/SorareImage";
import CardArt from "./CardArt";

const STARTS = [3, 10, 20];
const PODIUM = 5;
/** Each group's colour: the stat word, the leader's step and the wall's numbers wear it, so a switch of group shows at once. */
const ACCENT: Record<string, string> = {
  Attacking: "#c2412a", Passing: "#1f5fc4", Defending: "#18734c", Goalkeeping: "#9a5b00", Bonuses: "#0d7480", "Mistakes and cards": "#b42318",
};
const accent = (group: string) => ({ "--sx-accent": ACCENT[group] ?? "#5e5e63" }) as CSSProperties;

function ClubMark({ player }: { player: StatPlayer }) {
  return player.crest ? <SorareImage className="sx-crest" src={player.crest} width={16} height={16} /> : <span className="sx-crest sx-shield" aria-hidden="true" />;
}

/** Stat leaders: a sentence picks the stat ("Most goals per start"), a staircase holds the first five, a wall of cards the next 45. */
export default function StatsView({ players, initial }: { players: StatPlayer[]; initial: { stat?: string; min?: string } }) {
  const groups = useMemo(() => statGroups(players), [players]);
  const flat = useMemo(() => groups.flatMap((g) => g.stats.map((s) => ({ ...s, group: g.name }))), [groups]);
  const [stat, setStat] = useState(flat.some((s) => s.key === initial.stat) ? initial.stat! : flat[0]!.key);
  const [min, setMin] = useState(STARTS.includes(Number(initial.min)) ? Number(initial.min) : 10);
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState("");
  const picker = useRef<HTMLDivElement>(null);
  const at = Math.max(0, flat.findIndex((s) => s.key === stat));
  const current = flat[at]!;
  const ranked = useMemo(() => leaders(players, stat, min), [players, stat, min]);
  const top = ranked[0]?.value || 1;

  // the choice is kept in the address, so a stat can be bookmarked or sent
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("stat", stat);
    url.searchParams.set("min", String(min));
    window.history.replaceState(window.history.state, "", url);
  }, [stat, min]);

  // the palette closes on a click anywhere else
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!picker.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const pick = (key: string) => {
    setStat(key);
    setOpen(false);
    setFind("");
  };
  const close = (event: { key: string }) => event.key === "Escape" && setOpen(false);
  const step = (by: number) => setStat(flat[(at + by + flat.length) % flat.length]!.key);
  const q = find.trim().toLowerCase();
  const shown = groups.map((g) => ({ ...g, stats: g.stats.filter((s) => !q || s.label.toLowerCase().includes(q)) })).filter((g) => g.stats.length);

  return (
    <div className="sx" style={accent(current.group)}>
      <section className="sx-hero">
        <div className="sx-ask" ref={picker}>
          <h1>
          <span>Most</span>{" "}
          <span className="sx-pickwrap">
            <button type="button" className="sx-stat" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
              <span aria-live="polite">{current.label}</span>
            </button>
          </span>
          {" "}
          <span className="sx-per">per start</span>
          </h1>
          <span className="sx-steps">
            <button type="button" className="sx-step" aria-label="Previous stat" onClick={() => step(-1)}>
              ‹
            </button>
            <button type="button" className="sx-step" aria-label="Next stat" onClick={() => step(1)}>
              ›
            </button>
          </span>
          {open ? (
            <span className="sx-palette" role="dialog" aria-label="Choose a stat">
              <label className="sx-find">
                <span className="visually-hidden">Find a stat</span>
                {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the palette opens to be typed in */}
                <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a stat…" autoFocus autoComplete="off" onKeyDown={close} />
              </label>
              <span className="sx-groups">
                {shown.map((g) => (
                  <span key={g.name} role="group" aria-label={g.name} style={accent(g.name)}>
                    <b>{g.name}</b>
                    {g.stats.map((s) => (
                      <button key={s.key} type="button" aria-pressed={s.key === stat} onClick={() => pick(s.key)} onKeyDown={close}>
                        {s.label}
                      </button>
                    ))}
                  </span>
                ))}
                {shown.length ? null : <span className="sx-none">No stat by that name.</span>}
              </span>
            </span>
          ) : null}
        </div>
        <p className="sx-sub">
          <span>{current.group}</span>
          <span id="sx-starts">players with</span>
          <span className="s5-seg" role="group" aria-labelledby="sx-starts">
            {STARTS.map((n) => (
              <button key={n} type="button" aria-pressed={min === n} onClick={() => setMin(n)}>
                {n}+
              </button>
            ))}
          </span>
          <span>starts</span>
        </p>
      </section>

      {ranked.length === 0 ? (
        <p className="s5-empty" role="status">No player with {min}+ starts has a number for {current.label.toLowerCase()} yet.</p>
      ) : (
        <>
          <ol className="sx-podium" key={`${stat}-${min}`} aria-label={`Top ${Math.min(PODIUM, ranked.length)} in ${current.label.toLowerCase()}`}>
            {ranked.slice(0, PODIUM).map((player, i) => (
              // the step's height is his number against the leader's
              <li key={player.slug} data-rank={i + 1} style={{ "--h": `${Math.round(80 + 140 * (player.value / top))}px`, animationDelay: `${i * 70}ms` } as CSSProperties}>
                <Link className="art" href={`/players/${player.slug}`} prefetch={false} aria-label={`${player.name}: open his page`}>
                  <CardArt src={player.pic} name={player.name} />
                </Link>
                <span className="sx-plinth">
                  <em aria-hidden="true">{i + 1}</em>
                  <b className="sx-value">{statValue(player.value)}</b>
                  <span className="sx-name">
                    <ClubMark player={player} />
                    <Link href={`/players/${player.slug}`} prefetch={false}>
                      {player.name}
                    </Link>
                  </span>
                  <small>{player.starts} starts</small>
                </span>
              </li>
            ))}
          </ol>

          {ranked.length > PODIUM ? (
            <>
              <h2 className="sx-next">
                The next {ranked.length - PODIUM} <span>6 to {ranked.length}</span>
              </h2>
              <ol className="sx-list" start={PODIUM + 1} key={`wall-${stat}-${min}`}>
                {ranked.slice(PODIUM).map((player, i) => (
                  <li key={player.slug} style={{ animationDelay: `${Math.min(i * 12, 360)}ms` }}>
                    <Link className="art" href={`/players/${player.slug}`} prefetch={false} aria-label={`${player.name}: open his page`}>
                      <CardArt src={player.pic} name={player.name} />
                    </Link>
                    <span className="sx-rank">{i + PODIUM + 1}</span>
                    <span className="sx-who">
                      <span className="sx-name">
                        <Link href={`/players/${player.slug}`} prefetch={false} title={`${player.name}, ${player.starts} starts`}>
                          {player.name}
                        </Link>
                      </span>
                      <b className="sx-value">{statValue(player.value)}</b>
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
