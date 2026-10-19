import Link from "next/link";
import { matchHref, matchOfCard, playerHref } from "../../lib/links";
import type { Lineup as LineupData, PlayCard, PlayingPlayer } from "../../lib/play";
import { SCORE_SOURCE_NAME, cardScore, cashLabel, chanceLabel, essenceLabel, essenceName, formatOf, paysNote, startChance } from "../../lib/play";
import { KindIcon } from "../lineups/Icons";
import Silhouette from "../Silhouette";
import SourceMark from "../SourceMark";
import { ComparisonCards, ComparisonScores } from "../recap/LineupComparison";
import { InfoIcon } from "../recap/Recap";
import { cardTotal, lineupActual, type ActualScores } from "../../lib/lineupScores";
import { Cash, Chevron, Essence, Foil, GROUP_CLASS, RangeBar, RewardChips, RewardSplit, Ring, ribbonClass } from "./bits";
import LineupSheet from "./LineupSheet";
import SorareImage from "./SorareImage";
import SeasonIcon from "../SeasonIcon";

const time = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(iso),
  );

/** One lineup of a plan: what it is expected to score, what that is worth, and the cards in it. */
export default function Lineup({
  lineup,
  after,
  index,
  hindsight = false,
  players = [],
  scores = {},
}: {
  lineup: LineupData;
  after: boolean;
  index: number;
  /** A lineup built knowing the scores: what it expected is what it scored, so it does not say what it expected. */
  hindsight?: boolean;
  /** The week's playing players, whose games name the Lineups match each card opens. */
  players?: PlayingPlayer[];
  /** The scores in so far of a week being played, by card (lib/planScoresData.ts). */
  scores?: ActualScores;
}) {
  const group = GROUP_CLASS[lineup.group];
  const chance = lineup.pReturn;
  const won = after && lineup.actual ? lineup.actual.essence > 0 || lineup.actual.cash > 0 || lineup.actual.card : false;

  // One row of the plan, drawn as the Recap draws it: the competition, the cards with their score, the team score, the
  // one reward chance. The row opens the sheet, which holds the range, the reward ladder and the rules.
  const cameIn = new Set((lineup.actual?.cameIn ?? []).map((swap) => swap.sub));
  // While the week is on, a card whose game is over shows what he scored and the team its score so far, as your entered lineups do.
  const live = !after && !lineup.actual ? lineupActual(lineup, scores) : null;
  const face = (
    <div className="rc-lu">
      <div className="rc-lu-c">
        <b>{lineup.comp}</b>
        <span className={`pl-group ${group}`}>
          {lineup.group !== "Room" ? <SeasonIcon inSeason={lineup.group === "In-season"} /> : null}
          {lineup.group}
        </span>
        <span>{formatOf(lineup)}</span>
        {lineup.expected ? <span className="rc-tag">Expected · Sorare has not opened it yet</span> : null}
      </div>
      <ComparisonCards
        linked={false}
        cards={[...lineup.starters, ...lineup.subs].map((card, i) => {
          const bench = i >= lineup.starters.length;
          const got = live ? scores[card.slug] : undefined;
          const stayedOut = after && bench && !cameIn.has(card.slug);
          const score = after ? (stayedOut ? null : card.actual) : got?.played ? got.score : null;
          return { slug: card.slug, name: card.name, picture: card.pic ?? null, rarity: lineup.rarity, captain: !!card.captain, bench, xd: card.xd,
            x: hindsight ? undefined : cardScore(card).value, score, total: cardTotal(score, card, lineup.captainBonus),
            why: stayedOut ? "Stayed on the bench" : (after ? card.actual === null : got && !got.played) ? "Did not play" : "Not played yet" };
        })}
      />
      <div className="rc-score">
        <ComparisonScores
          expected={hindsight ? undefined : lineup.x}
          actual={after && lineup.actual ? lineup.actual.total : (live?.value ?? null)}
          actualLabel={hindsight ? "Scored" : live?.value != null && !live.complete ? "Actual so far" : "Actual"}
          xd={lineup.xd ?? null}
        />
      </div>
      <div className="rc-rew">
        <div className="rc-any" title={after ? undefined : "The chance of any cash, essence or card"}>
          <b>{after ? (won ? "✓" : "–") : chanceLabel(chance)}</b>
          <span>{after ? (won ? "Paid" : "No reward") : "Reward"}</span>
        </div>
        <span className="rc-info-btn" aria-hidden="true">
          <InfoIcon />
        </span>
      </div>
    </div>
  );

  const head = (
    <>
      <Foil rarity={lineup.rarity} />
      <h2>{lineup.comp}</h2>
      <span className={`pl-group ${group}`}>
          {lineup.group !== "Room" ? <SeasonIcon inSeason={lineup.group === "In-season"} /> : null}
          {lineup.group}
        </span>
      <span className="pl-fmt">{paysNote(lineup)}</span>
      {lineup.expected ? (
        <span className="pl-exp" title={`Copied from ${lineup.expectedFrom}`}>
          Expected · Sorare has not opened it yet
        </span>
      ) : null}
    </>
  );

  return (
    <LineupSheet title={`${lineup.comp} lineup`} head={head} card={face}>
      <Sheet lineup={lineup} after={after} index={index} hindsight={hindsight} players={players} />
    </LineupSheet>
  );
}

