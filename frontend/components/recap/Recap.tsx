import Link from "next/link";
import { lineupActual, type ActualScores } from "../../lib/lineupScores";
import { useId, type CSSProperties, type ReactNode } from "react";
import { scoreColour } from "../../lib/cards";
import type { MissionPlan } from "../../lib/missions";
import { SOURCE_SHORT, SOURCE_NAME, cashLabel, chanceLabel, essenceLabel, rewardSplit, type Tier } from "../../lib/play";
import type { AfterRow, BestCard, BoardMatch, NewsItem, PlanRow } from "../../lib/recap";
import type { GridTeam } from "../../lib/types";
import { formatDay, formatShortKickoff } from "../../lib/grid";
import CardArt from "../cards/CardArt";
import Crest from "../Crest";
import SeasonIcon from "../SeasonIcon";
import { ComparisonCards, ComparisonScores } from "./LineupComparison";

/**
 * The Recap blocks (plans/restructure.md, R2; design canvas board 1). Every number is drawn from the payloads as they
 * are; colours are Sorare's score bands (lib/cards.ts) for any number from 0 to 100.
 */

const pct = (p: number | null) => (p === null ? "–" : `${Math.round(p * 100)}%`);
const band = (value: number | null): CSSProperties => {
  if (value === null) return { background: "var(--track)", color: "var(--ink-2)" };
  const { fill, ink } = scoreColour(value);
  return { background: fill, color: ink };
};

// ------------------------------------------------------------------------------------------------- best cards
export function BestCards({ cards, gw }: { cards: BestCard[]; gw: number | null }) {
  if (!cards.length) return null;
  return (
    <section className="rc-best" aria-label={`Your best cards${gw ? `, Sorare GW${gw}` : ""}, by xScore`}>
      {cards.map((card, i) => (
        <figure className="rc-card" key={card.name} style={{ animationDelay: `${i * 45}ms` }}>
          <span className={`rc-art ${card.rarity}`}>
            <CardArt src={card.pic} name={card.name} />
            <span className="rc-rank" aria-hidden="true">{i + 1}</span>
          </span>
          <span className="rc-hex" style={band(card.x)} title={`xScore ${card.x.toFixed(1)}`}>
            {Math.round(card.x)}
          </span>
          <figcaption>
            <b>{card.name}</b>
            {card.game ? <span>{card.game}</span> : null}
            {card.start !== null ? (
              <span className="rc-chip" style={band(card.start * 100)} title={card.source ? `${pct(card.start)} to start · ${SOURCE_SHORT[card.source]}: ${SOURCE_NAME[card.source]}` : undefined}>
                {pct(card.start)} start
              </span>
            ) : null}
          </figcaption>
        </figure>
      ))}
    </section>
  );
}

// ----------------------------------------------------------------------------------------------- the round
export type RowSide = { team: GridTeam; win: number | null; xg: number | null; xd: number | null; cleanSheet: number | null };

function RowTeam({ side, favourite, link }: { side: RowSide; favourite: boolean; link: boolean }) {
  const className = favourite ? "rc-tm fav" : "rc-tm";
  const inner = (
    <>
      <Crest team={side.team} size={26} />
      <span>{side.team.name}</span>
    </>
  );
  return link ? (
    <Link className={className} href={`/team/${side.team.code}`} prefetch={false}>{inner}</Link>
  ) : (
    <span className={className}>{inner}</span>
  );
}

function RowStats({ side }: { side: RowSide }) {
  return (
    <span className="rc-sts">
      <span title="Expected goals"><b>{side.xg === null ? "–" : side.xg.toFixed(2)}</b><small>xG</small></span>
      <span title="Expected decisive actions: goals, assists and the other positive decisive actions"><b>{side.xd === null ? "–" : side.xd.toFixed(1)}</b><small>xD</small></span>
      <span title="Chance of a clean sheet"><b>{pct(side.cleanSheet)}</b><small>clean sheet</small></span>
    </span>
  );
}

const share = (p: number | null): CSSProperties => ({ flex: `${Math.max(p ?? 0.33, 0.01)} 1 0` });

/**
 * One match as the Recap and the Fixtures page draw it: each side's name with its own xG and clean-sheet chance under it,
 * the win / draw / win bar between them, and the one number that belongs to both (both teams score) under the bar.
 */
