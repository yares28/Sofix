"use client";

import { useContext, useMemo, useState } from "react";
import { gamesOf, type ArcadeCard, type ArcadeGame, type PlayerForm } from "../../lib/arcade";
import { dayLabel, matchesPick, SCORE_CUTS, TIER_OPTIONS, tierChoice } from "../../lib/arcadeCards";
import { madridDate, predicted, type Outlook } from "../../lib/arcadePlan";
import type { PlayerStatus } from "../../lib/arcadeTeams";
import PlayerCard from "./PlayerCard";
import { FdrContext, sideOf } from "./Fdr";

const PAGE_SIZE = 12;
const POSITIONS = ["Goalkeeper", "Defender", "Midfielder", "Forward"];
function Card({ card, games, outlooks, crests }: { card: ArcadeCard; games: ArcadeGame[] | null; outlooks: Map<string, Map<string, Outlook>>; crests: Map<string, string> }) {
  const [chosen, setChosen] = useState<string | null>(null);
  const mine = gamesOf(card, games ?? []);
  const game = mine.find((g) => g.id === chosen) ?? mine[0];
  const outlook = game ? outlooks.get(game.id)?.get(card.slug) : undefined;
  return <PlayerCard card={card} outlook={outlook} game={game} fixtures={mine} crests={crests} onSelect={setChosen} unavailable={games === null ? "Games unavailable" : undefined} />;
}

const WINDOWS = ["l5", "l10", "l40"] as const;

