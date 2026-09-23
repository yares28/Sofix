import Link from "next/link";
import type { GameweekPlan, Plan, Sorare } from "../../lib/play";
import {
  allocation,
  cashLabel,
  chanceLabel,
  essenceLabel,
  formatOf,
  insideRange,
  timeUntil,
  waitingFor,
} from "../../lib/play";
import { Cash, Chevron, Essence, Foil, GROUP_COLOUR } from "./bits";
import Lineup from "./Lineup";
import SorareImage from "./SorareImage";

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
}: {
  data: Sorare;
  week: GameweekPlan;
  planIndex: number;
  after: boolean;
  now: Date;
}) {
  const id = week.gameweek.id;
  const plan = week.plans[planIndex];
  const href = (options: { gw?: string; plan?: number; after?: boolean }) => {
    const params = new URLSearchParams();
    const gw = options.gw ?? id;
    if (gw !== data.next.gameweek.id) params.set("gw", gw);
    const index = options.plan ?? planIndex;
    if (index > 0) params.set("plan", String(index + 1));
    const showActual = options.after ?? after;
    if (showActual) params.set("after", "1");
    const query = params.toString();
    return query ? `/play?${query}` : "/play";
  };

  return (
    <main className="pl-main">
      <Head data={data} week={week} after={after} href={href} now={now} />
      <GameweekBar data={data} week={week} href={href} />
      {plan ? (
        <>
          <PlanSwitch week={week} planIndex={planIndex} after={after} href={href} />
          <PlanHero plan={plan} week={week} after={after} />
          <div className="pl-sec">
            <h2>Lineups</h2>
            <span>{after ? "what each scored and won" : "open one for the cards, subs and rewards"}</span>
          </div>
          <div className="pl-lus">
            {plan.lineups.map((lineup, index) => (
              <Lineup key={`${lineup.key}-${index}`} lineup={lineup} after={after} index={index} />
            ))}
          </div>
        </>
      ) : (
        <Waiting week={week} now={now} />
      )}
      <Folds week={week} />
    </main>
  );
}

function Head({
  data,
  week,
  after,
  href,
  now,
}: {
  data: Sorare;
  week: GameweekPlan;
  after: boolean;
  href: (options: { gw?: string; plan?: number; after?: boolean }) => string;
  now: Date;
}) {
  const { lock, start, end } = week.gameweek;
  const locked = new Date(lock) <= now;
  const eyebrow = week.played ? "Sorare · played" : week.state === "none" ? "Sorare" : "Sorare · your gameweek";
  return (
    <header className="pl-head">
      <div>
        <p className="pl-eyebrow">
          <Foil rarity="limited" className="sm" />
          {eyebrow}
        </p>
        <h1>Gameweek {week.gameweek.number}</h1>
        <p className="pl-sub">
          <span>
            {weekday(start)} {span(start, end)}
          </span>
          <span className="dot" />
          <span>
            {locked ? "locked" : "locks"} {weekday(lock)} {clock(lock)}
          </span>
          {data.generatedAt ? (
            <>
              <span className="dot" />
              <span>updated {weekday(data.generatedAt)} {clock(data.generatedAt)}</span>
            </>
          ) : null}
        </p>
      </div>
      {week.played && week.plans.length ? (
        <div className="pl-mode" role="group" aria-label="Show">
          <Link href={href({ after: false })} aria-current={after ? undefined : "page"} scroll={false} prefetch={false}>
            Before the lock
          </Link>
          <Link href={href({ after: true })} aria-current={after ? "page" : undefined} scroll={false} prefetch={false}>
            After the games
          </Link>
        </div>
      ) : null}
    </header>
  );
}

