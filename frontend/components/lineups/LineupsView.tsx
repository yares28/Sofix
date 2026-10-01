import Link from "next/link";
import { dateRange } from "../../lib/home";
import {
  MAX_AGE_MS,
  freshness,
  kickoffLabel,
  matchState,
  readLabel,
  shortCode,
  teamsRead,
  tint,
  yoursIn,
  yoursSummary,
  type LineupMatch,
  type LineupsData,
  type LineupSide,
  type Section,
} from "../../lib/lineups";
import { ExternalIcon, InfoIcon, KindIcon, CalledUpIcon } from "./Icons";
import Shield from "./Shield";
import TeamColumn from "./TeamColumn";

export type ClubLook = { color: string; crest: string | null };

type Props = {
  data: LineupsData;
  sections: Section[];
  section: Section;
  selected: LineupMatch;
  now: Date;
  clubs: Record<string, ClubLook>;
};

const hrefOf = (match: LineupMatch) => `/lineups?m=${match.id}`;
const lookOf = (side: LineupSide, clubs: Record<string, ClubLook>) => (side.club ? clubs[side.club] : undefined);

export default function LineupsView({ data, sections, section, selected, now, clubs }: Props) {
  const state = matchState(selected, now);
  const competitions = [...new Map(sections.map((s) => [s.competition, s.competitionName])).entries()];
  const rounds = sections.filter((s) => s.competition === section.competition);
  const first = section.matches[0]?.kickoff;
  const last = section.matches.at(-1)?.kickoff;
  const when = first && last ? dateRange(first, last) : null;
  return (
    <main className="lu">
      <header className="lu-head">
        <div>
          <h1>Who starts this round?</h1>
          <p>
            {section.label}
            {when ? ` · ${when}` : ""} · probable elevens from Futbol Fantasy
          </p>
        </div>
        <ReadPill data={data} matches={section.matches} now={now} />
      </header>

      {competitions.length > 1 ? (
        <nav className="lu-tabs" aria-label="Competition">
          {competitions.map(([key, name]) => {
            const target = sections.find((s) => s.competition === key)!.matches[0]!;
            return (
              <Link key={key} href={hrefOf(target)} scroll={false} aria-current={key === section.competition ? "page" : undefined}>
                {name}
              </Link>
            );
          })}
        </nav>
      ) : null}
      {rounds.length > 1 ? (
        <nav className="lu-tabs" aria-label="Round">
          {rounds.map((s) => (
            <Link key={s.key} href={hrefOf(s.matches[0]!)} scroll={false} aria-current={s.key === section.key ? "page" : undefined}>
              {s.round !== null ? `${section.competition === "laliga" ? "Round" : "Matchday"} ${s.round}` : s.label}
            </Link>
          ))}
        </nav>
      ) : null}

      <nav className="lu-strip" aria-label={`Matches of ${section.label}`}>
        {section.matches.map((match) => (
          <Chip key={match.id} match={match} current={match.id === selected.id} now={now} clubs={clubs} />
        ))}
      </nav>

      <article className="lu-match" aria-label={`${selected.home.name} against ${selected.away.name}`}>
        <MatchHead match={selected} state={state} now={now} clubs={clubs} />
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
            <TeamColumn side={selected.home} place="home" round={selected.round} cards={data.cards} look={lookOf(selected.home, clubs)} />
            <TeamColumn side={selected.away} place="away" round={selected.round} cards={data.cards} look={lookOf(selected.away, clubs)} />
          </div>
        </fieldset>
        <Legend />
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

function Chip({ match, current, now, clubs }: { match: LineupMatch; current: boolean; now: Date; clubs: Record<string, ClubLook> }) {
  const count = yoursIn(match);
  const state = matchState(match, now);
  return (
    <Link href={hrefOf(match)} scroll={false} className="lu-chip" aria-current={current ? "page" : undefined} data-state={state}>
      <span className="lu-chip-teams">
        <Shield crest={lookOf(match.home, clubs)?.crest ?? match.home.crest} color={lookOf(match.home, clubs)?.color} code={shortCode(match.home)} width={17} />
        {shortCode(match.home)}
        <i>–</i>
        {shortCode(match.away)}
        <Shield crest={lookOf(match.away, clubs)?.crest ?? match.away.crest} color={lookOf(match.away, clubs)?.color} code={shortCode(match.away)} width={17} />
      </span>
      <span className="lu-chip-when">
        {state === "started" ? "Kicked off" : kickoffLabel(match.kickoff).short}
        <span className="lu-chip-mine" title={yoursSummary(count)}>
          <span aria-hidden="true" />
          {count}
          <span className="visually-hidden"> {yoursSummary(count)}</span>
        </span>
      </span>
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
            Read {readLabel(match.readAt, now).replace(/^today /, "")}
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

function Legend() {
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
      <span>
        <CalledUpIcon size={16} />
        Called up
      </span>
      <em>% = his chance of starting, from Futbol Fantasy. Under each line: who else could play there.</em>
    </footer>
  );
}