export default function ArcadeCards({ cards, games, outlooks, status, form }: { cards: ArcadeCard[]; games: ArcadeGame[] | null; outlooks: Map<string, Outlook[]>; status: Record<string, PlayerStatus>; form: Record<string, PlayerForm> }) {
  const boards = useContext(FdrContext);
  const [query, setQuery] = useState("");
  const [league, setLeague] = useState("");
  const [position, setPosition] = useState("");
  const [edition, setEdition] = useState("");
  const [tier, setTier] = useState("");
  const [l5, setL5] = useState("");
  const [l10, setL10] = useState("");
  const [l40, setL40] = useState("");
  const [day, setDay] = useState("");
  const [start, setStart] = useState("");
  const [fdr, setFdr] = useState("");
  const [xscore, setXscore] = useState("");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(0);
  const windows = { l5, l10, l40 };
  const setWindow = { l5: setL5, l10: setL10, l40: setL40 };
  const leagues = useMemo(() => [...new Map(cards.flatMap((c) => c.league ? [[c.league.slug, c.league.name] as const] : [])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [cards]);
  const editions = useMemo(() => [...new Set(cards.map((c) => c.edition ?? "Standard"))].sort(), [cards]);
  const crests = useMemo(() => new Map(cards.flatMap((c) => c.teamSlug && c.teamPicture ? [[c.teamSlug, c.teamPicture] as const] : [])), [cards]);
  const indexed = useMemo(() => new Map([...outlooks].map(([id, list]) => [id, new Map(list.map((o) => [o.card.slug, o]))])), [outlooks]);
  const rows = useMemo(() => cards.map((card) => {
    const next = games ? gamesOf(card, games)[0] : undefined;
    const outlook = next ? indexed.get(next.id)?.get(card.slug) : null;
    const difficulty = next ? sideOf(boards.get(next.id), next.home?.slug === card.teamSlug)?.mine.difficulty : null;
    const played = form[card.player];
    return {
      card, start: outlook?.start ?? null, score: outlook ? predicted(outlook) : null, fdr: difficulty == null ? null : Math.round(difficulty),
      tier: tierChoice(status[card.player]?.tier), l5: played?.l5 ?? null, l10: played?.l10 ?? null, l40: played?.l40 ?? null,
      day: games === null ? null : next ? madridDate(next.kickoff) : "none",
    };
  }), [cards, games, indexed, boards, status, form]);
  const days = useMemo(() => [...new Set(rows.flatMap((r) => (r.day && r.day !== "none" ? [r.day] : [])))].sort(), [rows]);
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      const c = r.card;
      return (!words || `${c.name} ${c.team ?? ""}`.toLowerCase().includes(words))
        && (!league || c.league?.slug === league) && (!position || c.positions.includes(position)) && (!edition || (c.edition ?? "Standard") === edition)
        && (!start || (start === "unknown" ? r.start === null : start === "zero" ? r.start === 0 : r.start !== null && Math.round(r.start * 100) >= Number(start)))
        && (!fdr || (fdr === "unknown" ? r.fdr === null : r.fdr !== null && (fdr === "hard" ? r.fdr >= 75 : r.fdr <= Number(fdr))))
        && matchesPick(r, { tier, l5, l10, l40, day, score: xscore });
    });
    return list.sort((a, b) => {
      const av = sort === "start" ? a.start : sort === "fdr" ? a.fdr : sort === "score" ? a.score : null;
      const bv = sort === "start" ? b.start : sort === "fdr" ? b.fdr : sort === "score" ? b.score : null;
      return (av === null ? bv === null ? 0 : 1 : bv === null ? -1 : sort === "fdr" ? av - bv : bv - av) || a.card.name.localeCompare(b.card.name) || a.card.slug.localeCompare(b.card.slug);
    });
  }, [rows, query, league, position, edition, start, fdr, sort, tier, l5, l10, l40, day, xscore]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const at = Math.min(page, pages - 1);
  const slice = shown.slice(at * PAGE_SIZE, (at + 1) * PAGE_SIZE);
  const reset = (set: (value: string) => void) => (value: string) => { set(value); setPage(0); };
  const filtered = !!(query || league || position || edition || tier || l5 || l10 || l40 || day || start || fdr || xscore || sort !== "name");
  const clear = () => { setQuery(""); setLeague(""); setPosition(""); setEdition(""); setTier(""); setL5(""); setL10(""); setL40(""); setDay(""); setStart(""); setFdr(""); setXscore(""); setSort("name"); setPage(0); };
  return (
    <section className="arc-cards" aria-labelledby="arc-cards-title">
      <h2 id="arc-cards-title">Your cards</h2>
      <div className="arc-filters">
        <input type="search" name="card-search" autoComplete="off" placeholder="Player or club…" aria-label="Search player or club" value={query} onChange={(e) => reset(setQuery)(e.target.value)} />
        <select aria-label="League" value={league} onChange={(e) => reset(setLeague)(e.target.value)}><option value="">All leagues</option>{leagues.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}</select>
        <select aria-label="Position" value={position} onChange={(e) => reset(setPosition)(e.target.value)}><option value="">All positions</option>{POSITIONS.map((p) => <option key={p}>{p}</option>)}</select>
        <select aria-label="Edition" value={edition} onChange={(e) => reset(setEdition)(e.target.value)}><option value="">All editions</option>{editions.map((e) => <option key={e}>{e}</option>)}</select>
        <select aria-label="Tier" value={tier} onChange={(e) => reset(setTier)(e.target.value)}><option value="">All tiers</option>{TIER_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        {WINDOWS.map((key) => {
          const name = key.toUpperCase();
          return <select key={key} aria-label={name} value={windows[key]} onChange={(e) => reset(setWindow[key])(e.target.value)}><option value="">Any {name}</option>{SCORE_CUTS.map((n) => <option key={n} value={n}>{name} ≥{n}</option>)}<option value="unknown">{name} unknown</option></select>;
        })}
        <select aria-label="Day" value={day} onChange={(e) => reset(setDay)(e.target.value)}><option value="">Any day</option>{days.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}<option value="none">No game</option></select>
        <select aria-label="Start percentage" value={start} onChange={(e) => reset(setStart)(e.target.value)}><option value="">Any start %</option>{[90, 80, 50].map((p) => <option key={p} value={p}>Next start ≥{p}%</option>)}<option value="zero">Next start 0%</option><option value="unknown">Start % unknown</option></select>
        <select aria-label="FDR rating" value={fdr} onChange={(e) => reset(setFdr)(e.target.value)}><option value="">Any FDR</option>{[25, 50, 75].map((n) => <option key={n} value={n}>Next FDR ≤{n}</option>)}<option value="hard">Next FDR ≥75</option><option value="unknown">FDR unknown</option></select>
        <select aria-label="xScore" value={xscore} onChange={(e) => reset(setXscore)(e.target.value)}><option value="">Any xScore</option>{SCORE_CUTS.map((n) => <option key={n} value={n}>xScore ≥{n}</option>)}<option value="unknown">xScore unknown</option></select>
        <select aria-label="Sort" value={sort} onChange={(e) => reset(setSort)(e.target.value)}><option value="name">By name</option><option value="start">By start % (next game)</option><option value="fdr">By FDR (easiest first)</option><option value="score">By xScore (next game)</option></select>
      </div>
      <div className="arc-collection-meta">
        <p className="arc-count" role="status">{shown.length ? `${at * PAGE_SIZE + 1}–${at * PAGE_SIZE + slice.length} of ${shown.length.toLocaleString("en-GB")}` : "No card matches"}</p>
        {filtered ? <button type="button" className="arc-clear" onClick={clear}>Clear filters</button> : null}
      </div>
      <div className="arc-grid">{slice.map(({ card }) => <Card key={card.slug} card={card} games={games} outlooks={indexed} crests={crests} />)}</div>
      {pages > 1 ? <nav className="arc-pager" aria-label="Card pages"><button type="button" onClick={() => setPage(at - 1)} disabled={at === 0}>Previous</button><span>Page {at + 1} of {pages}</span><button type="button" onClick={() => setPage(at + 1)} disabled={at >= pages - 1}>Next</button></nav> : null}
    </section>
  );
}
