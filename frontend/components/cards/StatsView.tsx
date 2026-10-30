"use client";

import Link from "../navigation/NavigationLink";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Position } from "../../lib/playerSheet";
import { fieldAverage, leaders, statGroups, statValue, type StatPlayer } from "../../lib/statLeaders";
import SorareImage from "../play/SorareImage";
import CardArt from "./CardArt";

const STARTS = [3, 10, 20];
const POSITIONS: { key: Position | ""; label: string }[] = [
  { key: "", label: "everyone" }, { key: "GK", label: "goalkeepers" }, { key: "DEF", label: "defenders" }, { key: "MID", label: "midfielders" }, { key: "FWD", label: "forwards" },
];
const PODIUM = 5;
const CLOSE = 10;
/** Each group's colour: the stat word, the steps and the cards' numbers wear it, so a switch of group shows at once. */
const ACCENT: Record<string, string> = {
  Attacking: "#c2412a", Passing: "#1f5fc4", Defending: "#18734c", Goalkeeping: "#9a5b00", Bonuses: "#0d7480", "Mistakes and cards": "#b42318",
};
const accent = (group: string) => ({ "--sx-accent": ACCENT[group] ?? "#5e5e63" }) as CSSProperties;
type Ranked = StatPlayer & { value: number };

function ClubMark({ player }: { player: StatPlayer }) {
  return player.crest ? <SorareImage className="sx-crest" src={player.crest} width={16} height={16} /> : <span className="sx-crest sx-shield" aria-hidden="true" />;
}

