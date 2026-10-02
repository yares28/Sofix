import Link from "next/link";
import CardArt from "../cards/CardArt";
import Silhouette from "../Silhouette";
import FacePhoto from "./FacePhoto";
import { chanceTone, type Line, type LineupPlayer, type OwnedCard } from "../../lib/lineups";
import { cardHref } from "../../lib/links";
import { CalledUpIcon, CalledUpMark, KindIcon, KIND_LABEL } from "./Icons";

/** The rarity as the card's own words say it: shown to a screen reader and on hover, the card's colour carries it on the pitch. */
const RARITY_TEXT: Record<string, string> = { limited: "limited", rare: "rare", super_rare: "super rare", unique: "unique" };

export const percent = (p: number | null) => (p === null ? "–" : `${Math.round(p * 100)}`);

/** The spoken version of a player's place on the page, for screen readers and the tooltip. */
export function describe(player: LineupPlayer, owned: boolean, calledUp = false): string {
  const bits = [player.name, player.p === null ? "no chance given" : `${percent(player.p)}% to start`];
  if (player.status?.kind) bits.push(KIND_LABEL[player.status.kind].toLowerCase());
  if (calledUp && player.status?.international) bits.push("called up by his national team");
  if (owned) bits.push("your card");
  return bits.join(", ");
}

/**
 * A player of the eleven drawn as a Sorare card: the owner's own art (and outline) for a card he has, a drawn face for the rest.
 * The badge under it is his chance of starting; the round mark at its corner is an injury, a doubt or a ban.
 */
export default function PlayerCard({
  player,
  label,
  line,
  card,
  calledUp,
  art,
  next = [],
  labels = {},
  mine = new Set<string>(),
}: {
  player: LineupPlayer;
  label: string;
  line: Line;
  card: OwnedCard | undefined;
  /** Whether his club has named its squad: a call-up is not shown before that. */
  calledUp: boolean;
  /** A real Sorare card of him when he is not one of yours, from the job: every player is drawn as his card wherever Sorare has one. */
  art?: string;
  /** Who can come in for him in his slot, in the page's order: their names go under his card (Futbol Fantasy draws it so). */
  next?: LineupPlayer[];
  labels?: Record<string, string>;
  mine?: Set<string>;
}) {
  const pic = card?.pic ?? art;
  const rarity = card?.rarity ?? (art ? "limited" : "common");
  const kind = player.status?.kind;
  const mark = kind ? <KindIcon kind={kind} ring /> : calledUp && player.status?.international ? player.status.nat ? <CalledUpMark code={player.status.nat} /> : <CalledUpIcon ring /> : null;
  return (
    <li className="lu-card" data-rarity={rarity} data-mine={card ? "" : undefined} data-out={kind === "out" || kind === "suspended" ? "" : undefined} aria-label={describe(player, Boolean(card), calledUp)} title={card ? `${player.name} · your ${RARITY_TEXT[rarity] ?? ""} card`.replace("  ", " ") : player.name}>
      <div className="lu-face">
        {pic ? (
          <CardArt
            src={pic}
            name={card?.name ?? player.name}
            skeleton={
              <div className="lu-skel" aria-hidden="true">
                <Silhouette />
                <div className="lu-skel-name">
                  <b>{label}</b>
                  <span>
                    {line}
                    {player.age ? ` · ${player.age}` : ""}
                  </span>
                </div>
              </div>
            }
          />
        ) : (
          <>
            <Silhouette className="lu-sil" />
            <FacePhoto ffId={player.id} />
            <div className="lu-foot" />
            <div className="lu-name">
              <b>{label}</b>
              <span>
                {line}
                {player.age ? ` · ${player.age}` : ""}
              </span>
            </div>
          </>
        )}
      </div>
      <span className="lu-pct" data-tone={chanceTone(player.p)}>
        {percent(player.p)}%
      </span>
      {mark ? <span className="lu-mark">{mark}</span> : null}
      {next.length ? (
        <ul className="lu-next" aria-label={`Could come in for ${player.name}`}>
          {next.map((one) => {
            const own = Boolean(one.yours && mine.has(one.yours));
            const name = labels[one.id] ?? one.name;
            return (
              <li key={one.id} className="lu-nx" data-mine={own ? "" : undefined} title={`${one.name}${one.p === null ? "" : ` · ${percent(one.p)}% to start`}`}>
                {own ? (
                  <Link className="lu-nx-go" href={cardHref(one.yours!)}>
                    {name}
                  </Link>
                ) : (
                  <span>{name}</span>
                )}
                <i data-tone={chanceTone(one.p)}>{percent(one.p)}%</i>
              </li>
            );
          })}
        </ul>
      ) : null}
      {card && player.yours ? <Link className="lu-go" href={cardHref(player.yours)} aria-label={`${player.name}: open your card`} title={`${player.name}: open your card`} /> : null}
    </li>
  );
}
