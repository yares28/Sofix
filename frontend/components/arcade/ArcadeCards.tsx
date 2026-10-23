"use client";

import { useContext, useMemo, useState } from "react";
import { bonusLabel, gamesOf, type ArcadeCard, type ArcadeGame } from "../../lib/arcade";
import { predicted, type Outlook } from "../../lib/arcadePlan";
import { scoreColour } from "../../lib/cards";
import { FdrContext, sideOf } from "./Fdr";

const PAGE_SIZE = 12;
const POSITIONS = ["Goalkeeper", "Defender", "Midfielder", "Forward"];
const percent = (value: number | null | undefined) => value == null ? "—" : `${Math.round(value * 100)}%`;
const SOURCES = { sorare: "Sorare", futbolfantasy: "Futbol Fantasy", sofix: "Sofix", form: "Recent form" };
const fixtureName = (game: ArcadeGame) => `${game.home?.name ?? "?"} v ${game.away?.name ?? "?"} · ${new Date(game.kickoff).toLocaleString("en-GB", { timeZone: "Europe/Madrid", weekday: "short", hour: "2-digit", minute: "2-digit" })} · ${game.competition.name}`;

function Card({ card, games, outlooks, crests }: { card: ArcadeCard; games: ArcadeGame[] | null; outlooks: Map<string, Map<string, Outlook>>; crests: Map<string, string> }) {
  const boards = useContext(FdrContext);
  const [chosen, setChosen] = useState<string | null>(null);
  const mine = gamesOf(card, games ?? []);
  const game = mine.find((g) => g.id === chosen) ?? mine[0];
  const outlook = game ? outlooks.get(game.id)?.get(card.slug) : undefined;
  const side = game ? sideOf(boards.get(game.id), game.home?.slug === card.teamSlug)?.mine : null;
  const score = outlook ? predicted(outlook) : null;
  const scoreLook = scoreColour(score);
  const bonus = bonusLabel(card.bonus);
  const detail = game ? fixtureName(game) : games === null ? "Games unavailable" : "No game before the set ends";
  const startProps = { className: "arc-card-start", "aria-label": `Start chance ${percent(outlook?.start)}`, title: `${detail} · ${outlook?.startSource ? SOURCES[outlook.startSource] : "Unknown"} start chance` };
  return (
    <figure className="arc-card" aria-label={card.name}>
      <div className="arc-art" title={`${card.name}${card.edition ? ` · ${card.edition}` : ""}`}>
        {card.picture
          // eslint-disable-next-line @next/next/no-img-element -- Original Sorare card art
          ? <img src={card.picture} alt={card.name} loading="lazy" width={240} height={388} />
          : <div className="arc-card-blank" role="img" aria-label={card.name}>{card.name}</div>}
        <div className="arc-card-ratings">
          <span className={`arc-card-fdr${side ? ` f${side.bucket}` : ""}`} title={side ? `${detail} · ${side.label} · difficulty ${side.difficulty ?? "unknown"} of 100 (lower is easier)` : `${detail} · FDR unavailable`}>
            <small>FDR</small><b>{side?.difficulty == null ? "—" : Math.round(side.difficulty)}</b>
          </span>
          <span className="arc-card-score" aria-label={score === null ? "xScore unavailable" : `xScore ${Math.round(score)}`} style={{ background: scoreLook.fill, color: scoreLook.ink }} title={`${detail} · xScore · ${outlook?.scoreSource ? SOURCES[outlook.scoreSource] : "No"} projection × start chance × card bonus${outlook?.start === null ? "; start chance unknown, assumed starting" : ""}`}>
            <b>{score === null ? "—" : Math.round(score)}</b>
          </span>
        </div>
        {bonus ? <span className="arc-card-bonus" title={`${card.edition ?? "Edition"} bonus; club bonus is included separately in xScore`}>{bonus}</span> : null}
      </div>
      <figcaption>
        {outlook?.startUrl ? <a {...startProps} href={outlook.startUrl} target="_blank" rel="noreferrer">{percent(outlook.start)}</a> : <span {...startProps}>{percent(outlook?.start)}</span>}
        <div className="arc-card-evidence">
          <div className="arc-card-games" aria-label="Card fixtures">
            {mine.length ? mine.map((g) => (
              <button key={g.id} type="button" aria-label={fixtureName(g)} title={fixtureName(g)} aria-pressed={g.id === game?.id} onClick={() => setChosen(g.id)}>
                {[g.home, g.away].map((team, i) => {
                  const src = team?.crest ?? (team ? crests.get(team.slug) : null);
                  // eslint-disable-next-line @next/next/no-img-element -- Sorare club crests
                  return src ? <img key={i} src={src} alt={team?.name ?? ""} width={20} height={20} loading="lazy" /> : <span key={i} aria-hidden="true">{(team?.name ?? "?").slice(0, 2)}</span>;
                })}
              </button>
            )) : <span className="arc-no-fixture" title={detail} aria-label={detail}>—</span>}
          </div>
          <span className="arc-card-xd" title={`${detail} · Expected decisive contribution, including starter and substitute chances; mission odds are separate`}>xD {outlook?.xd == null ? "—" : outlook.xd.toFixed(2)}</span>
        </div>
      </figcaption>
    </figure>
  );
}

