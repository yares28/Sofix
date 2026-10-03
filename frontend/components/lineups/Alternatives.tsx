import Link from "next/link";
import { useContext } from "react";
import { type LineupPlayer } from "../../lib/lineups";
import { chanceFor } from "../../lib/lineupChances";
import Chance, { ChanceContext } from "./Chance";
import { cardHref } from "../../lib/links";
import { KindIcon } from "./Icons";
import { describe } from "./PlayerCard";

/** Who else could play: name and chance, most likely first. The owner's own players carry his outline. */
export default function Alternatives({ players, mine, labels }: { players: LineupPlayer[]; mine: Set<string>; labels: Record<string, string> }) {
  const view = useContext(ChanceContext);
  if (players.length === 0) return null;
  return (
    <ul className="lu-alts" aria-label="Alternatives, most likely first">
      {players.map((player) => (
        <li key={player.id} className="lu-alt" data-mine={player.yours && mine.has(player.yours) ? "" : undefined} aria-label={describe(player, Boolean(player.yours), false, chanceFor(player, view))} title={player.name}>
          {player.yours && mine.has(player.yours) ? (
            <Link className="lu-alt-go" href={cardHref(player.yours)} title={`${player.name}: open your card`}>
              {labels[player.id] ?? player.name}
            </Link>
          ) : (
            (labels[player.id] ?? player.name)
          )}
          {player.status?.kind ? <KindIcon kind={player.status.kind} size={15} /> : null}
          <Chance player={player} small />
        </li>
      ))}
    </ul>
  );
}