function Sheet({ lineup, after, index, hindsight, players }: { lineup: LineupData; after: boolean; index: number; hindsight: boolean; players: PlayingPlayer[] }) {
  const inSeason = lineup.starters.filter((card) => card.inSeason).length;
  const clubs = new Map<string, number>();
  for (const card of lineup.starters) clubs.set(card.club ?? "", (clubs.get(card.club ?? "") ?? 0) + 1);
  const mostFromOneClub = Math.max(...clubs.values());
  // a payload from before the job published each competition's two bonuses keeps the values every competition then had
  const room = lineup.group === "Room";
  const [clubMax, clubBonus] = lineup.clubBonus ?? (lineup.clubBonus === undefined && !room ? [2, 0.02] : [null, null]);
  const [capBonus, averageBonus] = lineup.averageBonus ?? (lineup.averageBonus === undefined && !room ? [lineup.size === 5 ? 260 : 370, 0.04] : [null, null]);
  const paid = lineup.tiers.filter((tier) => tier.cash || tier.essence || tier.card || tier.xp || tier.label);
  const pct = (value: number) => `+${Math.round(value * 100)}%`;

  return (
    <>
      <div className="pl-sum">
        {after && lineup.actual ? (
          <Ring value={lineup.actual.essence > 0 || lineup.actual.cash > 0 || lineup.actual.card ? 1 : 0} label="paid" small />
        ) : (
          <Ring value={lineup.pReturn} label="reward chance" small />
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="pl-big">
            <b>{after && lineup.actual ? lineup.actual.total : lineup.x}</b>
            <span>
              {after && lineup.actual
                ? `scored${hindsight ? "" : ` · xScore was ${lineup.x} (${lineup.lo}–${lineup.hi})`}${lineup.actual.need ? ` · ${lineup.actual.need} was needed` : ""}`
                : `xScore · ${lineup.lo}–${lineup.hi} from a bad to a good week`}
            </span>
          </div>
          {hindsight ? null : <RangeBar lineup={lineup} after={after} />}
        </div>
        <div className="pl-lu-foot" style={{ justifyContent: "flex-end" }}>
          <RewardChips lineup={lineup} after={after} />
          {after ? null : <RewardSplit item={lineup} kind={essenceName(lineup.kind)} />}
        </div>
      </div>

      <div className="pl-grid" style={{ ["--n" as string]: String(Math.min(lineup.starters.length, 7)) }}>
        {lineup.starters.map((card, i) => (
          <SheetCard key={card.slug} card={card} lineup={lineup} after={after} position={i} match={matchOfCard(card, players)} />
        ))}
      </div>

      {lineup.subs.length ? (
        <div className="pl-bench">
          <span className="lbl">Subs</span>
          {lineup.subs.map((sub) => {
            const joined = (lineup.actual?.cameIn ?? []).find((swap) => swap.sub === sub.slug);
            const replaced = joined ? lineup.starters.find((card) => card.slug === joined.for) : null;
            return (
              <div key={sub.slug} className={`pl-sub${joined ? " in" : ""}`}>
                <SorareImage src={sub.avatar} width={34} height={34} />
                <div>
                  <b>{sub.name}</b>
                  <span>
                    {sub.slot === "GK" ? "goalkeeper" : "outfield"} ·{" "}
                    <span className={`pl-tag${sub.inSeason ? "" : " classic"}`}>
                      <SeasonIcon inSeason={sub.inSeason} size={9} />
                      {sub.inSeason ? "IN-SEASON" : "CLASSIC"}
                    </span>
                    {after
                      ? joined
                        ? ` · came in for ${replaced?.name ?? "a starter"}`
                        : " · stayed out"
                      : ` · plays ${chanceLabel(sub.p)}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="pl-checks">
          <span className="off">
            {lineup.subSlots
              ? "No substitutes: every other card was worth more in another lineup"
              : "This competition has no substitutes"}
          </span>
        </div>
      )}

      <div className="pl-checks">
        {lineup.minInSeason ? <span>{`${inSeason} of ${lineup.size} in-season (${lineup.minInSeason} needed)`}</span> : null}
        {lineup.cap ? <span>{`Average total ${lineup.average} ≤ ${lineup.cap}`}</span> : null}
        {clubMax !== null && clubBonus !== null ? (
          <span className={mostFromOneClub <= clubMax ? "" : "off"}>
            Max {clubMax} per club{mostFromOneClub <= clubMax ? ` · ${pct(clubBonus)}` : ""}
          </span>
        ) : null}
        {capBonus !== null && averageBonus !== null ? (
          <span className={lineup.average <= capBonus ? "" : "off"}>
            Average total {lineup.average} {lineup.average <= capBonus ? `≤ ${capBonus} · ${pct(averageBonus)}` : `> ${capBonus}`}
          </span>
        ) : null}
        <span>Captain +{Math.round(lineup.captainBonus * 100)}%</span>
        {after && lineup.actual?.bonusLost ? <span className="off">A sub came in: the lineup bonuses dropped</span> : null}
      </div>

      <details className="pl-ladder" open={room}>
        <summary>
          Rewards <span>{room ? "· the chance of each place" : "· the score each needs, and your chance of reaching it"}</span>
          <Chevron className="" />
        </summary>
        <table>
          <tbody>
            {paid.map((tier, i) => {
              const hit =
                after &&
                lineup.actual &&
                ((tier.cash && lineup.actual.cash === tier.cash) ||
                  (tier.essence && lineup.actual.essence === tier.essence) ||
                  (tier.xp && !tier.essence && !tier.cash && lineup.actual.xp === tier.xp));
              const rank = tier.lo === tier.hi ? `#${tier.lo}` : `#${tier.lo?.toLocaleString("en-GB")}–${tier.hi?.toLocaleString("en-GB")}`;
              // All or nothing: reaching a level's score pays that level whole, so its chance is the chance of scoring at least that.
              const chance = room ? tier.p : paid.slice(0, i + 1).reduce((sum, level) => sum + level.p, 0);
              const xpOnly = Boolean(tier.xp) && !tier.cash && !tier.essence && !tier.card;
              return (
                <tr key={`${index}-${i}`} className={hit ? "hit" : ""}>
                  <td>{tier.label ?? (tier.need ? `${tier.need}+ · ${rank}` : rank)}</td>
                  <td>
                    {tier.cash ? (
                      <>
                        <Cash size={12} /> {cashLabel(tier.cash)}{" "}
                      </>
                    ) : null}
                    {tier.essence ? (
                      <>
                        <Essence size={12} /> {essenceLabel(tier.essence)}{" "}
                      </>
                    ) : null}
                    {tier.card ? "Card" : null}
                    {xpOnly ? `${tier.xp?.toLocaleString("en-GB")} XP` : null}
                  </td>
                  <td>{chanceLabel(chance)}</td>
                </tr>
              );
            })}
            {lineup.fee ? (
              <tr>
                <td>Entry</td>
                <td>
                  <Essence size={12} /> {lineup.fee} to enter
                </td>
                <td />
              </tr>
            ) : null}
          </tbody>
        </table>
      </details>
    </>
  );
}

function SheetCard({ card, lineup, after, position, match }: { card: PlayCard; lineup: LineupData; after: boolean; position: number; match: number | null }) {
  const score = cardScore(card);
  const value = after ? card.actual : score.value;
  const out = after && card.actual === null;
  const swap = after ? (lineup.actual?.cameIn ?? []).find((entry) => entry.for === card.slug) : undefined;
  const sub = swap ? lineup.subs.find((entry) => entry.slug === swap.sub) : null;
  const start = after ? null : startChance(card);
  return (
    <div className={`pl-pc${out ? " out" : ""}`} style={{ ["--i" as string]: String(position) }}>
      <Link className="art" href={playerHref(card.player ?? card.slug)} aria-label={`${card.name}: open his page`}>
        <Silhouette className="pl-sil" />
        <SorareImage src={card.pic} alt="" fill />
        {card.captain ? <span className="pl-cap">C</span> : null}
        <span className={`pl-rib ${ribbonClass(after ? card.actual : score.value)}`}>
          {value === null ? "DNP" : Math.round(value)}
        </span>
      </Link>
      <div className="pl-who">
        <b>
          {match === null ? (
            card.name
          ) : (
            <Link href={matchHref(match)} title={`${card.name}: open his match on Lineups`}>
              {card.name}
            </Link>
          )}
        </b>
        <span className="pl-fx">
          <SorareImage src={card.fixture?.opponentCrest} width={16} height={16} />
          {/* the opponent and the kickoff share one line that ends in an ellipsis, so a long club name can't widen the card */}
          <span className="t">
            {card.fixture?.opponent ? `${card.fixture.venue === "H" ? "v" : "@"} ${card.fixture.opponent}` : "no game"}
            {card.fixture?.kickoff ? ` · ${time(card.fixture.kickoff)}` : ""}
          </span>
        </span>
      </div>
      <div className="pl-row">
        {start ? (
          <span className="pl-start" title={`${start.title} · plays ${chanceLabel(card.p)} (starts or comes on)`}>
            <SourceMark source={start.source} />
            <b>{start.percent}%</b> starts
            {card.ffKind ? <KindIcon kind={card.ffKind} size={14} /> : null}
          </span>
        ) : (
          <span>
            plays <b>{chanceLabel(card.p)}</b>
          </span>
        )}
        <span>
          ×<b>{(card.mult + (card.captain ? lineup.captainBonus : 0)).toFixed(2)}</b>
        </span>
      </div>
      <div className="pl-row">
        <span className={`pl-tag${card.inSeason ? "" : " classic"}`}>
          <SeasonIcon inSeason={card.inSeason} size={9} />
          {card.inSeason ? "IN-SEASON" : "CLASSIC"}
        </span>
        <span>
          {after ? (
            swap && sub ? `↺ ${sub.name}` : ""
          ) : (
            <span title={card.by ? `${score.words}: ${SCORE_SOURCE_NAME[card.by]}${card.sorare !== undefined && card.by !== "sorare" ? ` · Sorare says ${Math.round(card.sorare)}` : ""}` : score.words}>
              {score.words}
              {card.by ? (
                <>
                  {" · "}
                  <b>{card.by === "sofix" ? "SF" : card.by === "sorare" ? "SO" : "L5"}</b>
                </>
              ) : null}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