export function MatchRow({ className = "", style, label, when, home, away, draw, bothScore, extra, linkTeams = false }: {
  className?: string;
  style?: CSSProperties;
  label: string;
  when: ReactNode;
  home: RowSide;
  away: RowSide;
  draw: number | null;
  bothScore: number | null;
  extra?: ReactNode;
  linkTeams?: boolean;
}) {
  const homeFav = home.win !== null && away.win !== null && home.win > away.win;
  const awayFav = home.win !== null && away.win !== null && away.win > home.win;
  const text = `${home.team.name} win ${pct(home.win)}, draw ${pct(draw)}, ${away.team.name} win ${pct(away.win)}`;
  return (
    <div className={`rc-mt ${className}`.trim()} style={style} role="group" aria-label={label}>
      {when}
      <div className="rc-side home">
        <RowTeam side={home} favourite={homeFav} link={linkTeams} />
        <RowStats side={home} />
      </div>
      <div className="rc-mid">
        <div className="rc-bar" role="img" aria-label={text} title={text}>
          <span className="rc-win" style={{ ...share(home.win), ...band(home.win === null ? null : home.win * 100) }}>{pct(home.win)}</span>
          <span className="rc-dr" style={share(draw)}>{pct(draw)}</span>
          <span className="rc-win" style={{ ...share(away.win), ...band(away.win === null ? null : away.win * 100) }}>{pct(away.win)}</span>
        </div>
        <span className="rc-both"><b>{pct(bothScore)}</b><small>both score</small></span>
        {extra}
      </div>
      <div className="rc-side away">
        <RowTeam side={away} favourite={awayFav} link={linkTeams} />
        <RowStats side={away} />
      </div>
    </div>
  );
}

export function RoundBoard({ matches, href }: { matches: BoardMatch[]; href?: string }) {
  const days: { label: string; matches: BoardMatch[] }[] = [];
  for (const match of matches) {
    const label = `${formatShortKickoff(match.kickoff).split(" ")[0]} ${formatDay(match.kickoff)}`;
    const last = days[days.length - 1];
    if (last?.label === label) last.matches.push(match);
    else days.push({ label, matches: [match] });
  }
  return (
    <section className="hm-tile rc-round" aria-labelledby="rc-round-h">
      <div className="rc-th">
        <h2 id="rc-round-h">This round</h2>
        <span>who is likely to win, and the goals behind it</span>
        {href ? <Link href={href}>All games ›</Link> : null}
      </div>
      {days.map((day) => (
        <div key={day.label}>
          <h3 className="rc-day">{day.label}</h3>
          {day.matches.map((m) => (
            <MatchRow
              key={m.fixtureId}
              label={`${m.home.team.name} v ${m.away.team.name}`}
              when={<time className="rc-when" dateTime={m.kickoff}>{m.score ?? (m.confirmed ? formatShortKickoff(m.kickoff).split(" ")[1] : "TBC")}</time>}
              home={m.home}
              away={m.away}
              draw={m.draw}
              bothScore={m.bothScore}
            />
          ))}
        </div>
      ))}
    </section>
  );
}

