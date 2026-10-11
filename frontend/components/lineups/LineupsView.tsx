"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  MAX_AGE_MS,
  byChance,
  calledUpIn,
  freshness,
  kickoffLabel,
  matchAddress,
  matchAsked,
  matchState,
  readLabel,
  roundDays,
  shortCode,
  teamsRead,
  timelineOf,
  tint,
  type LineupMatch,
  type LineupsData,
  type LineupSide,
  type Section,
  type TimelineDay,
} from "../../lib/lineups";
import { CHANCE_SOURCES, sorareChanceRead, type LineupChances, type SorareGameLink, type SorareChanceRead } from "../../lib/lineupChances";
import { askExtension } from "../../lib/extension";
import type { MatchFacts } from "../../lib/lineupMatchFacts";
import type { StartSource } from "../../lib/play";
import { ChanceContext } from "./Chance";
import { CalledUpMark, ExternalIcon, InfoIcon, KindIcon } from "./Icons";
import Shield from "./Shield";
import TeamColumn from "./TeamColumn";
import { actualSide, type ActualRead } from "../../lib/actualLineups";

export type ClubLook = { color: string; crest: string | null };

type Props = {
  data: LineupsData;
  chances: LineupChances;
  sorareGames: Record<number, SorareGameLink>;
  facts: Record<number, MatchFacts>;
  sections: Section[];
  /** The match the page opened on: the one the address asked for, else the next to be played. */
  initial: LineupMatch;
  now: Date;
  clubs: Record<string, ClubLook>;
  /** Lines shown above the match: why the page is not the week you came with. */
  flash: string[];
  /** The match the address asked for when Futbol Fantasy no longer has it: said until another match is picked. */
  gone: string | null;
};

const hrefOf = (match: LineupMatch) => `/lineups?m=${match.id}`;

/**
 * A click on a match, a round or a competition changes the match here, from the payload the page already holds, and puts it in the
 * address: no request, no reload. A click with a modifier, or without script, is the link it is.
 */
const switchTo = (match: LineupMatch) => (event: MouseEvent<HTMLAnchorElement>) => {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  window.history.pushState(null, "", matchAddress(window.location.search, match.id));
};
const lookOf = (side: LineupSide, clubs: Record<string, ClubLook>) => (side.club ? clubs[side.club] : undefined);
const READ_MESSAGES = {
  reading: "Reading Sorare chances.",
  ready: "",
  unseen: "Open this match on Sorare to load its starting chances.",
  "no-players": "Sorare returned no players for this match.",
  unmatched: "Sorare returned odds, but its players could not be matched.",
  incomplete: "Sorare returned incomplete starting odds. Available values are shown.",
  "signed-out": "Sign in to Sorare, then read again.",
  unavailable: "Open a Sorare tab with extension 0.3.12 or newer.",
  "rate-limited": "Sorare's request limit was reached. Wait before trying again.",
  error: "Sorare could not return starting odds. Try again.",
};