/** The leader's number counts up from nought each time the stat changes (at once under reduced motion). */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setShown(value);
    let frame = 0;
    const from = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - from) / 700);
      setShown(value * (1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{statValue(shown)}</>;
}

/** A card that opens the player's page, with his rank, his number and a mark when it is yours. */
function Card({ player, rank, order }: { player: Ranked; rank: number; order: number }) {
  return (
    <li className="sx-tile" style={{ "--i": Math.min(order, 30) } as CSSProperties}>
      <Link className="art" href={`/players/${player.slug}`} prefetch={false} aria-label={`${player.name}: open his page`}>
        <CardArt src={player.pic} name={player.name} />
        <b className="sx-value">{statValue(player.value)}</b>
      </Link>
      <span className="sx-rank">{rank}</span>
      <span className="sx-name">
        <ClubMark player={player} />
        <Link href={`/players/${player.slug}`} prefetch={false} title={`${player.name}, ${player.starts} starts`}>
          {player.name}
        </Link>
        {player.mine ? <span className="sx-yours">Yours</span> : null}
      </span>
    </li>
  );
}

/**
 * Stat leaders: a sentence picks the stat and who is ranked ("Most goals per start, among forwards with 10+ starts"), a staircase
 * holds the first five (1st on the left, each step as tall as his number against the leader's, a dashed line at the average),
 * big cards the next five, and a wall of cards ranks 11 to 50.
 */
export default function StatsView({ players, initial }: { players: StatPlayer[]; initial: { stat?: string; min?: string; pos?: string } }) {
  const groups = useMemo(() => statGroups(players), [players]);
  const flat = useMemo(() => groups.flatMap((g) => g.stats.map((s) => ({ ...s, group: g.name }))), [groups]);
  const [stat, setStat] = useState(flat.some((s) => s.key === initial.stat) ? initial.stat! : flat[0]!.key);
  const [min, setMin] = useState(STARTS.includes(Number(initial.min)) ? Number(initial.min) : 10);
  const [pos, setPos] = useState<Position | "">(POSITIONS.find((p) => p.key && p.key === initial.pos)?.key ?? "");
  const [open, setOpen] = useState(false);
  const [find, setFind] = useState("");
  const picker = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const at = Math.max(0, flat.findIndex((s) => s.key === stat));
  const current = flat[at]!;
  const ranked = useMemo(() => leaders(players, stat, min, pos || undefined), [players, stat, min, pos]);
  const average = useMemo(() => fieldAverage(players, stat, min, pos || undefined), [players, stat, min, pos]);
  const top = ranked[0]?.value || 1;
  const label = current.label.toLowerCase();
  const who = POSITIONS.find((p) => p.key === pos)!.label;

  // the choice is kept in the address, so a stat can be bookmarked or sent
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("stat", stat);
    url.searchParams.set("min", String(min));
    if (pos) url.searchParams.set("pos", pos);
    else url.searchParams.delete("pos");
    window.history.replaceState(window.history.state, "", url);
  }, [stat, min, pos]);

  // the palette closes on a click anywhere else
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!picker.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  // closing the palette by a pick or Escape hands focus back to the stat word
  const shut = () => {
    setOpen(false);
    opener.current?.focus();
  };
  const pick = (key: string) => {
    setStat(key);
    setFind("");
    shut();
  };
  const close = (event: { key: string }) => event.key === "Escape" && shut();
  const step = (by: number) => setStat(flat[(at + by + flat.length) % flat.length]!.key);
  const q = find.trim().toLowerCase();
  const shown = groups.map((g) => ({ ...g, stats: g.stats.filter((s) => !q || s.label.toLowerCase().includes(q)) })).filter((g) => g.stats.length);
  const view = `${stat}-${min}-${pos}`;

  return (
    <div className="sx" style={accent(current.group)}>
      <section className="sx-hero">
        <div className="sx-ask" ref={picker}>
          <h1>
            <span>Most</span>{" "}
            <button ref={opener} type="button" className="sx-stat" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
              <span aria-live="polite">{current.label}</span>
            </button>{" "}
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
          <span className="sx-group">{current.group}</span>
          <span>among</span>
          <select className="sx-word" aria-label="Who is ranked" value={pos} onChange={(e) => setPos(e.target.value as Position | "")}>
            {POSITIONS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          <span>with</span>
          <select className="sx-word" aria-label="Fewest starts" value={min} onChange={(e) => setMin(Number(e.target.value))}>
            {STARTS.map((n) => (
              <option key={n} value={n}>
                {n}+ starts
              </option>
            ))}
          </select>
          {average.players ? (
            <span className="sx-field" title="The average counts a player who never did it as none; the dashed line across the steps stands at it">
              {average.players} players, average {statValue(average.mean)} <i className="sx-dash" aria-hidden="true" />
            </span>
          ) : null}
        </p>
      </section>

      {ranked.length === 0 ? (
        <p className="s5-empty" role="status">
          No {who === "everyone" ? "player" : who.slice(0, -1)} with {min}+ starts has a number for {label} yet.
        </p>
      ) : (
        <>
          <div className="sx-stage" key={view} style={{ "--avg": Math.min(1, average.mean / top) } as CSSProperties}>
            <ol className="sx-podium" aria-label={`Top ${Math.min(PODIUM, ranked.length)} in ${label}`}>
              {ranked.slice(0, PODIUM).map((player, i) => (
                // the step's height is his number against the leader's
                <li key={player.slug} data-rank={i + 1} style={{ "--r": player.value / top, animationDelay: `${i * 80}ms` } as CSSProperties}>
                  <Link className="art" href={`/players/${player.slug}`} prefetch={false} aria-label={`${player.name}: open his page`}>
                    <CardArt src={player.pic} name={player.name} />
                  </Link>
                  <span className="sx-plinth">
                    <em aria-hidden="true">{i + 1}</em>
                    <b className="sx-value">{i === 0 ? <CountUp value={player.value} /> : statValue(player.value)}</b>
                    <span className="sx-who">
                      <span className="sx-name">
                        <ClubMark player={player} />
                        <Link href={`/players/${player.slug}`} prefetch={false}>
                          {player.name}
                        </Link>
                        {player.mine ? <span className="sx-yours">Yours</span> : null}
                      </span>
                      <small>{player.starts} starts</small>
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {ranked.length > PODIUM ? (
            <>
              <h2 className="sx-next">
                Close behind <span>6 to {Math.min(CLOSE, ranked.length)}</span>
              </h2>
              <ol className="sx-close" start={PODIUM + 1} key={`close-${view}`}>
                {ranked.slice(PODIUM, CLOSE).map((player, i) => (
                  <Card key={player.slug} player={player} rank={i + PODIUM + 1} order={i} />
                ))}
              </ol>
            </>
          ) : null}

          {ranked.length > CLOSE ? (
            <>
              <h2 className="sx-next">
                The rest of the top {ranked.length} <span>11 to {ranked.length}</span>
              </h2>
              <ol className="sx-list" start={CLOSE + 1} key={`wall-${view}`}>
                {ranked.slice(CLOSE).map((player, i) => (
                  <Card key={player.slug} player={player} rank={i + CLOSE + 1} order={i} />
                ))}
              </ol>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