export default function ArcadeCards({ cards, games, outlooks }: { cards: ArcadeCard[]; games: ArcadeGame[] | null; outlooks: Map<string, Outlook[]> }) {
  const boards = useContext(FdrContext);
  const [query, setQuery] = useState("");
  const [league, setLeague] = useState("");
  const [position, setPosition] = useState("");
  const [edition, setEdition] = useState("");
  const [start, setStart] = useState("");
  const [fdr, setFdr] = useState("");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(0);
  const leagues = useMemo(() => [...new Map(cards.flatMap((c) => c.league ? [[c.league.slug, c.league.name] as const] : [])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [cards]);
  const editions = useMemo(() => [...new Set(cards.map((c) => c.edition ?? "Standard"))].sort(), [cards]);
  const crests = useMemo(() => new Map(cards.flatMap((c) => c.teamSlug && c.teamPicture ? [[c.teamSlug, c.teamPicture] as const] : [])), [cards]);
  const indexed = useMemo(() => new Map([...outlooks].map(([id, list]) => [id, new Map(list.map((o) => [o.card.slug, o]))])), [outlooks]);
  const rows = useMemo(() => cards.map((card) => {
    const next = gamesOf(card, games ?? [])[0];
    const outlook = next ? indexed.get(next.id)?.get(card.slug) : null;
    const difficulty = next ? sideOf(boards.get(next.id), next.home?.slug === card.teamSlug)?.mine.difficulty : null;
    return { card, start: outlook?.start ?? null, score: outlook ? predicted(outlook) : null, fdr: difficulty == null ? null : Math.round(difficulty) };
  }), [cards, games, indexed, boards]);
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      const c = r.card;
      return (!words || `${c.name} ${c.team ?? ""}`.toLowerCase().includes(words))
        && (!league || c.league?.slug === league) && (!position || c.positions.includes(position)) && (!edition || (c.edition ?? "Standard") === edition)
        && (!start || (start === "unknown" ? r.start === null : start === "zero" ? r.start === 0 : r.start !== null && Math.round(r.start * 100) >= Number(start)))
        && (!fdr || (fdr === "unknown" ? r.fdr === null : r.fdr !== null && (fdr === "hard" ? r.fdr >= 75 : r.fdr <= Number(fdr))));
    });
    return list.sort((a, b) => {
      const av = sort === "start" ? a.start : sort === "fdr" ? a.fdr : sort === "score" ? a.score : null;
      const bv = sort === "start" ? b.start : sort === "fdr" ? b.fdr : sort === "score" ? b.score : null;
      return (av === null ? bv === null ? 0 : 1 : bv === null ? -1 : sort === "fdr" ? av - bv : bv - av) || a.card.name.localeCompare(b.card.name) || a.card.slug.localeCompare(b.card.slug);
    });
  }, [rows, query, league, position, edition, start, fdr, sort]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const at = Math.min(page, pages - 1);
  const slice = shown.slice(at * PAGE_SIZE, (at + 1) * PAGE_SIZE);
  const reset = (set: (value: string) => void) => (value: string) => { set(value); setPage(0); };
  const filtered = !!(query || league || position || edition || start || fdr || sort !== "name");
  const clear = () => { setQuery(""); setLeague(""); setPosition(""); setEdition(""); setStart(""); setFdr(""); setSort("name"); setPage(0); };
  return (
    <section className="arc-cards" aria-labelledby="arc-cards-title">
      <h2 id="arc-cards-title">Your cards</h2>
      <div className="arc-filters">
        <input type="search" name="card-search" autoComplete="off" placeholder="Player or club…" aria-label="Search player or club" value={query} onChange={(e) => reset(setQuery)(e.target.value)} />
        <select aria-label="League" value={league} onChange={(e) => reset(setLeague)(e.target.value)}><option value="">All leagues</option>{leagues.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}</select>
        <select aria-label="Position" value={position} onChange={(e) => reset(setPosition)(e.target.value)}><option value="">All positions</option>{POSITIONS.map((p) => <option key={p}>{p}</option>)}</select>
        <select aria-label="Edition" value={edition} onChange={(e) => reset(setEdition)(e.target.value)}><option value="">All editions</option>{editions.map((e) => <option key={e}>{e}</option>)}</select>
        <select aria-label="Start percentage" value={start} onChange={(e) => reset(setStart)(e.target.value)}><option value="">Any start %</option>{[90, 80, 50].map((p) => <option key={p} value={p}>Next start ≥{p}%</option>)}<option value="zero">Next start 0%</option><option value="unknown">Start % unknown</option></select>
        <select aria-label="FDR rating" value={fdr} onChange={(e) => reset(setFdr)(e.target.value)}><option value="">Any FDR</option>{[25, 50, 75].map((n) => <option key={n} value={n}>Next FDR ≤{n}</option>)}<option value="hard">Next FDR ≥75</option><option value="unknown">FDR unknown</option></select>
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
