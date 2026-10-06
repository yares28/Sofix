import Link from "next/link";
import type { CSSProperties } from "react";
import { scoreColour } from "../../lib/cards";
import type { MissionPlan } from "../../lib/missions";
import { SOURCE_SHORT, SOURCE_NAME } from "../../lib/play";
import type { AfterRow, BestCard, BoardMatch, NewsItem, PlanRow } from "../../lib/recap";
import { formatDay, formatShortKickoff } from "../../lib/grid";
import CardArt from "../cards/CardArt";
import Crest from "../Crest";
import SeasonIcon from "../SeasonIcon";

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
function Side({ side }: { side: BoardMatch["home"] }) {
  const xg = side.xg;
  return (
    <>
      <span className={side.favourite ? "rc-tm fav" : "rc-tm"}>
        <Crest team={side.team} size={22} />
        <span>{side.team.name}</span>
      </span>
      <span className="rc-chip rc-win" style={band(side.win === null ? null : side.win * 100)}>{pct(side.win)}</span>
      <span className="rc-met" title="Expected goals">
        <span><i style={{ width: `${Math.min(100, ((xg ?? 0) / 2.5) * 100)}%`, background: "var(--ink)" }} /></span>
        <b>{xg === null ? "–" : xg.toFixed(2)}</b>
      </span>
      <span className="rc-met" title="Clean sheet">
        <span><i style={{ width: `${Math.round((side.cleanSheet ?? 0) * 100)}%`, background: side.cleanSheet === null ? undefined : scoreColour(side.cleanSheet * 100).fill }} /></span>
        <b>{pct(side.cleanSheet)}</b>
      </span>
    </>
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
        <span>chance to win, expected goals and clean sheet for each side</span>
        {href ? <Link href={href}>All games ›</Link> : null}
      </div>
      <div className="rc-rh" aria-hidden="true">
        <span /><span /><span>Win</span><span>xG</span><span>Clean sheet</span><span>Draw · both score</span>
      </div>
      {days.map((day) => (
        <div key={day.label}>
          <h3 className="rc-day">{day.label}</h3>
          {day.matches.map((m) => (
            <div className="rc-mt" key={m.fixtureId} aria-label={`${m.home.team.name} v ${m.away.team.name}`}>
              <time dateTime={m.kickoff}>{m.score ?? (m.confirmed ? formatShortKickoff(m.kickoff).split(" ")[1] : "TBC")}</time>
              <Side side={m.home} />
              <span className="rc-ex">
                Draw <b>{pct(m.draw)}</b>
                <br />
                Both score <b>{pct(m.bothScore)}</b>
              </span>
              <Side side={m.away} />
            </div>
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
export function Ring({ value }: { value: number }) {
  return (
    <span className="rc-ring" style={{ background: `conic-gradient(var(--ink) 0 ${value * 100}%, var(--track) 0)` }}>
      <b>{pct(value)}</b>
    </span>
  );
}

export function LineupRow({ row }: { row: PlanRow }) {
  const { lineup } = row;
  return (
    <div className="rc-lu">
      <div className="rc-lu-c">
        <b>{lineup.comp}</b>
        <span className="rc-mode">
          {lineup.group !== "Room" ? <SeasonIcon inSeason={lineup.group === "In-season"} /> : null}
          {lineup.rarity === "limited" ? "Limited" : lineup.rarity === "rare" ? "Rare" : lineup.rarity}
          {lineup.group === "In-season" ? ", in season" : `, ${lineup.size} cards`}
        </span>
        <span>{lineup.entries.toLocaleString("en-GB")} managers</span>
        {lineup.expected ? <span className="rc-tag">Expected</span> : null}
      </div>
      <ol className="rc-team">
        {lineup.starters.map((card) => (
          <li key={card.slug}>
            <span className={`rc-art ${card.rarity}`}><CardArt src={card.pic} name={card.name} /></span>
            {card.captain ? <span className="rc-cap" title="Captain">C</span> : null}
            <span className="rc-hex sm" style={band(card.x)}>{Math.round(card.x)}</span>
            <span className="rc-nm">{card.name}</span>
          </li>
        ))}
      </ol>
      <div className="rc-score">
        <b>{Math.round(lineup.x)}</b>
        <span>team score, {Math.round(lineup.lo)} to {Math.round(lineup.hi)}</span>
        {lineup.need !== null ? <span>needs <em>{Math.round(lineup.need)}</em> for a reward</span> : null}
      </div>
      <div className="rc-rew">
        <Ring value={row.cashOrEssence} />
        <span>
          <b>Cash or essence</b>
          <br />
          Other rewards <b>{pct(row.other)}</b>
          {row.cash >= 0.01 || row.essence ? (
            <>
              <br />
              Pays {row.cash >= 0.01 ? <b>${row.cash.toFixed(2)}</b> : null}
              {row.cash >= 0.01 && row.essence ? " and " : null}
              {row.essence ? (
                <>
                  <b>{Math.round(row.essence)}</b> essence
                </>
              ) : null}
            </>
          ) : null}
        </span>
      </div>
    </div>
  );
}

export function PlanLineups({ rows, show, href }: { rows: PlanRow[]; show: number; href: string }) {
  const rest = rows.slice(show);
  return (
    <>
      {rows.slice(0, show).map((row, i) => (
        <LineupRow key={`${row.lineup.key}-${i}`} row={row} />
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
                    <span className="rc-l5">{one.rule.kind === "decisive" ? pct(pick.average.l5) : pick.average.l5.toFixed(1)} last 5</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      ) : (
        <p className="rc-none">{plans.length ? "None of your cards with a game still to play today fits them." : current ? "No missions on Sorare today." : null}</p>
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