function GameweekBar({
  data,
  week,
  href,
}: {
  data: Sorare;
  week: GameweekPlan;
  href: (options: { gw?: string; plan?: number; after?: boolean }) => string;
}) {
  const openable = new Set([data.next.gameweek.id, data.last?.gameweek.id].filter(Boolean) as string[]);
  return (
    <div className="hm-timeline">
      <div className="tl-track" role="group" aria-label="Gameweek">
        {data.timeline.map((item) => {
          const selected = item.id === week.gameweek.id;
          const dot = item.status === "done" ? "done" : item.status === "live" ? "live" : item.status === "next" ? "next" : "later";
          const extra =
            item.won !== undefined ? (
              <>
                {" · "}
                <Essence size={11} /> {essenceLabel(item.won)}
              </>
            ) : item.playing !== undefined ? (
              ` · ${item.playing} play`
            ) : null;
          const inside = (
            <>
              <span className="tl-top">
                <span className={`tl-dot ${dot}`} />
                GW{item.number}
              </span>
              <span className="tl-date">
                {span(item.start, item.end)}
                {extra}
              </span>
            </>
          );
          return openable.has(item.id) ? (
            <Link
              key={item.id}
              className={`tl-item${selected ? " on" : ""}`}
              href={href({ gw: item.id, plan: 0 })}
              aria-current={selected ? "page" : undefined}
              scroll={false}
              prefetch={false}
            >
              {inside}
            </Link>
          ) : (
            <span key={item.id} className="tl-item quiet">
              {inside}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function PlanSwitch({
  week,
  planIndex,
  after,
  href,
}: {
  week: GameweekPlan;
  planIndex: number;
  after: boolean;
  href: (options: { gw?: string; plan?: number; after?: boolean }) => string;
}) {
  return (
    <nav className="pl-plans" style={{ ["--plans" as string]: String(week.plans.length) }} aria-label="Plan">
      {week.plans.map((plan, index) => (
        <Link
          key={plan.rank}
          href={href({ plan: index })}
          aria-current={index === planIndex ? "page" : undefined}
          scroll={false}
          prefetch={false}
        >
          <span className="l1">
            Plan {plan.rank}
            {index === 0 ? <span className="best">best</span> : null}
          </span>
          <span className="l2">
            {after && plan.actual ? (
              <>
                <b>{essenceLabel(plan.actual.essence)}</b> won
              </>
            ) : (
              <>
                <b>{chanceLabel(plan.pAny)}</b> · ≈{essenceLabel(plan.essence)}
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

function PlanHero({ plan, week, after }: { plan: Plan; week: GameweekPlan; after: boolean }) {
  const parts = allocation(plan);
  const counts = new Map<string, { group: string; lineups: number; cards: number }>();
  for (const lineup of plan.lineups) {
    const entry = counts.get(lineup.comp) ?? { group: lineup.group, lineups: 0, cards: 0 };
    entry.lineups += 1;
    entry.cards += lineup.starters.length + lineup.subs.length;
    counts.set(lineup.comp, entry);
  }
  const ringValue = after && plan.actual ? plan.actual.paid / Math.max(plan.lineups.length, 1) : plan.pAny;
  const ringLabel = after ? "lineups paid" : "any reward";
  return (
    <section className="pl-hero" aria-live="polite">
      <div className="pl-id">
        <p className="pl-eyebrow" style={{ margin: 0 }}>
          Plan {plan.rank} of {week.plans.length}
        </p>
        <div className="pl-name">
          <Foil rarity="limited" className="lg" />
          <h2>
            {plan.lineups.length} lineup{plan.lineups.length === 1 ? "" : "s"}
          </h2>
        </div>
        <div className="pl-ring-row">
          <RingBlock value={ringValue} label={ringLabel} />
          <div className="pl-side">
            {after && plan.actual ? (
              <>
                <span>
                  <b>
                    {plan.actual.paid} of {plan.lineups.length}
                  </b>{" "}
                  lineups paid
                </span>
                <span>
                  <b>
                    {insideRange(plan)} of {plan.lineups.length}
                  </b>{" "}
                  inside the range
                </span>
              </>
            ) : (
              <>
                <span>
                  <b>{plan.rewards.toFixed(1)}</b> rewards expected
                </span>
                <span>
                  <b>{plan.cardsUsed}</b> of {plan.cardsAvailable} cards used
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="pl-nums">
        <div className="pl-pair">
          <div className={after ? "won" : ""}>
            <span className="lbl">
              <Essence /> Essence{after ? " won" : ""}
            </span>
            <b>
              {after && plan.actual ? essenceLabel(plan.actual.essence) : `≈${essenceLabel(plan.essence)}`}
            </b>
            <small>{after ? `expected ≈${essenceLabel(plan.essence)}` : "expected"}</small>
          </div>
          <div className={after ? "won" : ""}>
            <span className="lbl">
              <Cash /> Cash{after ? " won" : ""}
            </span>
            <b>{after && plan.actual ? cashLabel(plan.actual.cash) : `≈${cashLabel(plan.cash)}`}</b>
            <small>{after ? `expected ≈${cashLabel(plan.cash)}` : "expected · never converted"}</small>
          </div>
        </div>
        <div className="pl-actions">
          <span className="pl-btn" title="Saving lineups to Sorare arrives with the extension step">
            Apply plan
          </span>
        </div>
      </div>

      <div className="pl-alloc">
        <span className="pl-subhead">
          <span>Where your cards go</span>
          <span>
            {plan.cardsUsed} / {plan.cardsAvailable}
          </span>
        </span>
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
    </section>
  );
}

function RingBlock({ value, label }: { value: number; label: string }) {
  const circumference = 2 * Math.PI * 50;
  const tone = value >= 0.5 ? "" : value >= 0.2 ? "mid" : "low";
  return (
    <div className={`pl-ring ${tone}`.trim()} role="img" aria-label={`${chanceLabel(value)} ${label}`}>
      <svg viewBox="0 0 116 116">
        <circle className="trk" cx="58" cy="58" r="50" fill="none" strokeWidth="10" />
        <circle
          className="bar"
          cx="58"
          cy="58"
          r="50"
          fill="none"
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value)}
        />
      </svg>
      <div className="val">
        <b>
          {Math.round(value * 100)}
          <small>%</small>
        </b>
        <span>{label}</span>
      </div>
    </div>
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
                    {player.inSeason ? <i className="is" /> : null}
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
              <small>{formatOf({ group: option.group, size: option.size, subSlots: option.subs, minInSeason: 0, cap: option.cap })}</small>
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
                <em className={option.eEss >= 0 ? "pos" : "neg"}>
                  {option.eEss >= 0 ? "+" : ""}
                  {essenceLabel(option.eEss)} essence expected{option.fee ? ` · ${option.fee} to enter` : ""}
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

      <details className="pl-fold" open>
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