// ------------------------------------------------------------------------------------------ table after the round
export function TableAfter({ rows, round, href }: { rows: AfterRow[]; round: number; href?: string }) {
  return (
    <section className="hm-tile rc-table" aria-labelledby="rc-table-h">
      <div className="rc-th">
        <h2 id="rc-table-h">Table after round {round}</h2>
        {href ? <Link href={href}>Season ›</Link> : null}
      </div>
      <table>
        <thead>
          <tr><th scope="col"><span className="visually-hidden">Place</span></th><th scope="col">Club</th><th scope="col">Now</th><th scope="col">After</th><th scope="col"><span className="visually-hidden">Moved</span></th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.team.code} className={row.position === 5 || row.position === rows.length - 2 ? "cut" : undefined}>
              <td>{row.position}</td>
              <td><span className="rc-tm"><Crest team={row.team} size={18} /><span>{row.team.name}</span></span></td>
              <td className="dim">{row.now}</td>
              <td><b>{row.after.toFixed(1)}</b></td>
              <td className={row.moved > 0 ? "up" : row.moved < 0 ? "dn" : "dim"}>{row.moved > 0 ? `▲${row.moved}` : row.moved < 0 ? `▼${-row.moved}` : "·"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// --------------------------------------------------------------------------------------------- your lineups
const KIND_WORD = { xp: "XP", essence: "Essence", cash: "Cash", card: "Card" } as const;

/** What one reward level hands out, in the owner's words: "$5", "250 essence", "Card", "100 XP". */
function tierPays(tier: Tier): string {
  const parts = [
    tier.cash ? cashLabel(tier.cash) : null,
    tier.essence ? `${essenceLabel(tier.essence)} essence` : null,
    tier.card ? "Card" : null,
    tier.xp ? `${tier.xp} XP` : null,
  ].filter(Boolean);
  const where = tier.label ?? (tier.card && tier.hi ? `top ${tier.hi.toLocaleString("en-GB")}` : null);
  return [parts.join(" + ") || "No reward", where].filter(Boolean).join(", ");
}

export const InfoIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <circle cx="9" cy="5" r="1.2" fill="currentColor" />
    <path d="M9 8.2v5.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

/** Everything behind the row's one reward chance: each kind of reward, each level with the score it took, and the lineup's fine print. */
function RewardInfo({ row }: { row: PlanRow }) {
  const { lineup } = row;
  const id = useId();
  const order = ["xp", "essence", "cash", "card"] as const;
  const split = rewardSplit(lineup);
  const kinds = split
    ? order.map((kind) => ({ label: KIND_WORD[kind], p: split.find((one) => one.kind === kind)?.p ?? 0 }))
    : [{ label: "Cash or essence", p: row.cashOrEssence }, { label: "Card", p: row.other }];
  return (
    <>
      <button type="button" className="rc-info-btn" popoverTarget={id} aria-label={`All reward chances, ${lineup.comp}`}>
        <InfoIcon />
      </button>
      <div id={id} popover="auto" className="rc-info" role="group" aria-label={`Reward chances, ${lineup.comp}`}>
        <dl className="rc-kinds">
          {kinds.map((kind) => (
            <div key={kind.label} className={kind.p ? undefined : "none"}>
              <dt>{kind.label}</dt>
              <dd>{chanceLabel(kind.p)}</dd>
            </div>
          ))}
        </dl>
        {lineup.tiers.length ? (
          <table>
            <thead>
              <tr><th scope="col">Reward</th><th scope="col">Needs</th><th scope="col">Chance</th></tr>
            </thead>
            <tbody>
              {[...lineup.tiers].reverse().map((tier, i) => (
                <tr key={i} className={tier.p ? undefined : "none"}>
                  <th scope="row">{tierPays(tier)}</th>
                  <td>{tier.need ?? "–"}</td>
                  <td>{chanceLabel(tier.p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        <p>
          Expected range {Math.round(lineup.lo)} to {Math.round(lineup.hi)}
          <br />
          {lineup.entries.toLocaleString("en-GB")} managers ·{" "}
          <span className="rc-mode">
            {lineup.group !== "Room" ? <SeasonIcon inSeason={lineup.group === "In-season"} /> : null}
            {lineup.rarity === "limited" ? "Limited" : lineup.rarity === "rare" ? "Rare" : lineup.rarity}
            {lineup.group === "In-season" ? ", in season" : `, ${lineup.size} cards`}
          </span>
        </p>
      </div>
    </>
  );
}

export function LineupRow({ row, scores = {} }: { row: PlanRow; scores?: ActualScores }) {
  const { lineup } = row;
  const actual = lineupActual(lineup, scores);
  return (
    <div className="rc-lu">
      <div className="rc-lu-c">
        <b>{lineup.comp}</b>
        {lineup.expected ? <span className="rc-tag">Expected</span> : null}
      </div>
      <ComparisonCards cards={[...lineup.starters, ...lineup.subs].map((c, i) => {
        const got = scores[c.slug];
        return { slug: c.slug, name: c.name, picture: c.pic, rarity: c.rarity, captain: !!c.captain, bench: i >= lineup.starters.length, xd: c.xd, x: c.x,
          score: lineup.actual ? c.actual : got?.played ? got.score : null,
          why: (lineup.actual ? c.actual === null : got && !got.played) ? "Did not play" : "Not played yet" };
      })} />
      <div className="rc-score">
        <ComparisonScores expected={lineup.x} actual={actual.value} actualLabel={actual.value !== null && !actual.complete ? "Actual so far" : "Actual"} xd={lineup.xd ?? null} />
      </div>
      <div className="rc-rew">
        <div className="rc-any" title="The chance of any cash, essence or card">
          <b>{chanceLabel(lineup.pReturn)}</b>
          <span>Reward</span>
        </div>
        <RewardInfo row={row} />
      </div>
    </div>
  );
}

export function PlanLineups({ rows, show = rows.length, href, scores = {} }: { rows: PlanRow[]; show?: number; href: string; scores?: ActualScores }) {
  const rest = rows.slice(show);
  return (
    <>
      {rows.slice(0, show).map((row, i) => (
        <LineupRow key={`${row.lineup.key}-${i}`} row={row} scores={scores} />
      ))}
      {rest.length ? (
        <div className="rc-rest">
          <span>{rest.length} more:</span>
          {rest.map((row, i) => (
            <span className="rc-chip quiet" key={`${row.lineup.key}-r${i}`} title={`${row.lineup.comp}: team score ${Math.round(row.lineup.x)}, ${pct(row.cashOrEssence)} chance of cash or essence`}>
              {row.lineup.comp} {Math.round(row.lineup.x)}, {pct(row.cashOrEssence)}
            </span>
          ))}
          <Link href={href}>Plan ›</Link>
        </div>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------------------------------------- missions
export function MissionsGlance({ plans, day, current, href }: { plans: MissionPlan[]; day: string | null; current: boolean; href: string }) {
  const open = plans.filter((one) => one.picks.length);
  return (
    <section className="hm-tile rc-missions" aria-labelledby="rc-ms-h">
      <div className="rc-th">
        <h2 id="rc-ms-h">Missions</h2>
        <span>{day ? new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`)) : "today"}{plans.length ? `, ${plans.length} open` : ""}</span>
        <Link href={href}>Missions ›</Link>
      </div>
      {current ? null : <p className="rc-none">Today&rsquo;s missions aren&rsquo;t loaded yet. Load them on the Missions page.</p>}
      {open.length ? (
        <div className="rc-msn">
          {open.map((one) => (
            <div className="rc-ms" key={one.mission.id}>
              <b>{one.mission.title}</b>
              <span>{one.rule.label}{one.reward ? `. ${one.reward}` : ""}</span>
              <ol>
                {one.picks.slice(0, 3).map((pick) => (
                  <li key={pick.slug}>
                    <span className="rc-art"><CardArt src={pick.pic} name={pick.name} /></span>
                    <strong>{pct(pick.chance)}</strong>
                    <Link href={`/players/${pick.slug}`}>{pick.name}</Link>
                    <span>{pick.venue === "H" ? "v" : "at"} {pick.opponent}, {formatShortKickoff(pick.kickoff).split(" ")[1]}</span>
                    {pick.average ? <span className="rc-l5">{one.rule.kind === "decisive" || one.rule.kind === "booked" ? pct(pick.average.l5) : pick.average.l5.toFixed(1)} last 5</span> : null}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      ) : (
        <p className="rc-none">{plans.length ? "No ranked suggestions. Review your eligible cards on Missions." : current ? "No missions on Sorare today." : null}</p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------- news
function NewsCard({ item }: { item: NewsItem }) {
  const tone = item.kind === "out" || item.kind === "suspended" ? "out" : item.kind === "doubt" ? "doubt" : "back";
  return (
    <li className="rc-nw">
      <span className={`rc-art ${item.rarity}`}>
        <CardArt src={item.pic} name={item.name} />
        <span className={`rc-tag-dot ${tone}`} aria-hidden="true">{tone === "back" ? "✓" : tone === "out" ? "+" : "?"}</span>
      </span>
      <span>
        <b>{item.name}</b>
        {item.cause ? <span>{item.cause}</span> : null}
        <span className="dim">{[item.note, item.since].filter(Boolean).join(", ")}</span>
        {item.start !== null ? <span className="rc-chip" style={band(item.start * 100)}>{pct(item.start)} start</span> : <span className="rc-chip" style={band(0)}>{tone === "out" ? "Out" : "Doubt"}</span>}
      </span>
    </li>
  );
}

export function WeekNews({ hurt, back, readAt, href }: { hurt: NewsItem[]; back: NewsItem[]; readAt: string | null; href: string }) {
  return (
    <section className="hm-tile rc-news" aria-labelledby="rc-news-h">
      <div className="rc-th">
        <h2 id="rc-news-h">News this week</h2>
        {readAt ? <span>Futbol Fantasy, read {readAt}</span> : null}
        <Link href={href}>Probable elevens ›</Link>
      </div>
      {hurt.length || back.length ? (
        <div className="rc-news-cols">
          <div>
            <h3><i className="out" />Hurt this week</h3>
            {hurt.length ? <ol>{hurt.map((item) => <NewsCard key={item.name} item={item} />)}</ol> : <p className="rc-none">Nobody new.</p>}
          </div>
          <div>
            <h3><i className="back" />Back this week</h3>
            {back.length ? <ol>{back.map((item) => <NewsCard key={item.name} item={item} />)}</ol> : <p className="rc-none">Nobody back.</p>}
          </div>
        </div>
      ) : (
        <p className="rc-none">No injury news about your players this week.</p>
      )}
    </section>
  );
}