export default function LineupsView({ data, chances, sorareGames, facts, sections, initial, now, clubs, flash, gone }: Props) {
  const [source, setSource] = useState<StartSource | "actual">("futbolfantasy");
  const [actuals, setActuals] = useState<Record<number, ActualRead>>({});
  const actualChecked = useRef(new Map<number, number>());
  const actualFlight = useRef(new Set<number>());
  const [live, setLive] = useState<LineupChances>({});
  const [reads, setReads] = useState<Record<number, { state: SorareChanceRead["state"] | "reading"; checked: number }>>({});
  const attempted = useRef(new Set<number>());
  const inFlight = useRef(new Set<number>());
  const [onlyMine, setOnlyMine] = useState(false);
  const asked = useSearchParams().get("m");
  const selected = matchAsked(data.matches, asked, initial);
  const readActual = useCallback(async () => {
    const id=selected.id;
    if(actualFlight.current.has(id)||Date.now()-(actualChecked.current.get(id)??0)<60_000)return;
    actualFlight.current.add(id);
    try {
      const response=await fetch(`/api/lineups/actual?match=${id}`,{signal:AbortSignal.timeout(20_000)});
      const found:ActualRead=response.ok?await response.json():{state:"unavailable"};
      setActuals(previous=>({...previous,[id]:found}));
    } catch {setActuals(previous=>({...previous,[id]:{state:"unavailable"}}));}
    finally {actualChecked.current.set(id,Date.now());actualFlight.current.delete(id);}
  },[selected.id]);
  useEffect(()=>{
    if(source!=="actual")return;
    void readActual();
    const returned=()=>{if(document.visibilityState==="visible")void readActual();};
    window.addEventListener("focus",returned); document.addEventListener("visibilitychange",returned);
    return()=>{window.removeEventListener("focus",returned);document.removeEventListener("visibilitychange",returned);};
  },[source,readActual]);
  const actual=actuals[selected.id];
  const official=actual?.state==="ready"?actual.data:undefined;
  const actualNote=!actual?"Reading actual lineups from Sorare.":actual.state==="unmatched"?"This match could not be matched to Sorare's schedule.":actual.state==="rate-limited"?"Sorare's request limit was reached. Try again later.":actual.state==="unavailable"?"Actual lineups could not be read from Sorare.":`Actual lineups · Sorare · checked ${readLabel(official!.readAt,new Date())}`;
  const section = sections.find((one) => one.matches.some((match) => match.id === selected.id)) ?? sections[0]!;
  const state = matchState(selected, now);
  const notes = gone !== null && asked === gone ? [...flash, "That match is no longer on Futbol Fantasy. Showing the next one."] : flash;
  const competitions = [...new Map(sections.map((s) => [s.competition, s.competitionName])).entries()];
  const rounds = sections.filter((s) => s.competition === section.competition);
  const first = section.matches[0]?.kickoff;
  const last = section.matches.at(-1)?.kickoff;
  const when = first && last ? roundDays(first, last) : null;
  const named = section.competition === "laliga" && section.round !== null ? `LaLiga round ${section.round}` : section.label;
  const days = timelineOf(section.matches);
  // Futbol Fantasy's eleven is its own; with Sorare's or Sofix's number picked, that source's eleven is drawn in the same formation.
  const values = { ...chances[selected.id] };
  for (const [player, sources] of Object.entries(live[selected.id] ?? {})) values[player] = { ...values[player], ...sources };
  const link = sorareGames[selected.id];
  const readSorare = useCallback(async () => {
    const match = selected.id;
    if (!link || inFlight.current.has(match)) return;
    attempted.current.add(match);
    inFlight.current.add(match);
    setReads((previous) => ({ ...previous, [match]: { state: "reading", checked: 0 } }));
    const found = sorareChanceRead(await askExtension({ type: "lineup-chances", game: link.id }, 25_000), link);
    if (["ready", "empty", "unseen"].includes(found.state)) setLive((previous) => ({ ...previous, [match]: found.values }));
    else if (Object.keys(found.values).length) setLive((previous) => ({ ...previous, [match]: { ...previous[match], ...found.values } }));
    setReads((previous) => ({ ...previous, [match]: found }));
    inFlight.current.delete(match);
  }, [selected.id, link]);
  useEffect(() => {
    if (source === "sorare" && !attempted.current.has(selected.id)) void readSorare();
  }, [source, selected.id, readSorare]);
  useEffect(() => {
    if (source !== "sorare") return;
    const returned = () => { if (document.visibilityState === "visible") void readSorare(); };
    window.addEventListener("focus", returned);
    document.addEventListener("visibilitychange", returned);
    return () => {
      window.removeEventListener("focus", returned);
      document.removeEventListener("visibilitychange", returned);
    };
  }, [source, readSorare]);
  const read = reads[selected.id];
  const sorareNote = !link ? "This match is not linked to Sorare yet." : read?.state === "empty"
    ? "Sorare's page returned no starting chances for this match."
    : READ_MESSAGES[read?.state ?? "reading"];
  const sorarePlayer = Object.keys(link?.players ?? {}).find(slug => /^[a-z0-9-]{1,160}$/.test(slug));
  const sorareUrl = sorarePlayer && link ? `https://sorare.com/football/players/${sorarePlayer}?game=${encodeURIComponent(link.id)}` : null;
  const arranged = (side: LineupSide, place:"home"|"away") => source === "actual" ? actualSide(side,official?.[place],data.cards) : source === "futbolfantasy" ? side : byChance(side, (player) => values[player.id]?.[source] ?? null);
  // On a phone the timeline scrolls sideways: bring the match in view to the middle whenever it changes.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = scroller.current;
    const here = box?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!box || !here || box.scrollWidth <= box.clientWidth) return;
    const left = here.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft;
    box.scrollLeft = left - (box.clientWidth - here.offsetWidth) / 2;
  }, [selected.id]);
  return (
    <main className="lu">
      <header className="lu-head">
        <p className="lu-eyebrow">
          {named}
          {when ? ` · ${when}` : ""}
        </p>
        <h1>Who starts this round?</h1>
        <div className="lu-chips">
          {source==="actual"?<p className="lu-pill" role="status">{actualNote}</p>:<ReadPill data={data} matches={section.matches} now={now} />}
        </div>
      </header>

      {notes.map((line) => (
        <p key={line} className="lu-flash" role="status">
          {line}
        </p>
      ))}

      {competitions.length > 1 ? (
        <nav className="lu-tabs" aria-label="Competition">
          {competitions.map(([key, name]) => {
            const target = sections.find((s) => s.competition === key)!.matches[0]!;
            return (
              <Link key={key} href={hrefOf(target)} prefetch={false} onClick={switchTo(target)} aria-current={key === section.competition ? "page" : undefined}>
                {name}
              </Link>
            );
          })}
        </nav>
      ) : null}
      {rounds.length > 1 ? (
        <nav className="lu-tabs" aria-label="Round">
          {rounds.map((s) => (
            <Link key={s.key} href={hrefOf(s.matches[0]!)} prefetch={false} onClick={switchTo(s.matches[0]!)} aria-current={s.key === section.key ? "page" : undefined}>
              {s.round !== null ? `${section.competition === "laliga" ? "Round" : "Matchday"} ${s.round}` : s.label}
            </Link>
          ))}
        </nav>
      ) : null}

      <nav className="lu-strip" aria-label={`Matches of ${section.label}`}>
        <div className="lu-strip-scroll" ref={scroller}>
          <div className="lu-days">
            {days.map((day) => (
              <Day key={day.key} day={day} selected={selected.id} now={now} clubs={clubs} facts={facts} />
            ))}
          </div>
        </div>
      </nav>
      <p className="lu-source">{source==="actual"?"Kickoffs":"Futbol Fantasy · kickoffs"} in Madrid time</p>

      <article key={selected.id} className="lu-match" aria-label={`${selected.home.name} against ${selected.away.name}`}>
        <MatchHead match={selected} state={state} now={now} clubs={clubs} actual={source==="actual"} />
        <div className="lu-controls">
          <fieldset className="lu-chance-sources">
            <legend className="visually-hidden">Lineup source</legend>
            {(Object.entries({...CHANCE_SOURCES,actual:"Actual"}) as [StartSource|"actual", string][]).map(([key, name]) => (
              <label key={key}>
                <input type="radio" name="lu-source" value={key} checked={source === key} onChange={() => setSource(key)} />
                <span>{name}</span>
              </label>
            ))}
          </fieldset>
          <label className="lu-only" htmlFor="lu-only">
            <input type="checkbox" role="switch" id="lu-only" checked={onlyMine} onChange={(event) => setOnlyMine(event.target.checked)} />
            Only my players
          </label>
        </div>
        {source === "sorare" && (sorareNote || sorareUrl) ? <div className="lu-sorare-read">
          {sorareNote ? <p role="status">{sorareNote}</p> : null}
          {sorareUrl ? <a href={sorareUrl} target="_blank" rel="noreferrer">Open match on Sorare</a> : null}
          {link && read && read.state !== "reading" ? <button type="button" onClick={() => void readSorare()}>Read from Sorare</button> : null}
        </div> : null}
        <ChanceContext.Provider value={{ source:source==="actual"?"futbolfantasy":source, values, url: selected.url }}>
          <fieldset className="lu-switch" aria-label="Team">
            <legend className="visually-hidden">Team</legend>
            <input type="radio" name="lu-side" id="lu-side-home" className="lu-pick lu-pick-home" defaultChecked />
            <label htmlFor="lu-side-home">
              <Shield crest={lookOf(selected.home, clubs)?.crest ?? selected.home.crest} color={lookOf(selected.home, clubs)?.color} code={shortCode(selected.home)} width={16} />
              {selected.home.name}
            </label>
            <input type="radio" name="lu-side" id="lu-side-away" className="lu-pick lu-pick-away" />
            <label htmlFor="lu-side-away">
              <Shield crest={lookOf(selected.away, clubs)?.crest ?? selected.away.crest} color={lookOf(selected.away, clubs)?.color} code={shortCode(selected.away)} width={16} />
              {selected.away.name}
            </label>
            <div className="lu-teams">
              <TeamColumn side={arranged(selected.home,"home")} place="home" round={selected.round} cards={data.cards} art={data.art} look={lookOf(selected.home, clubs)} now={now} actual={source==="actual"?official?.home.state??(!actual?"loading":"unavailable"):undefined} />
              <TeamColumn side={arranged(selected.away,"away")} place="away" round={selected.round} cards={data.cards} art={data.art} look={lookOf(selected.away, clubs)} now={now} actual={source==="actual"?official?.away.state??(!actual?"loading":"unavailable"):undefined} />
            </div>
          </fieldset>
        </ChanceContext.Provider>
        {source==="actual"?<footer className="lu-legend"><span><i className="lu-swatch" aria-hidden="true" />Your card</span></footer>:<Legend calledUp={calledUpIn(selected)} />}
      </article>
    </main>
  );
}

