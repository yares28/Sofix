import { absenceText } from "../../lib/absence";
import {
  gaugeText,
  playerLabels,
  squadOut,
  statusLine,
  type Absent,
  type Line,
  type LineupPlayer,
  type LineupSide,
  type OwnedCard,
} from "../../lib/lineups";
import Alternatives from "./Alternatives";
import { KindIcon, RotationIcon, TargetIcon } from "./Icons";
import PlayerCard from "./PlayerCard";
import Shield from "./Shield";
import type { ClubLook } from "./LineupsView";

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The alternatives of a line go under the lowest row of that line on the pitch (the one nearest his own goal). */
function placement(side: LineupSide): { byRow: Map<number, LineupPlayer[]>; others: LineupPlayer[]; zero: LineupPlayer[] } {
  const lastRow = new Map<Line, number>();
  side.rows.forEach((row, index) => lastRow.set(row.line, index));
  const byRow = new Map<number, LineupPlayer[]>();
  const others: LineupPlayer[] = [];
  const zero: LineupPlayer[] = [];
  for (const player of side.alternatives) {
    if ((player.p ?? 0) === 0 && !player.yours && !player.status?.kind) {
      zero.push(player);
      continue;
    }
    const row = player.pos ? lastRow.get(player.pos) : undefined;
    if (row === undefined) others.push(player);
    else byRow.set(row, [...(byRow.get(row) ?? []), player]);
  }
  return { byRow, others, zero };
}

export default function TeamColumn({
  side,
  place,
  round,
  cards,
  look,
  now,
}: {
  side: LineupSide;
  place: "home" | "away";
  round: number | null;
  cards: Record<string, OwnedCard>;
  look: ClubLook | undefined;
  now: Date;
}) {
  const labels = playerLabels(side.rows.flatMap((row) => row.players));
  const mine = new Set(Object.keys(cards));
  const { byRow, others, zero } = placement(side);
  const rotation = gaugeText(side.rotations, "rotations");
  const predict = statusLine(side.predictability, side.season);
  return (
    <section className={`lu-team ${place}`} aria-label={`${side.name} lineup`}>
      <div className="lu-team-head">
        <div className="lu-team-name">
          <Shield crest={look?.crest ?? side.crest} color={look?.color} code={side.club ?? side.name.slice(0, 3)} width={28} />
          <h2>{side.name}</h2>
          {side.published ? <span className="lu-formation">{side.formation}</span> : null}
        </div>
        {side.coach ? <span className="lu-coach">{side.coach}</span> : null}
      </div>
      {side.published && (rotation || predict) ? (
        <div className="lu-gauges">
          {rotation ? (
            <span>
              <RotationIcon />
              {rotation}
            </span>
          ) : null}
          {predict ? (
            <span>
              <TargetIcon />
              {predict}
            </span>
          ) : null}
        </div>
      ) : null}

      {side.published ? (
        <div className="lu-pitch">
          {side.rows.map((row, index) => (
            <div key={index} className="lu-row">
              <ul className="lu-cards" aria-label={`${row.line} row`}>
                {row.players.map((player) => (
                  <PlayerCard key={player.id} player={player} label={labels[player.id] ?? player.name} line={row.line} card={player.yours ? cards[player.yours] : undefined} calledUp={squadOut(side)} />
                ))}
              </ul>
              <Alternatives players={byRow.get(index) ?? []} mine={mine} />
            </div>
          ))}
          {others.length ? (
            <div className="lu-row lu-others">
              <span className="lu-others-title">Others in the squad</span>
              <Alternatives players={others} mine={mine} />
            </div>
          ) : null}
        </div>
      ) : (
        <div className="lu-unpublished" role="status">
          <b>{side.name} not out yet</b>
          <span>Futbol Fantasy publishes a lineup about a day after a team plays. SO, then SF, until then.</span>
        </div>
      )}

      {side.published && side.squad === false ? (
        <p className="lu-note">
          <b>Squad list not out.</b> Until it is, nobody is assumed out.
        </p>
      ) : null}

      {side.absent.length ? (
        <ul className="lu-news" aria-label={`${side.name} injuries and suspensions`}>
          {side.absent.map((entry, index) => (
            <News key={`${entry.name}-${index}`} entry={entry} round={round} now={now} mine={Boolean(entry.yours && cards[entry.yours])} />
          ))}
        </ul>
      ) : null}
      {zero.length ? (
        <p className="lu-zero">
          Also in the squad, at 0%: {zero.map((player) => player.name).join(", ")}
        </p>
      ) : null}
      {side.unlinked.length ? (
        <ul className="lu-unlinked" aria-label="Your players Futbol Fantasy does not list">
          {side.unlinked.map((entry) => (
            <li key={entry.slug}>
              <span className="lu-chip-mine">{entry.name}</span>
              <span>Not matched: {entry.why}. SO, then SF, is used for him.</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

const OWN_WORDS = "Futbol Fantasy's own words";

function News({ entry, round, now, mine }: { entry: Absent; round: number | null; now: Date; mine: boolean }) {
  const text = absenceText(entry, round, now);
  return (
    <li className="lu-new">
      <KindIcon kind={entry.kind} />
      <div>
        <b data-mine={mine ? "" : undefined}>{entry.name}</b>
        {text.cause || text.since ? (
          <span>
            {text.cause ? text.causeFf ? <i lang="es" title={OWN_WORDS}>{cap(text.cause)}</i> : cap(text.cause) : null}
            {text.cause && text.since ? " · " : null}
            {text.since ? (text.cause ? text.since : cap(text.since)) : null}
          </span>
        ) : null}
      </div>
      {text.note ? (
        <em data-kind={entry.kind} lang={text.noteFf ? "es" : undefined} title={text.noteFf ? OWN_WORDS : undefined}>
          {text.note}
        </em>
      ) : null}
    </li>
  );
}
