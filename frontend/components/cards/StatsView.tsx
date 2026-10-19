"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { leaders, statGroups, statValue, type StatPlayer } from "../../lib/statLeaders";
import SorareImage from "../play/SorareImage";
import CardArt from "./CardArt";

const STARTS = [3, 10, 20];
const PODIUM = 5;

function ClubMark({ player }: { player: StatPlayer }) {
  return player.crest ? <SorareImage className="st-crest" src={player.crest} width={16} height={16} /> : <span className="st-crest st-shield" aria-hidden="true" />;
}

/** Stat leaders: pick an action, see who does the most of it per start; the first five on a podium, the next 45 under it. */
export default function StatsView({ players, initial }: { players: StatPlayer[]; initial: { stat?: string; min?: string } }) {
  const groups = useMemo(() => statGroups(players), [players]);
  const first = groups.find((g) => g.stats.some((s) => s.key === initial.stat)) ?? groups[0]!;
  const [group, setGroup] = useState(first.name);
  const [stat, setStat] = useState(first.stats.some((s) => s.key === initial.stat) ? initial.stat! : first.stats[0]!.key);
  const [min, setMin] = useState(STARTS.includes(Number(initial.min)) ? Number(initial.min) : 10);
  // the choice is kept in the address, so a stat can be bookmarked or sent
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("stat", stat);
    url.searchParams.set("min", String(min));
    window.history.replaceState(window.history.state, "", url);
  }, [stat, min]);
  const shown = groups.find((g) => g.name === group) ?? groups[0]!;
  const label = groups.flatMap((g) => g.stats).find((s) => s.key === stat)?.label ?? stat;
  const ranked = useMemo(() => leaders(players, stat, min), [players, stat, min]);
  const top = ranked[0]?.value || 1;

  const pickGroup = (name: string) => {
    setGroup(name);
    setStat(groups.find((g) => g.name === name)!.stats[0]!.key);
  };

  return (
    <>
      <section className="st-hero">
        <div>
          <p className="st-eyebrow">Stat leaders</p>
          <h1 aria-live="polite">
            {label} <span>per start</span>
          </h1>
        </div>
        <div className="st-starts">
          <span id="st-starts">Starts</span>
          <div className="s5-seg" role="group" aria-labelledby="st-starts">
            {STARTS.map((n) => (
              <button key={n} type="button" aria-pressed={min === n} onClick={() => setMin(n)}>
                {n}+
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="st-pick">
        <div className="st-groups" role="group" aria-label="Stat group">
          {groups.map((g) => (
            <button key={g.name} type="button" aria-pressed={g.name === shown.name} onClick={() => pickGroup(g.name)}>
              {g.name}
            </button>
          ))}
        </div>
        <div className="st-chips" role="group" aria-label="Stat">
          {shown.stats.map((s) => (
            <button key={s.key} type="button" aria-pressed={s.key === stat} onClick={() => setStat(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {ranked.length === 0 ? (
        <p className="s5-empty" role="status">No player with {min}+ starts has a number for {label.toLowerCase()} yet.</p>
      ) : (
        <>
          <ol className="st-podium" key={`${stat}-${min}`} aria-label={`Top ${Math.min(PODIUM, ranked.length)} in ${label.toLowerCase()}`}>
            {ranked.slice(0, PODIUM).map((player, i) => (
              <li key={player.slug} data-rank={i + 1}>
                <Link className="art" href={`/players/${player.slug}`} prefetch={false} aria-label={`${player.name}: open his page`}>
                  <CardArt src={player.pic} name={player.name} />
                </Link>
                <span className="st-name">
                  <ClubMark player={player} />
                  <Link href={`/players/${player.slug}`} prefetch={false}>
                    {player.name}
                  </Link>
                </span>
                <b className="st-value">{statValue(player.value)}</b>
                <span className="st-plinth">
                  <em>{i + 1}</em>
                  <small>{player.starts} starts</small>
                </span>
              </li>
            ))}
          </ol>

          {ranked.length > PODIUM ? (
            <>
              <h2 className="st-next">
                The next {ranked.length - PODIUM} <span>ranks 6 to {ranked.length}</span>
              </h2>
              <ol className="st-list" start={PODIUM + 1} key={`list-${stat}-${min}`}>
                {ranked.slice(PODIUM).map((player, i) => (
                  <li key={player.slug} style={{ animationDelay: `${Math.min(i * 15, 400)}ms` }}>
                    <span className="st-rank">{i + PODIUM + 1}</span>
                    <Link className="art" href={`/players/${player.slug}`} prefetch={false} aria-label={`${player.name}: open his page`}>
                      <CardArt src={player.pic} name={player.name} />
                    </Link>
                    <span className="st-who">
                      <span className="st-name">
                        <ClubMark player={player} />
                        <Link href={`/players/${player.slug}`} prefetch={false}>
                          {player.name}
                        </Link>
                      </span>
                      <span className="st-bar" aria-hidden="true">
                        <i style={{ width: `${Math.round((100 * player.value) / top)}%` }} />
                      </span>
                      <small>{player.starts} starts</small>
                    </span>
                    <b className="st-value">{statValue(player.value)}</b>
                  </li>
                ))}
              </ol>
            </>
          ) : null}
        </>
      )}
    </>
  );
}
