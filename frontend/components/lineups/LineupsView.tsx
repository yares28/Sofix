"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, type MouseEvent } from "react";
import {
  CHANCE_KEY,
  MAX_AGE_MS,
  calledUpIn,
  chanceTone,
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
  yoursPlayers,
  type LineupMatch,
  type LineupsData,
  type LineupSide,
  type PlayerKind,
  type Section,
  type TimelineDay,
} from "../../lib/lineups";
import { cardHref } from "../../lib/links";
import { CalledUpMark, ChevronIcon, ExternalIcon, InfoIcon, KindIcon, LockIcon } from "./Icons";
import Shield from "./Shield";
import TeamColumn from "./TeamColumn";

export type ClubLook = { color: string; crest: string | null };

type Props = {
  data: LineupsData;
  sections: Section[];
  /** The match the page opened on: the one the address asked for, else the next to be played. */
  initial: LineupMatch;
  now: Date;
  clubs: Record<string, ClubLook>;
  /** The Sorare week this round feeds, with its Play page (null when the section is not LaLiga's). */
  sorare: { text: string; href: string; open: boolean } | null;
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

export default function LineupsView({ data, sections, initial, now, clubs, sorare, flash, gone }: Props) {
  const asked = useSearchParams().get("m");
  const selected = matchAsked(data.matches, asked, initial);
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
          {section.competition === "laliga" && sorare ? (
            <Link href={sorare.href} className="lu-lock" data-open={sorare.open ? "" : undefined}>
              <LockIcon />
              {sorare.text}
              <ChevronIcon />
            </Link>
          ) : null}
          <ReadPill data={data} matches={section.matches} now={now} />
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
              <Day key={day.key} day={day} selected={selected.id} now={now} clubs={clubs} />
            ))}
          </div>
        </div>
      </nav>
      <p className="lu-source">Futbol Fantasy · kickoffs in Madrid time</p>

      <article key={selected.id} className="lu-match" aria-label={`${selected.home.name} against ${selected.away.name}`}>
        <MatchHead match={selected} state={state} now={now} clubs={clubs} />
        <YoursStrip match={selected} />
        <ChanceKey />
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
            <TeamColumn side={selected.home} place="home" round={selected.round} cards={data.cards} art={data.art} look={lookOf(selected.home, clubs)} now={now} />
            <TeamColumn side={selected.away} place="away" round={selected.round} cards={data.cards} art={data.art} look={lookOf(selected.away, clubs)} now={now} />
          </div>
        </fieldset>
        <Legend calledUp={calledUpIn(selected)} />
      </article>
    </main>
  );
}

/** What the colours of the % badges mean, once, under the match head (the legend at the foot said it for no colour at all). */
function ChanceKey() {
  return (
    <div className="lu-key" role="group" aria-label="What the colours of the chances mean">
      <b>Chance to start</b>
      {CHANCE_KEY.map((one) => (
        <span key={one.tone}>
          <i data-tone={one.tone} aria-hidden="true" />
          {one.label}
        </span>
      ))}
    </div>
  );
}

const WORD: Partial<Record<PlayerKind, string>> = { out: "out", doubt: "doubt", suspended: "suspended" };
const pct = (p: number | null) => (p === null ? "–" : `${Math.round(p * 100)}%`);

/**
 * Your players are the point of the page, so they come first: who of yours the match names, with his chance, whether he is in the
 * eleven or an alternative, and what is wrong with him. The switch dims everyone else on the pitch and in the lists (CSS only).
 */
function YoursStrip({ match }: { match: LineupMatch }) {
  const list = yoursPlayers(match);
  return (
    <section className="lu-yours" aria-label="Your players in this match">
      <div className="lu-yours-head">
        <h2>{list.length === 0 ? "None of your players are in this match" : `Your ${list.length} here`}</h2>
        {list.length > 0 ? (
          <label className="lu-only" htmlFor="lu-only">
            <input type="checkbox" role="switch" id="lu-only" />
            Only my players
          </label>
        ) : null}
      </div>
      {list.length > 0 ? (
        <ul className="lu-yours-list">
          {list.map((player) => (
            <li
              key={player.slug}
              className="lu-yours-one"
              data-starting={player.starting ? "" : undefined}
              data-kind={player.kind ?? undefined}
              title={`${player.name} (${player.club}): ${player.starting ? "in the probable eleven" : "an alternative"}`}
            >
              <Link className="lu-yours-name" href={cardHref(player.slug)}>
                <b>{player.label}</b>
              </Link>
              <span className="lu-pct lu-pct-sm" data-tone={chanceTone(player.p)}>
                {pct(player.p)}
              </span>
              {player.kind ? <KindIcon kind={player.kind} size={15} /> : null}
              {player.kind && WORD[player.kind] ? <span className="lu-yours-word">{WORD[player.kind]}</span> : null}
              {!player.starting ? <span className="lu-yours-alt">alt</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
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
function Day({ day, selected, now, clubs }: { day: TimelineDay; selected: number; now: Date; clubs: Record<string, ClubLook> }) {
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
                <Pair key={match.id} match={match} current={match.id === selected} now={now} clubs={clubs} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A game as its two crests, home side first; the club names are in the label and on hover. */
function Pair({ match, current, now, clubs }: { match: LineupMatch; current: boolean; now: Date; clubs: Record<string, ClubLook> }) {
  const state = matchState(match, now);
  const when = kickoffLabel(match.kickoff);
  const label = `${match.home.name} against ${match.away.name}, ${state === "started" ? `kicked off at ${when.time}` : when.short}`;
  return (
    <Link href={hrefOf(match)} prefetch={false} onClick={switchTo(match)} className="lu-pair" aria-current={current ? "page" : undefined} aria-label={label} title={`${match.home.name} v ${match.away.name}`} data-state={state}>
      {[match.home, match.away].map((one, index) => (
        <span key={index} className="lu-disc">
          <Shield crest={lookOf(one, clubs)?.crest ?? one.crest} color={lookOf(one, clubs)?.color} code={shortCode(one)} width={23} />
        </span>
      ))}
    </Link>
  );
}

function MatchHead({ match, state, now, clubs }: { match: LineupMatch; state: ReturnType<typeof matchState>; now: Date; clubs: Record<string, ClubLook> }) {
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
        {state === "started" ? <div className="lu-when-state">Kicked off {kick.time}. The lineup is frozen and FF no longer counts.</div> : null}
      </div>
      <div className="lu-side lu-side-away">
        <Shield crest={awayLook?.crest ?? match.away.crest} color={awayLook?.color} code={shortCode(match.away)} width={60} />
        <div>
          <div className="lu-side-name">{match.away.name}</div>
          <div className="lu-side-sub">Away</div>
        </div>
      </div>

      <div className="lu-tools">
        <details className="lu-info">
          <summary aria-label="When Futbol Fantasy was read">
            <InfoIcon />
            Read {readLabel(match.readAt, now)}
          </summary>
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
        </details>
        <a className="lu-ext" href={match.url} target="_blank" rel="noopener noreferrer" aria-label="Open this match on Futbol Fantasy" title="Open on Futbol Fantasy">
          <ExternalIcon />
        </a>
      </div>
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
      <em>% = his chance of starting, from Futbol Fantasy. Under a card: who could come in for him.</em>
    </footer>
  );
}
