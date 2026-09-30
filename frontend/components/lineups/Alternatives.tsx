import { chanceTone, type LineupPlayer } from "../../lib/lineups";
import { KindIcon } from "./Icons";
import { describe, percent } from "./PlayerCard";

/** Who else could play: name and chance, most likely first. The owner's own players carry his outline. */
export default function Alternatives({ players, mine }: { players: LineupPlayer[]; mine: Set<string> }) {
  if (players.length === 0) return null;
  return (
    <ul className="lu-alts" aria-label="Alternatives, most likely first">
      {players.map((player) => (
        <li key={player.id} className="lu-alt" data-mine={player.yours && mine.has(player.yours) ? "" : undefined} aria-label={describe(player, Boolean(player.yours))}>
          {player.name}
          {player.status?.kind ? <KindIcon kind={player.status.kind} size={15} /> : null}
          <span className="lu-pct lu-pct-sm" data-tone={chanceTone(player.p)}>
            {percent(player.p)}%
          </span>
        </li>
      ))}
    </ul>
  );
}
