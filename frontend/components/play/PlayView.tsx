import Link from "next/link";
import type { GameweekPlan, Plan, Sorare } from "../../lib/play";
import {
  allocation,
  cashLabel,
  chanceLabel,
  enterable,
  essenceLabel,
  formatOf,
  insideRange,
  likelyResult,
  plansOf,
  resultLabel,
  timeUntil,
  waitingFor,
} from "../../lib/play";
import { freshLabel } from "../../lib/fresh";
import type { MissionPlan } from "../../lib/missions";
import { lockText } from "../../lib/recap";
import { MissionsGlance } from "../recap/Recap";
import { syncState } from "../../lib/sorareStatus";
import ApplySheet from "./ApplySheet";
import { Cash, Chevron, Essence, Foil, GROUP_COLOUR } from "./bits";
import EnteredLineups from "./EnteredLineups";
import Lineup from "./Lineup";
import SorareImage from "./SorareImage";
import SeasonIcon from "../SeasonIcon";

const madrid = (iso: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", ...options }).format(new Date(iso));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso: string) => Number(madrid(iso, { day: "numeric" }));
const month = (iso: string) => MONTHS[new Date(iso).getUTCMonth()];
const weekday = (iso: string) => madrid(iso, { weekday: "short" });
const clock = (iso: string) => madrid(iso, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const span = (from: string, to: string) =>
  month(from) === month(to) ? `${day(from)}–${day(to)} ${month(to)}` : `${day(from)} ${month(from)} – ${day(to)} ${month(to)}`;

/** The whole Play page: the gameweek, its plans and the lineups in them. Everything comes from the job. */
export default function PlayView({
  data,
  week,
  planIndex,
  after,
  now,
  weekId,
  dates,
  title,
  missions,
}: {
  data: Sorare;
  week: GameweekPlan;
  planIndex: number;
  /** Today's missions, folded into the gameweek they are played in (only while it is still ahead). */
  missions?: { plans: MissionPlan[]; day: string | null } | null;
  after: boolean;
  now: Date;
  /** The week in the address (`?w=`), which the page's own links keep: it names every kind of week, early ones too. */
  weekId?: string;
  /** The days of the week as the picker writes them (`weekDates`), so the header and the picker never disagree. */
  dates?: string | null;
  /** The week's name as the picker writes it (`weekName`). */
  title?: string | null;
}) {
  const id = week.gameweek.id;
  const plans = plansOf(week, after);
  const plan = plans[planIndex];
  const href = (options: { gw?: string; plan?: number; after?: boolean }) => {
    const params = new URLSearchParams();
    const gw = options.gw ?? id;
    if (weekId) params.set("w", weekId);
    else if (gw !== data.nextId) params.set("gw", gw);
    const index = options.plan ?? planIndex;
    if (index > 0) params.set("plan", String(index + 1));
    const showActual = options.after ?? after;
    if (showActual) params.set("after", "1");
    const query = params.toString();
    return query ? `/play?${query}` : "/play";
  };

  const sync = after || week.projected ? null : syncState(data, week, now);
  const showModes = week.played && week.plans.length > 0;
  return (
    <main className="pl-main">
      <section className="pl-top">
        <div className={`pl-intro${sync?.behind ? " behind" : ""}`}>
          <Head data={data} week={week} now={now} sync={sync} dates={dates ?? null} title={title ?? null} />
          <Big week={week} plan={plan} after={after} now={now} />
          {plan ? <PlanFacts plan={plan} after={after} /> : null}
        </div>
        <aside className="pl-onsorare" aria-label="On Sorare">
          {week.projected ? (
            <div className="pl-early" role="status">
              <p className="pl-eyebrow">On Sorare · not open yet</p>
              <h2>An early plan</h2>
              <p>
                {week.projected.expected
                  ? `Sorare hasn't opened this week. Built from LaLiga's calendar, your cards' form and the LaLiga competitions Sorare opened for the last finished week like it, which it is expected to open again. Built on form, so later weeks look alike until Sorare opens them; it moves as the week gets closer, and nothing here can be entered yet.`
                  : "Sorare hasn't opened this week, and there is no finished week of its kind to copy its competitions from. Built from LaLiga's calendar and your cards' form; it moves as the week gets closer, and nothing here can be entered yet."}
              </p>
            </div>
          ) : (
            <EnteredLineups week={week.gameweek} />
          )}
          {plan && !after && !week.projected ? (
            <div className="pl-apply">
              <ApplySheet lineups={enterable(plan.lineups)} week={week} rank={plan.rank} now={now.toISOString()} />
              <span>Check, then Draft, then Enter: nothing goes on Sorare until you say so</span>
            </div>
          ) : null}
        </aside>
      </section>
      {sync?.alert ? (
        <div className={`pl-alert ${sync.state}`} role="status">
          <span aria-hidden="true">{sync.state === "cloudless" ? "!" : "⟳"}</span>
          <div>
            <b>{sync.alert.title}</b>
            {sync.alert.detail}
          </div>
          <Link className="pl-go" href={sync.alert.href} prefetch={false}>
            {sync.alert.action}
          </Link>
        </div>
      ) : null}
      {!week.projected && week.playable.some((option) => option.expected) ? (
        <div className="pl-alert early" role="status">
          <span aria-hidden="true">≈</span>
          <div>
            <b>Some lineups are expected</b>
            Sorare has not listed LaLiga&apos;s competitions for this week yet. The lineups marked Expected use the ones it opened for the last finished week like this one; they cannot be entered until it
            lists them.
          </div>
        </div>
      ) : null}
      {plan ? (
        <section className={`pl-board${sync?.behind ? " behind" : ""}`} aria-labelledby="pl-board-title">
          <div className="pl-board-head">
            <h2 id="pl-board-title">Sofix plan</h2>
            <PlanSwitch plans={plans} planIndex={planIndex} after={after} href={href} />
            <span className="pl-board-note">
              {plan.hindsight
                ? "The best lineups in hindsight, knowing every score, with your cards today"
                : `Plan ${plan.rank} of ${week.plans.length} · ${plan.lineups.length} lineup${plan.lineups.length === 1 ? "" : "s"}${week.projected ? " · early plan" : ""}`}
            </span>
            {showModes ? (
              <div className="pl-mode" role="group" aria-label="Show">
                <Link href={href({ after: false })} aria-current={after ? undefined : "page"} scroll={false} prefetch={false}>
                  Before the lock
                </Link>
                <Link href={href({ after: true })} aria-current={after ? "page" : undefined} scroll={false} prefetch={false}>
                  After the games
                </Link>
              </div>
            ) : null}
          </div>
          <Allocation plan={plan} />
          <div className="pl-cols" aria-hidden="true">
            <span>Competition</span>
            <span>{after ? "Cards, score under each" : "Cards, xScore under each"}</span>
            <span>Team score</span>
            <span>{after ? "Won" : "Reward chance"}</span>
          </div>
          <div className="pl-lus">
            {plan.lineups.map((lineup, index) => (
              <Lineup key={`${lineup.key}-${index}`} lineup={lineup} after={after} index={index} hindsight={plan.hindsight === true} players={week.playing.players} />
            ))}
          </div>
        </section>
      ) : (
        <Waiting week={week} now={now} />
      )}
      {missions && !after ? <MissionsGlance plans={missions.plans} day={missions.day} href="/missions" /> : null}
      <Folds week={week} />
    </main>
  );
}

function Head({
  data,
  week,
  now,
  sync,
  dates,
  title,
}: {
  data: Sorare;
  week: GameweekPlan;
  now: Date;
  sync: ReturnType<typeof syncState>;
  dates: string | null;
  title: string | null;
}) {
  const { lock, start, end } = week.gameweek;
  const locked = new Date(lock) <= now;
  const eyebrow = week.projected
    ? "Sorare · not open yet"
    : week.played
      ? "Sorare · played"
      : week.state === "none"
        ? "Sorare"
        : "Sorare · your gameweek";
  return (
    <header className="pl-head">
      <p className="pl-eyebrow">
        <Foil rarity="limited" className="sm" />
        {eyebrow}
      </p>
      <h1>{title ?? (week.projected ? week.gameweek.name : `Sorare GW${week.gameweek.number}`)}</h1>
      <p className="pl-sub">
        <span>
          {weekday(start)} {dates ?? span(start, end)}
        </span>
        <span className="dot" />
        <span className={`pl-lock${locked ? "" : " live"}`}>{lockText(lock, now)}</span>
        {sync ? (
          <span className={`pl-chip ${sync.state}`}>
            <i />
            {sync.chip}
          </span>
        ) : data.generatedAt ? (
          <>
            <span className="dot" />
            <span>updated {freshLabel(data.generatedAt, now)}</span>
          </>
        ) : null}
      </p>
    </header>
  );
}

/** The one big number of the page: the time left to the lock, or once the games are in, what the plan won. */
function Big({ week, plan, after, now }: { week: GameweekPlan; plan: Plan | undefined; after: boolean; now: Date }) {
  const lock = week.gameweek.lock;
  const left = timeUntil(lock, now);
  if (!left.past) {
    return (
      <div className="pl-bignum">
        <b>
          {left.days ? (
            <>
              {left.days}
              <small>d</small>
            </>
          ) : null}
          {left.hours}
          <small>h</small>
          {left.days ? null : (
            <>
              {left.minutes}
              <small>m</small>
            </>
          )}
        </b>
        <span>
          until the lock,
          <br />
          {weekday(lock)} {day(lock)} {month(lock)} at {clock(lock)}
        </span>
      </div>
    );
  }
  if (after && plan?.actual) {
    return (
      <div className="pl-bignum">
        <b>{essenceLabel(plan.actual.essence)}</b>
        <span>
          essence won
          {plan.actual.cash ? (
            <>
              <br />
              and {cashLabel(plan.actual.cash)} in cash
            </>
          ) : null}
        </span>
      </div>
    );
  }
  return null;
}

/** What the plan is worth, as the hero's row of facts: before the games its chances, after them what it won. */
function PlanFacts({ plan, after }: { plan: Plan; after: boolean }) {
  const likely = likelyResult(plan);
  const actual = after ? plan.actual : undefined;
  const n = plan.lineups.length;
  return (
    <div className="pl-facts" aria-live="polite">
      {actual ? (
        <>
          <span className="pl-fact">
            <strong>
              {actual.paid} of {n}
            </strong>{" "}
            lineups paid
          </span>
          {plan.hindsight ? null : (
            <span className="pl-fact">
              <strong>
                {insideRange(plan)} of {n}
              </strong>{" "}
              inside the range
            </span>
          )}
          <span className="pl-fact">
            <Essence /> <strong>{essenceLabel(actual.essence)}</strong> essence won ·{" "}
            {plan.hindsight ? "the most Sofix found it could have won" : `most likely was ${essenceLabel(likely.essence)}`}
          </span>
          <span className="pl-fact">
            <Cash /> <strong>{cashLabel(actual.cash)}</strong> cash won · {plan.hindsight ? "Rooms not counted" : `most likely was ${cashLabel(likely.cash)}`}
          </span>
        </>
      ) : (
        <>
          <span className="pl-fact">
            <strong>{chanceLabel(plan.pAny)}</strong> chance of a reward
          </span>
          <span className="pl-fact">
            <Essence /> <strong>{essenceLabel(likely.essence)}</strong> essence most likely · {chanceLabel(likely.p)} chance
          </span>
          <span className="pl-fact">
            <Cash /> <strong>{cashLabel(likely.cash)}</strong> cash most likely · never converted
          </span>
        </>
      )}
      <span className="pl-fact">
        <strong>{plan.cardsUsed}</strong> of {plan.cardsAvailable} cards used
      </span>
    </div>
  );
}

/** Where the plan's cards go, competition by competition, as one thin bar and its key. */
function Allocation({ plan }: { plan: Plan }) {
  const parts = allocation(plan);
  const counts = new Map<string, { group: string; lineups: number; cards: number }>();
  for (const lineup of plan.lineups) {
    const entry = counts.get(lineup.comp) ?? { group: lineup.group, lineups: 0, cards: 0 };
    entry.lineups += 1;
    entry.cards += lineup.starters.length + lineup.subs.length;
    counts.set(lineup.comp, entry);
  }
  return (
    <div className="pl-alloc">
      <div className="pl-alloc-bar" role="img" aria-label="Cards by competition">
        {parts.map((part) => (
          <i key={part.group} style={{ flex: part.cards, background: GROUP_COLOUR[part.group] }} />
        ))}
      </div>
      <ul className="pl-alloc-key">
        {[...counts.entries()].map(([name, entry]) => (
          <li key={name}>
            <i style={{ background: GROUP_COLOUR[entry.group as keyof typeof GROUP_COLOUR] }} />
            <b>
              {name}
              {entry.lineups > 1 ? ` ×${entry.lineups}` : ""}
            </b>
            <span>{entry.cards} cards</span>
          </li>
        ))}
        {plan.cardsAvailable > plan.cardsUsed ? (
          <li>
            <i style={{ background: GROUP_COLOUR.Unused }} />
            <b style={{ fontWeight: 500, color: "var(--ink-2)" }}>Not used</b>
            <span>{plan.cardsAvailable - plan.cardsUsed} cards</span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function PlanSwitch({
  plans,
  planIndex,
  after,
  href,
}: {
  plans: Plan[];
  planIndex: number;
  after: boolean;
  href: (options: { gw?: string; plan?: number; after?: boolean }) => string;
}) {
  return (
    <nav className="pl-plans" style={{ ["--plans" as string]: String(plans.length) }} aria-label="Plan">
      {plans.map((plan, index) => (
        <Link
          key={plan.hindsight ? "hindsight" : plan.rank}
          href={href({ plan: index })}
          aria-current={index === planIndex ? "page" : undefined}
          scroll={false}
          prefetch={false}
        >
          <span className="l1">
            {plan.hindsight ? "In hindsight" : `Plan ${plan.rank}`}
            {index === 0 && !plan.hindsight ? <span className="best">best</span> : null}
          </span>
          <span className="l2">
            {after && plan.actual ? (
              <>
                <b>{essenceLabel(plan.actual.essence)}</b> won
              </>
            ) : (
              <>
                <b>{chanceLabel(plan.pAny)}</b> · likely {resultLabel(likelyResult(plan))}
              </>
            )}
          </span>
          <span className="pl-mix" aria-hidden="true">
            {allocation(plan).map((part) => (
              <i key={part.group} style={{ flex: part.cards, background: GROUP_COLOUR[part.group] }} />
            ))}
          </span>
        </Link>
      ))}
    </nav>
  );
}

/** A gameweek whose plans aren't there yet: who plays, what can be entered, and what is still missing. */
export function Waiting({ week, now }: { week: GameweekPlan; now: Date }) {
  const reason = waitingFor(week, now) ?? "";
  const until = week.projectionsAt ? timeUntil(week.projectionsAt, now) : null;
  return (
    <section className="pl-state">
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <h2>
            {week.state === "none"
              ? "None of your cards play"
              : week.projectionsAt && until && !until.past
                ? `Plans ${weekday(week.projectionsAt)} ${clock(week.projectionsAt)}`
                : "Plans as soon as the numbers are in"}
          </h2>
          <p>{reason}</p>
        </div>
        {week.playing.cards ? (
          <>
            <div className="pl-big">
              <b>{week.playing.cards}</b>
              <span>
                of your cards play
                {until && !until.past ? ` · ${until.days ? `${until.days} d ` : ""}${until.hours} h to the projections` : ""}
              </span>
            </div>
            <div className="pl-faces">
              {week.playing.players.map((player) => (
                <div className="pl-face" key={player.name}>
                  <span className="av">
                    <SorareImage src={player.avatar} width={52} height={52} />
                    {player.inSeason ? <i className="is"><SeasonIcon inSeason size={9} /></i> : null}
                  </span>
                  <b>{player.name.split(" ").slice(-1)[0]}</b>
                  <span>{player.games.map((game) => `${game.venue === "H" ? "v" : "@"} ${short(game.opponent)}`).join(" · ")}</span>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
      <Options week={week} />
    </section>
  );
}

export function Options({ week }: { week: GameweekPlan }) {
  if (!week.playable.length) return <div />;
  return (
    <div>
      <div className="pl-subhead">
        <span>You can play</span>
        <span>lineups</span>
      </div>
      <ul className="pl-opts">
        {week.playable.map((option) => (
          <li key={option.key}>
            <Foil rarity={option.rarity} className="sm" />
            <span className="nm">
              {option.name}
              <small>
                {option.group !== "Room" ? <SeasonIcon inSeason={option.group === "In-season"} /> : null}
                {formatOf({ group: option.group, size: option.size, subSlots: option.subs, minInSeason: 0, cap: option.cap })}</small>
            </span>
            <span className={`fee${option.fee ? "" : " free"}`}>
              {option.fee ? (
                <>
                  <Essence size={12} />
                  {option.fee}
                </>
              ) : (
                "Free"
              )}
            </span>
            <span className="mx">
              {option.max}
              <small>×</small>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Folds({ week }: { week: GameweekPlan }) {
  return (
    <>
      {week.notWorth.length ? (
        <details className="pl-fold">
          <summary>
            Also open <span>· {week.notWorth.length}</span>
            <Chevron className="" />
          </summary>
          <ul>
            {week.notWorth.map((option) => (
              <li key={option.name}>
                <Foil rarity="limited" className="sm" />
                <b>{option.name}</b>
                <em>
                  {chanceLabel(option.pReturn)} reward chance{option.fee ? ` · ${option.fee} to enter` : ""}
                </em>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {week.blocked.length ? (
        <details className="pl-fold">
          <summary>
            Not playable <span>· {week.blocked.length}</span>
            <Chevron className="" />
          </summary>
          <ul>
            {week.blocked.map((item, index) => (
              <li key={`${item.name}-${index}`}>
                <Foil rarity={item.rarity} className="sm" />
                <b>{item.name}</b>
                <em>{item.why}</em>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <details className="pl-fold">
        <summary>
          How subs and plans work
          <Chevron className="" />
        </summary>
        <ul className="pl-rules">
          {RULES.map(([mark, title, text]) => (
            <li key={title}>
              <span className="ic">{mark}</span>
              <span>
                <b>{title}</b> {text}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}

const RULES: [string, string, string][] = [
  ["2", "Two subs, and only where a competition has them.", "One goalkeeper, one outfield player. Rooms of 10 have none."],
  [
    "↺",
    "A sub only covers a player who doesn't play at all.",
    "Goalkeeper for goalkeeper; outfield for the same position, or anyone in the Extra slot. A late cameo counts as playing.",
  ],
  [
    "4",
    "In-season lineups keep four in-season cards.",
    "A Classic sub can't come in if that would leave three, so Sofix only benches in-season cards there.",
  ],
  [
    "−",
    "A sub costs the lineup its bonuses.",
    "When one comes in the multi-club (+2%) and cap (+4%) bonuses go, and a sub never gets the captain's.",
  ],
  [
    "1",
    "Benches are optional, and filled last.",
    "Every card that can start does; only what is left over goes on a bench, and only when it is worth more than the bonuses it risks.",
  ],
  [
    "$",
    "Cash and essence count side by side.",
    "Plans are ranked on both at once, each against the best any plan reaches this gameweek; one is never turned into the other.",
  ],
];

function short(name: string): string {
  return name.length <= 12 ? name : `${name.slice(0, 11)}…`;
}
