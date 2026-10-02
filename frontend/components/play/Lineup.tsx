import Link from "next/link";
import { matchHref, matchOfCard } from "../../lib/links";
import type { Lineup as LineupData, PlayCard, PlayingPlayer } from "../../lib/play";
import { cashLabel, chanceLabel, essenceLabel, formatOf, paysNote, startChance } from "../../lib/play";
import { KindIcon } from "../lineups/Icons";
import Silhouette from "../Silhouette";
import SourceMark from "../SourceMark";
import { Cash, Chevron, Essence, Foil, GROUP_CLASS, MiniCards, RangeBar, RewardChips, Ring, ribbonClass } from "./bits";
import LineupSheet from "./LineupSheet";
import SorareImage from "./SorareImage";

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
}: {
  lineup: LineupData;
  after: boolean;
  index: number;
  /** A lineup built knowing the scores: what it expected is what it scored, so it does not say what it expected. */
  hindsight?: boolean;
  /** The week's playing players, whose games name the Lineups match each card opens. */
  players?: PlayingPlayer[];
}) {
  const group = GROUP_CLASS[lineup.group];
  const chance = lineup.pReturn;
  const tone = chance >= 0.5 ? "" : chance >= 0.2 ? "mid" : "low";
  const won = after && lineup.actual ? lineup.actual.essence > 0 || lineup.actual.cash > 0 || lineup.actual.card : false;

  const face = (
    <>
      <span className={`pl-edge${lineup.rarity === "rare" ? " rare" : ""}`} aria-hidden="true" />
      <span className="pl-lu-top">
        <span className="nm">{lineup.comp}</span>
        <span className={`pl-group ${group}`}>{lineup.group}</span>
        <span className="pl-fmt">{formatOf(lineup)}</span>
        <Chevron className="hm-chev" />
      </span>
      <span className="pl-lu-main">
        {after && lineup.actual ? (
          <>
            <span className="pl-kv">
              <b>{lineup.actual.total}</b>
              <span>{hindsight ? "scored" : `scored · xScore ${lineup.x}`}</span>
            </span>
            <span className={`pl-kv${won ? " good" : ""}`}>
              <b>{lineup.actual.cash ? cashLabel(lineup.actual.cash) : essenceLabel(lineup.actual.essence)}</b>
              <span>{lineup.actual.cash ? "cash won" : "essence won"}</span>
            </span>
          </>
        ) : (
          <>
            <span className="pl-kv">
              <b>{lineup.x}</b>
              <span>xScore</span>
            </span>
            <span className="pl-kv">
              <b>{chanceLabel(chance)}</b>
              <span>reward chance</span>
            </span>
          </>
        )}
        {hindsight ? null : <RangeBar lineup={lineup} after={after} />}
      </span>
      {after ? null : (
        <span className={`pl-meter ${tone}`.trim()} role="img" aria-label={`${chanceLabel(chance)} chance of a reward`}>
          <i style={{ width: `${Math.round(chance * 100)}%` }} />
        </span>
      )}
      {lineup.expected ? <span className="pl-exp">Expected · Sorare has not opened it yet</span> : null}
      <MiniCards lineup={lineup} after={after} />
      <span className="pl-lu-foot">
        <RewardChips lineup={lineup} after={after} />
        <span className="pl-note">{paysNote(lineup)}</span>
      </span>
    </>
  );

  const head = (
    <>
      <Foil rarity={lineup.rarity} />
      <h2>{lineup.comp}</h2>
      <span className={`pl-group ${group}`}>{lineup.group}</span>
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
  const capBonus = lineup.size === 5 ? 260 : 370;
  const paid = lineup.tiers.filter((tier) => tier.cash || tier.essence || tier.card || tier.label);

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
                    <span className={`pl-tag${sub.inSeason ? "" : " classic"}`}>{sub.inSeason ? "IN-SEASON" : "CLASSIC"}</span>
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
        {lineup.group !== "Room" ? (
          <>
            <span className={mostFromOneClub <= 2 ? "" : "off"}>Max 2 per club{mostFromOneClub <= 2 ? " · +2%" : ""}</span>
            <span className={lineup.average <= capBonus ? "" : "off"}>
              Average total {lineup.average} {lineup.average <= capBonus ? `≤ ${capBonus} · +4%` : `> ${capBonus}`}
            </span>
          </>
        ) : null}
        <span>Captain +{Math.round(lineup.captainBonus * 100)}%</span>
        {after && lineup.actual?.bonusLost ? <span className="off">A sub came in: the lineup bonuses dropped</span> : null}
      </div>

      <details className="pl-ladder" open={lineup.group === "Room"}>
        <summary>
          Rewards <span>· the chance of each</span>
          <Chevron className="" />
        </summary>
        <table>
          <tbody>
            {paid.map((tier, i) => {
              const hit =
                after &&
                lineup.actual &&
                ((tier.cash && lineup.actual.cash === tier.cash) || (tier.essence && lineup.actual.essence === tier.essence));
              return (
                <tr key={`${index}-${i}`} className={hit ? "hit" : ""}>
                  <td>{tier.label ?? (tier.lo === tier.hi ? `#${tier.lo}` : `#${tier.lo?.toLocaleString("en-GB")}–${tier.hi?.toLocaleString("en-GB")}`)}</td>
                  <td>
                    {tier.cash ? (
                      <>
                        <Cash size={12} /> {cashLabel(tier.cash)}
                      </>
                    ) : tier.essence ? (
                      <>
                        <Essence size={12} /> {essenceLabel(tier.essence)}
                      </>
                    ) : (
                      "Card"
                    )}
                  </td>
                  <td>{chanceLabel(tier.p)}</td>
                </tr>
              );
            })}
            {lineup.fee ? (
              <tr>
                <td>Entry</td>
                <td>
                  <Essence size={12} /> −{lineup.fee}
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
  const value = after ? card.actual : Math.round(card.x);
  const out = after && card.actual === null;
  const swap = after ? (lineup.actual?.cameIn ?? []).find((entry) => entry.for === card.slug) : undefined;
  const sub = swap ? lineup.subs.find((entry) => entry.slug === swap.sub) : null;
  const start = after ? null : startChance(card);
  return (
    <div className={`pl-pc${out ? " out" : ""}`} style={{ ["--i" as string]: String(position) }}>
      <div className="art">
        <Silhouette className="pl-sil" />
        <SorareImage src={card.pic} alt={card.name} fill />
        {card.captain ? <span className="pl-cap">C</span> : null}
        <span className={`pl-rib ${ribbonClass(after ? card.actual : Math.round(card.x))}`}>
          {value === null ? "DNP" : Math.round(value)}
        </span>
      </div>
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
        <span className={`pl-tag${card.inSeason ? "" : " classic"}`}>{card.inSeason ? "IN-SEASON" : "CLASSIC"}</span>
        <span>
          {after ? (swap && sub ? `↺ ${sub.name}` : "") : <>if plays <b>{Math.round(card.mu)}</b></>}
        </span>
      </div>
    </div>
  );
}
