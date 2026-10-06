import type { GameweekPlan, Sorare } from "../../lib/play";
import {
  allocation,
  cashLabel,
  chanceLabel,
  essenceLabel,
  formatOf,
  insideRange,
  lastMeta,
  lastWeek,
  likelyResult,
  nextWeek,
  rangeScale,
  resultLabel,
  scoringWeek,
  timeUntil,
  waitingFor,
} from "../../lib/play";
import { Cash, Essence, Foil, GROUP_COLOUR } from "../play/bits";
import EnteredLineups from "../play/EnteredLineups";
import SorareImage from "../play/SorareImage";
import HomeTile from "./HomeTile";
import type { LineupsGlance } from "../../lib/lineups";
import { freshLabel } from "../../lib/fresh";
import { noun } from "../../lib/words";
import TeamNewsTile from "./TeamNewsTile";

const madrid = (iso: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", ...options }).format(new Date(iso));
const weekday = (iso: string) => madrid(iso, { weekday: "short" });
const clock = (iso: string) => madrid(iso, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/**
 * The Sorare row on the home: the gameweek being planned (its best plan, or what it is still waiting for),
 * the gameweek just played against what really happened, and your cards.
 * Everything is computed by the job; these tiles only draw it. Design: docs/sorare/design/S2-home-v2.html.
 */
export default function SorareTiles({
  data,
  selected,
  now,
  glance,
}: {
  data: Sorare;
  selected: { slug: string; number: number } | null;
  now: Date;
  glance: LineupsGlance | null;
}) {
  const played = lastWeek(data);
  return (
    <>
      <div className="hm-sec">
        <h2>
          <span className="foil limited stack" aria-hidden="true" />
          Sorare
        </h2>
        <span>
          {data.user}
          {data.generatedAt ? ` · synced ${freshLabel(data.generatedAt, now)}` : ""}
        </span>
      </div>
      {selected ? <EnteredLineups week={selected} /> : null}
      <PlayTile week={nextWeek(data)} now={now} />
      <TeamNewsTile week={nextWeek(data)} now={now} glance={glance} />
      {played && played.plans.length ? <LastTile week={played} scoring={scoringWeek(data)} /> : null}
      <CardsTile data={data} />
    </>
  );
}

export function PlayTile({ week, now }: { week: GameweekPlan; now: Date }) {
  const plan = week.plans[0];
  const lock = timeUntil(week.gameweek.lock, now);
  const meta = `Sorare GW${week.gameweek.number} · locks ${weekday(week.gameweek.lock)} ${clock(week.gameweek.lock)}`;
  if (!plan) return <WaitingTile week={week} now={now} meta={meta} />;
  const parts = allocation(plan);
  const likely = likelyResult(plan);
  return (
    <HomeTile id="hm-play" title="Play" meta={meta} href="/play" className="hm-play" index={3}>
      <div className="hm-play-grid">
        <div className="hm-play-a">
          <Ring value={plan.pAny} label="any reward" />
          <div className="hm-play-side">
            <span>
              <b>{plan.lineups.length}</b> {noun(plan.lineups.length, "lineup")}
            </span>
            {plan.lineups.some((lineup) => lineup.expected) ? (
              <span>
                <b>{plan.lineups.filter((lineup) => lineup.expected).length}</b> expected
              </span>
            ) : null}
            <span>
              <b>{plan.cardsUsed}</b> of {plan.cardsAvailable} cards
            </span>
            <span>
              <b>
                {lock.past ? "locked" : `${lock.days ? `${lock.days} d ` : ""}${lock.hours} h`}
              </b>{" "}
              {lock.past ? "" : "to the lock"}
            </span>
          </div>
        </div>
        <div className="hm-play-b">
          <div className="hm-pair">
            <div>
              <span className="lbl">
                <Essence /> Essence
              </span>
              <b>{essenceLabel(likely.essence)}</b>
              <small>most likely · {chanceLabel(likely.p)}</small>
            </div>
            <div>
              <span className="lbl">
                <Cash /> Cash
              </span>
              <b>{cashLabel(likely.cash)}</b>
              <small>most likely</small>
            </div>
          </div>
          <div className="hm-alloc" role="img" aria-label="Cards by competition">
            {parts.map((part) => (
              <i key={part.group} style={{ flex: part.cards, background: GROUP_COLOUR[part.group] }} />
            ))}
          </div>
        </div>
        <div className="hm-play-c">
          <div className="hm-subhead">
            <span>Plan 1 · the best</span>
            <span>xScore · chance</span>
          </div>
          <ul className="hm-lurows">
            {plan.lineups.slice(0, 6).map((lineup, index) => {
              const tone = lineup.pReturn >= 0.5 ? "" : lineup.pReturn >= 0.2 ? "mid" : "low";
              return (
                <li key={`${lineup.key}-${index}`}>
                  <Foil rarity={lineup.rarity} className="sm" />
                  <span className="nm">
                    {lineup.comp}
                    <small>{formatOf(lineup)}</small>
                  </span>
                  <span className="xs">{lineup.x}</span>
                  <span className="pc">{chanceLabel(lineup.pReturn)}</span>
                  <span className={`pl-meter ${tone}`.trim()}>
                    <i style={{ width: `${Math.round(lineup.pReturn * 100)}%` }} />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </HomeTile>
  );
}

export function WaitingTile({ week, now, meta }: { week: GameweekPlan; now: Date; meta: string }) {
  const until = week.projectionsAt ? timeUntil(week.projectionsAt, now) : null;
  const reason = waitingFor(week, now);
  return (
    <HomeTile id="hm-play" title="Play" meta={meta} href="/play" className="hm-play" index={3}>
      <div className="hm-play-grid wait">
        <div className="hm-play-a">
          <div className="hm-count-in">
            <b>{week.playing.cards}</b>
            <span>of your cards play</span>
          </div>
          <div className="hm-faces">
            {week.playing.players.slice(0, 9).map((player) => (
              <div className="pl-face" key={player.name}>
                <span className="av">
                  <SorareImage src={player.avatar} width={52} height={52} />
                  {player.inSeason ? <i className="is" /> : null}
                </span>
                <b>{player.name.split(" ").slice(-1)[0]}</b>
                <span>{player.games.map((game) => `${game.venue === "H" ? "v" : "@"} ${game.opponent.slice(0, 10)}`).join(" · ")}</span>
              </div>
            ))}
          </div>
          <p className="hm-waitline">
            <b>
              {week.projectionsAt && until && !until.past
                ? `Your 5 best plans: ${weekday(week.projectionsAt)} ${clock(week.projectionsAt)}`
                : "Your 5 best plans as soon as the numbers are in"}
            </b>
            <span>{reason}</span>
          </p>
        </div>
        <div className="hm-play-c">
          <div className="hm-subhead">
            <span>You can play</span>
            <span>lineups</span>
          </div>
          <ul className="pl-opts">
            {week.playable.slice(0, 7).map((option) => (
              <li key={option.key}>
                <Foil rarity={option.rarity} className="sm" />
                <span className="nm">
                  {option.name}
                  <small>
                    {formatOf({ group: option.group, size: option.size, subSlots: option.subs, minInSeason: 0, cap: option.cap })}
                  </small>
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
      </div>
    </HomeTile>
  );
}

export function LastTile({ week, scoring }: { week: GameweekPlan; scoring: { number: number } | null }) {
  const plan = week.plans[0];
  if (!plan) return null;
  const inside = insideRange(plan);
  return (
    <HomeTile
      id="hm-last"
      title="Last gameweek"
      meta={lastMeta(week, scoring)}
      href={`/play?gw=${week.gameweek.id}&after=1`}
      className="hm-last"
      index={4}
    >
      <div className="hm-hero">
        <div className="who">
          <b>
            {inside} of {plan.lineups.length} inside the range
          </b>
          <span>Plan 1 · most likely was {resultLabel(likelyResult(plan))}</span>
        </div>
        <div className="num">
          <b>{essenceLabel(plan.actual?.essence ?? 0)}</b>
          <span>essence won</span>
        </div>
      </div>
      <div className="hm-pva">
        {plan.lineups.slice(0, 6).map((lineup, index) => {
          const scale = rangeScale(lineup, true);
          const actual = lineup.actual;
          if (!actual) return null;
          const need = actual.need ?? lineup.need ?? lineup.x;
          const won = actual.cash ? cashLabel(actual.cash) : actual.essence > 0 ? essenceLabel(actual.essence) : actual.card ? "card" : "—";
          return (
            <div className="hm-pva-row" key={`${lineup.key}-${index}`}>
              <span className="nm">{lineup.comp}</span>
              <span
                className="hm-rv"
                role="img"
                aria-label={`${lineup.comp}: predicted ${lineup.x} (${lineup.lo} to ${lineup.hi}), scored ${actual.total}, ${need} needed`}
              >
                <span className="rail" />
                <span className="band" style={{ left: `${scale.at(lineup.lo)}%`, width: `${scale.at(lineup.hi) - scale.at(lineup.lo)}%` }} />
                <span className="need" style={{ left: `${scale.at(need)}%` }} />
                <span className="x" style={{ left: `${scale.at(lineup.x)}%` }} />
                <span className="act" style={{ left: `${scale.at(actual.total)}%` }} />
              </span>
              <span className={`res${won === "—" ? " none" : ""}`}>{won}</span>
            </div>
          );
        })}
      </div>
      <div className="hm-rv-key">
        <span>
          <i style={{ boxShadow: "inset 0 0 0 2px var(--ink)" }} />
          predicted
        </span>
        <span>
          <i style={{ background: "var(--accent)" }} />
          scored
        </span>
        <span>
          <i style={{ width: 2, borderRadius: 1, background: "var(--ink)" }} />
          needed
        </span>
      </div>
    </HomeTile>
  );
}

function CardsTile({ data }: { data: Sorare }) {
  const positions = ["GK", "DEF", "MID", "FWD"] as const;
  const counts = positions.map((position) =>
    Object.values(data.cards.byPosition).reduce((total, group) => total + (group[position] ?? 0), 0),
  );
  const shades = ["#1d1d1f", "#5e5e63", "#aeaeb2", "#d1d1d6"];
  const sealed = data.cards.excluded.filter((card) => card.why === "sealed").length;
  const other = data.cards.excluded.length - sealed;
  return (
    <HomeTile id="hm-cards" title="Gallery" meta={data.user} href="/cards" className="hm-cards" index={5}>
      <div className="hm-cards-grid">
        <div>
          <span className="lbl">You can play</span>
          <div className="hm-kv">
            <b>{data.cards.usable}</b>
            <span>of {data.cards.total}</span>
          </div>
        </div>
        <div>
          <span className="lbl">By rarity</span>
          <div className="hm-rar">
            <span>
              <Foil rarity="limited" />
              {data.cards.byRarity.limited ?? 0}
            </span>
            <span>
              <Foil rarity="rare" />
              {data.cards.byRarity.rare ?? 0}
            </span>
          </div>
          <span className="lbl">
            <b>{data.cards.inSeason}</b> in-season
          </span>
        </div>
        <div>
          <span className="lbl">By position</span>
          <div className="hm-posline" role="img" aria-label={positions.map((p, i) => `${p} ${counts[i]}`).join(", ")}>
            {counts.map((count, index) => (
              <i key={positions[index]} style={{ flex: count, background: shades[index] }} />
            ))}
          </div>
          <div className="hm-poskey">
            {positions.map((position, index) => (
              <span key={position}>
                {position} <b>{counts[index]}</b>
              </span>
            ))}
          </div>
        </div>
        <div>
          {data.cards.rareGoalkeepers === 0 && (data.cards.byRarity.rare ?? 0) > 0 ? (
            <div className="hm-warn">
              <Foil rarity="rare" />
              <div>
                <b>No Rare goalkeeper</b>
                <br />
                <span>Rare competitions stay locked; your {data.cards.byRarity.rare} Rares play in Limited ones.</span>
              </div>
            </div>
          ) : null}
          <span className="lbl">
            {sealed ? `${sealed} sealed` : ""}
            {sealed && other ? " · " : ""}
            {other ? `${other} for sale or in an offer` : ""}
            {sealed || other ? " · left out" : "every card is playable"}
          </span>
        </div>
      </div>
    </HomeTile>
  );
}

function Ring({ value, label }: { value: number; label: string }) {
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