function ReadPill({ data, matches, now }: { data: LineupsData; matches: LineupMatch[]; now: Date }) {
  const fresh = freshness(data, now);
  const { published, teams } = teamsRead(matches);
  const at = (iso: string | null) => readLabel(iso, now);
  let tone: "ok" | "warn" | "bad" | "idle" = "ok";
  let text: string;
  if (fresh.state === "none") {
    tone = "idle";
    text = "Futbol Fantasy has not been read yet";
  } else if (fresh.state === "old") {
    tone = "idle";
    text = `Last read ${at(fresh.shown)} · over a day old, not used in plans`;
  } else if (fresh.state === "failed") {
    tone = "bad";
    text = `Futbol Fantasy could not be read ${at(fresh.readAt)} · showing its ${at(fresh.shown)} read`;
  } else if (published < teams) {
    tone = "warn";
    text = `${published} of ${teams} teams published · read ${at(fresh.shown)}`;
  } else {
    text = `All ${teams} teams read ${at(fresh.shown)}`;
  }
  return (
    <p className="lu-pill" data-tone={tone} role="status">
      <span aria-hidden="true" />
      {text}
    </p>
  );
}

// A pair of crests is about 86 px wide: the least room a game gets, so the timeline scrolls sideways rather than squeeze them.
const PAIR_WIDTH = 92;

