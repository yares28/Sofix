"use client";

import { bonusLabel, type ArcadeCard, type ArcadeGame } from "../../lib/arcade";
import type { Outlook } from "../../lib/arcadePlan";
import CardRatings from "./CardRatings";

const SOURCES = { sorare: "Sorare", futbolfantasy: "Futbol Fantasy", sofix: "Sofix" };
export const fixtureName = (game: ArcadeGame) => `${game.home?.name ?? "?"} v ${game.away?.name ?? "?"} · ${new Date(game.kickoff).toLocaleString("en-GB", { timeZone: "Europe/Madrid", weekday: "short", hour: "2-digit", minute: "2-digit" })} · ${game.competition.name}`;

/** Shared card art and evidence for the collection and the exact game picked in a lineup. */
export default function PlayerCard({ card, outlook, game, fixtures, crests, onSelect, unavailable = "No game before the set ends", captain = false, captainBonus = 0 }: {
  card: ArcadeCard; outlook?: Outlook; game?: ArcadeGame; fixtures: ArcadeGame[]; crests: Map<string, string>; onSelect?: (id: string) => void; unavailable?: string; captain?: boolean; captainBonus?: number;
}) {
  const bonus = bonusLabel(card.bonus);
  const detail = game ? fixtureName(game) : unavailable;
  const percent = outlook?.start == null ? "—" : `${Math.round(outlook.start * 100)}%`;
  const startProps = { className: "arc-card-start", "aria-label": `Start chance ${percent}`, title: `${detail} · ${outlook?.confirmed ? `Sorare announced eleven: ${outlook.start === 1 ? "in the eleven" : "not starting"}` : `${outlook?.startSource ? SOURCES[outlook.startSource] : "Unknown"} start chance`}${outlook?.start == null ? "; no start % yet" : ""}` };
  const badges = (g: ArcadeGame) => [g.home, g.away].map((team, i) => {
    const src = team?.crest ?? (team ? crests.get(team.slug) : null);
    // eslint-disable-next-line @next/next/no-img-element -- Sorare club crests
    return src ? <img key={i} src={src} alt={team?.name ?? ""} width={20} height={20} loading="lazy" /> : <span key={i} aria-hidden="true">{(team?.name ?? "?").slice(0, 2)}</span>;
  });
  return (
    <figure className="arc-card" aria-label={card.name}>
      <div className="arc-art" title={`${card.name}${card.edition ? ` · ${card.edition}` : ""}`}>
        {card.picture
          // eslint-disable-next-line @next/next/no-img-element -- Original Sorare card art
          ? <img src={card.picture} alt={card.name} loading="lazy" width={240} height={388} />
          : <div className="arc-card-blank" role="img" aria-label={card.name}>{card.name}</div>}
        <CardRatings outlook={outlook} game={game?.id} home={game?.home?.slug === card.teamSlug} detail={detail} captain={captain} captainBonus={captainBonus} />
        {bonus ? <span className="arc-card-bonus" title={`${card.edition ?? "Edition"} bonus; club bonus is included separately in xScore`}>{bonus}</span> : null}
      </div>
      <figcaption>
        {outlook?.startUrl ? <a {...startProps} href={outlook.startUrl} target="_blank" rel="noreferrer">{percent}</a> : <span {...startProps}>{percent}</span>}
        <div className="arc-card-evidence">
          <div className="arc-card-games" aria-label="Card fixtures">
            {fixtures.length ? fixtures.map((g) => onSelect
              ? <button key={g.id} type="button" aria-label={fixtureName(g)} title={fixtureName(g)} aria-pressed={g.id === game?.id} onClick={() => onSelect(g.id)}>{badges(g)}</button>
              : <span key={g.id} className="arc-card-fixture" role="img" aria-label={fixtureName(g)} title={fixtureName(g)}>{badges(g)}</span>)
              : <span className="arc-no-fixture" title={detail} aria-label={detail}>—</span>}
          </div>
          <span className="arc-card-xd" title={`${detail} · Expected decisive contribution, including starter and substitute chances; mission odds are separate`}>xD {outlook?.xd == null ? "—" : outlook.xd.toFixed(2)}</span>
        </div>
      </figcaption>
    </figure>
  );
}
