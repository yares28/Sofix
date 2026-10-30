"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { Arcade } from "../../lib/arcade";
import { madridDate, type Outlook } from "../../lib/arcadePlan";
import { clubsToBuildAround, type PlayerStatus, type Signal } from "../../lib/arcadeTeams";
import { FdrChip } from "./Fdr";
import TeamRail from "./TeamRail";
import { Crest, crestsOf, madridDay, madridTime, pct, pts } from "./ArcadePlanner";

const DAYS = 4;
const BADGE: Record<Signal, string> = { sofix: "", sorare: "Sorare: starter", doubt: "In doubt", out: "Out", unknown: "No word yet" };
const TIER: Record<string, string> = { GOAT: "Icon", STAR: "Star", STAR_PLUS: "Star+" };

/**
 * Teams to build around (owner, 29 Oct 2026): for the days ahead, where Sorare has not given start % yet, the clubs whose likely
 * starters among your cards add the most. A tap puts the game in Pick teams.
 */
export default function ArcadeTeams({ arcade, outlooks, status, chosen, onToggle, now }: {
  arcade: Arcade; outlooks: Map<string, Outlook[]>; status: Record<string, PlayerStatus>; chosen: Set<string>; onToggle: (game: string) => void; now: number;
}) {
  const crests = useMemo(() => crestsOf(arcade), [arcade]);
  const picks = useMemo(() => clubsToBuildAround(outlooks, arcade.games ?? [], status, now, now + DAYS * 86_400_000), [outlooks, arcade.games, status, now]);
  const days = [...new Set(picks.map((p) => p.day))].sort();
  const [day, setDay] = useState<string | null>(null);
  const shownDay = day && days.includes(day) ? day : days[0] ?? null;
  const list = picks.filter((p) => p.day === shownDay);
  if (!days.length) return null;
  const read = Object.keys(status).length > 0;
  return (
    <section className="arc-clubs" aria-labelledby="arc-clubs-title">
      <div className="arc-plan-head">
        <h2 id="arc-clubs-title">Teams to build around</h2>
        <div className="arc-modes" role="group" aria-label="Day">
          {days.map((d) => <button key={d} type="button" aria-pressed={d === shownDay} onClick={() => setDay(d)}>{madridDate(new Date(now).toISOString()) === d ? "Today" : madridDay(`${d}T12:00:00Z`)}</button>)}
        </div>
      </div>
      {!read ? <p className="arc-sub">Sorare&apos;s starter and injury word needs extension 0.4.18; until then only Sofix&apos;s start % counts.</p> : null}
      <TeamRail key={shownDay} label="Teams to build around" className="arc-club-rail">
        {list.map((p, i) => {
          const home = p.game.home?.slug === p.club;
          const other = home ? p.game.away : p.game.home;
          const on = chosen.has(p.game.id);
          return (
            <article key={`${p.game.id}-${p.club}`} className={`arc-club${on ? " is-on" : ""}`} style={{ "--i": i } as CSSProperties}>
              <div className="arc-club-head">
                <Crest team={home ? p.game.home : p.game.away} crests={crests} />
                <span className="arc-club-name"><b>{p.name}</b><small>{home ? "v" : "at"} {other?.name ?? "?"} · {madridTime(p.game.kickoff)}</small></span>
                <FdrChip game={p.game.id} home={home} />
              </div>
              <div className="arc-club-value"><b>{pts(p.value)}</b><small>{p.likely === 1 ? "1 likely starter" : `${Math.min(3, p.likely)} best likely starters`}{p.out ? ` · ${p.out} out` : ""}</small></div>
              <ol className="arc-club-cards">
                {p.cards.slice(0, 4).map(({ outlook: o, signal, points }) => {
                  const tier = TIER[status[o.card.player]?.tier ?? ""];
                  return (
                    <li key={o.card.slug} className={`is-${signal}`}>
                      {o.card.picture
                        // eslint-disable-next-line @next/next/no-img-element -- Sorare's card art
                        ? <img src={o.card.picture} alt={o.card.name} width={64} height={103} loading="lazy" />
                        : <span className="arc-card-blank">{o.card.name}</span>}
                      <span className="arc-club-pts">{pts(points)}</span>
                      <small>{signal === "sofix" && o.startUrl ? <a href={o.startUrl} target="_blank" rel="noreferrer">{pct(o.start!)} start</a> : signal === "sofix" ? `${pct(o.start!)} start` : BADGE[signal]}{tier ? ` · ${tier}` : ""}</small>
                    </li>
                  );
                })}
              </ol>
              <button type="button" className="arc-small" aria-pressed={on} onClick={() => onToggle(p.game.id)}>{on ? "In Pick teams" : "Add to Pick teams"}</button>
            </article>
          );
        })}
      </TeamRail>
    </section>
  );
}