/** One day of the round: its date, then each kickoff time on a rail with the games played then. */
function Day({ day, selected, now, clubs, facts }: { day: TimelineDay; selected: number; now: Date; clubs: Record<string, ClubLook>; facts: Record<number, MatchFacts> }) {
  const games = day.slots.reduce((n, slot) => n + slot.matches.length, 0);
  return (
    <div className="lu-day" style={{ flex: `${games} 1 0`, minWidth: games * PAIR_WIDTH + (day.slots.length - 1) * 4 + 28 }}>
      <div className="lu-day-head">
        <span>{day.weekday}</span>
        <b>{day.date}</b>
        {day.month ? <span>{day.month}</span> : null}
      </div>
      <div className="lu-slots">
        {day.slots.map((slot) => (
          <div key={slot.time} className="lu-slot" data-current={slot.matches.some((match) => match.id === selected) ? "" : undefined} style={{ flex: `${slot.matches.length} 1 0`, minWidth: slot.matches.length * PAIR_WIDTH }}>
            <div className="lu-slot-time">{slot.time}</div>
            <div className="lu-rail" aria-hidden="true">
              <i />
              <span />
            </div>
            <div className="lu-pairs">
              {slot.matches.map((match) => (
                <Pair key={match.id} match={match} current={match.id === selected} now={now} clubs={clubs} facts={facts[match.id]} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A game as its two crests, home side first; the club names are in the label and on hover. */
function Pair({ match, current, now, clubs, facts }: { match: LineupMatch; current: boolean; now: Date; clubs: Record<string, ClubLook>; facts?: MatchFacts }) {
  const state = matchState(match, now);
  const when = kickoffLabel(match.kickoff);
  const label = `${match.home.name} against ${match.away.name}, ${state === "started" ? `kicked off at ${when.time}` : when.short}`;
  const [point, setPoint] = useState<{ left: number; top: number } | null>(null);
  const show = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    setPoint({ left: Math.min(window.innerWidth - 170, Math.max(170, rect.left + rect.width / 2)), top: rect.bottom + 10 });
  };
  return (
    <Link href={hrefOf(match)} prefetch={false} onClick={switchTo(match)} onMouseEnter={(event) => show(event.currentTarget)} onMouseLeave={() => setPoint(null)} onFocus={(event) => show(event.currentTarget)} onBlur={() => setPoint(null)} className="lu-pair" aria-current={current ? "page" : undefined} aria-label={label} aria-describedby={point ? `lu-pair-tip-${match.id}` : undefined} data-state={state}>
      {[match.home, match.away].map((one, index) => (
        <span key={index} className="lu-disc">
          <Shield crest={lookOf(one, clubs)?.crest ?? one.crest} color={lookOf(one, clubs)?.color} code={shortCode(one)} width={23} />
        </span>
      ))}
      {point && createPortal(<span className="lu-pair-card" style={{ left: point.left, top: point.top }} role="tooltip" id={`lu-pair-tip-${match.id}`}>
        <strong>{match.home.name} <span>vs</span> {match.away.name}</strong>
        <small>{when.short} · {match.competitionName}</small>
        {facts?.market ? (
          <span className="lu-pair-facts"><em>Bookmaker chances</em><b>Home {Math.round(facts.market.win * 100)}%</b><b>Draw {Math.round(facts.market.draw * 100)}%</b><b>Away {Math.round(facts.market.loss * 100)}%</b></span>
        ) : <span className="lu-pair-unavailable">Bookmaker odds unavailable</span>}
        {facts?.prediction ? (
          <span className="lu-pair-facts"><em>Sofix forecast</em><b>Home {Math.round(facts.prediction.probabilities.win * 100)}%</b><b>Draw {Math.round(facts.prediction.probabilities.draw * 100)}%</b><b>Away {Math.round(facts.prediction.probabilities.loss * 100)}%</b>{facts.prediction.xg_for !== null && facts.prediction.xg_against !== null ? <span>xG {facts.prediction.xg_for.toFixed(1)}–{facts.prediction.xg_against.toFixed(1)}</span> : null}</span>
        ) : null}
        <span className="lu-pair-facts"><em>Lineup notes</em><span>{match.home.formation} · {match.away.formation}</span></span>
      </span>, document.body)}
    </Link>
  );
}

function MatchHead({ match, state, now, clubs, actual=false }: { match: LineupMatch; state: ReturnType<typeof matchState>; now: Date; clubs: Record<string, ClubLook>; actual?:boolean }) {
  const [infoOpen, setInfoOpen] = useState(false);
  const kick = kickoffLabel(match.kickoff);
  const homeLook = lookOf(match.home, clubs);
  const awayLook = lookOf(match.away, clubs);
  const tooOld = now.getTime() - new Date(match.readAt).getTime() > MAX_AGE_MS;
  return (
    <header className="lu-match-head" style={{ background: `linear-gradient(90deg, ${tint(homeLook?.color, "1a")}, transparent 36%, transparent 64%, ${tint(awayLook?.color, "1a")})` }}>
      <div className="lu-side lu-side-home">
        <div>
          <div className="lu-side-name">{match.home.name}</div>
          <div className="lu-side-sub">Home</div>
        </div>
        <Shield crest={homeLook?.crest ?? match.home.crest} color={homeLook?.color} code={shortCode(match.home)} width={60} />
      </div>
      <div className="lu-when">
        <div className="lu-when-day">{kick.day}</div>
        {state === "started" && match.score ? (
          <div className="lu-when-time">
            {match.score[0]} – {match.score[1]}
          </div>
        ) : (
          <div className="lu-when-time">{kick.time}</div>
        )}
        {state === "started" ? <div className="lu-when-state">Kicked off {kick.time}.{actual?"":" The lineup is frozen and FF no longer counts."}</div> : null}
      </div>
      <div className="lu-side lu-side-away">
        <Shield crest={awayLook?.crest ?? match.away.crest} color={awayLook?.color} code={shortCode(match.away)} width={60} />
        <div>
          <div className="lu-side-name">{match.away.name}</div>
          <div className="lu-side-sub">Away</div>
        </div>
      </div>

      {!actual ? <div className="lu-tools">
        <div className="lu-info" data-open={infoOpen ? "" : undefined}>
          <button type="button" aria-label="Futbol Fantasy reading details" aria-expanded={infoOpen} onClick={() => setInfoOpen(!infoOpen)}>
            <InfoIcon />
          </button>
          <div className="lu-info-card" role="group" aria-label="Futbol Fantasy reading">
            <b>Futbol Fantasy</b>
            <dl>
              <dt>Last read</dt>
              <dd>{readLabel(match.readAt, now)}</dd>
              <dt>{match.home.name} changed</dt>
              <dd>{match.home.changedAt ? readLabel(match.home.changedAt, now) : "No change seen"}</dd>
              <dt>{match.away.name} changed</dt>
              <dd>{match.away.changedAt ? readLabel(match.away.changedAt, now) : "No change seen"}</dd>
            </dl>
            <p>
              {state === "started"
                ? "Kicked off: this is the lineup as it stood."
                : tooOld
                  ? "Over a day old: not used in plans."
                  : "Lineups keep changing until kickoff."}
            </p>
          </div>
        </div>
        <a className="lu-ext" href={match.url} target="_blank" rel="noopener noreferrer" aria-label="Open this match on Futbol Fantasy" title="Open on Futbol Fantasy">
          <ExternalIcon />
        </a>
      </div> : null}
    </header>
  );
}

function Legend({ calledUp }: { calledUp: boolean }) {
  return (
    <footer className="lu-legend">
      <span>
        <i className="lu-swatch" aria-hidden="true" />
        Your card
      </span>
      <span>
        <KindIcon kind="out" size={16} />
        Out
      </span>
      <span>
        <KindIcon kind="doubt" size={16} />
        Doubt
      </span>
      <span>
        <KindIcon kind="suspended" size={16} />
        Suspended
      </span>
      <span>
        <KindIcon kind="available" size={16} />
        Knock, but available
      </span>
      {calledUp ? (
        <span>
          <CalledUpMark code="ES" sample />
          <span>Called up by his national team</span>
        </span>
      ) : null}
    </footer>
  );
}
