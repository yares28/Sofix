"use client";

import { useMemo, useState } from "react";
import { scoreColour } from "../../lib/cards";
import type { MarketPlayer, PlayingPlayer } from "../../lib/play";
import type { Identity, NextGame } from "../../lib/playerPage";
import { gameFactors, shapeBars, sheetGroups, sheetTotal, type Sheet, type Strip, type Window } from "../../lib/playerSheet";
import CardArt from "../cards/CardArt";
import SorareImage from "../play/SorareImage";

const POSITION_NAME = { GK: "goalkeepers", DEF: "defenders", MID: "midfielders", FWD: "forwards" } as const;

const when = (iso: string): string =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Madrid" })
    .format(new Date(iso))
    .replace(",", " ·");
const day = (iso: string): string =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Madrid" }).format(new Date(iso)).replace(",", "");
const signed = (n: number): string => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}`;
const asOfLabel = (iso: string): string => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

export default function PlayerView({
  slug,
  identity,
  planned,
  sheet,
  asOf,
  strips,
  next,
  league = null,
}: {
  slug: string;
  identity: Identity;
  planned: PlayingPlayer | null;
  /** His row of the LaLiga index: every player's start chance and xScore this week, for one who is not in your plans. */
  league?: MarketPlayer | null;
  sheet: Sheet | null;
  asOf: string;
  strips: Strip[];
  next: NextGame[];
}) {
  const game = planned?.games[0] ?? null;
  const theirs = !planned && league?.fixture?.opponent && league.fixture.kickoff ? league : null;
  const shown = game ?? (theirs?.fixture as { opponent: string; opponentCrest: string | null; venue: "H" | "A"; kickoff: string } | undefined) ?? null;
  const pStart = planned ? planned.pStart : theirs?.pStart;
  const factors = useMemo(() => gameFactors(game?.odds), [game]);
  const [window, setWindow] = useState<Window>(factors ? "next" : "l10");
  const groups = useMemo(() => (sheet ? sheetGroups(sheet, window, factors) : []), [sheet, window, factors]);
  const total = sheet ? sheetTotal(sheet, window, factors) : 0;
  const shape = planned?.shape ?? null;
  const score = planned
    ? Math.round(typeof planned.start === "number" ? planned.start : planned.x)
    : theirs && typeof (theirs.start ?? theirs.mu) === "number"
      ? Math.round((theirs.start ?? theirs.mu) as number)
      : null;
  const last10 = sheet ? Math.round(sheet.last.reduce((a, r) => a + r[0], 0) / Math.max(1, sheet.last.length)) : null;
  const bars = useMemo(() => (shape && score !== null ? shapeBars(shape, score) : []), [shape, score]);
  const pickers: [Window, string][] = [...(factors ? ([["next", "Next game"]] as [Window, string][]) : []), ["l10", "Last 10"], ["all", "Two seasons"]];

  return (
    <div className="pd-wrap" data-testid="player-page" data-slug={slug}>
      <section className="pd-card pd-hero">
        <span className="pd-pic" aria-hidden={!identity.pic}>
          <CardArt src={identity.pic} name={identity.name} />
        </span>
        <div className="pd-head">
          <h1>{identity.name}</h1>
          {shown ? (
            <p className="pd-game">
              <SorareImage src={shown.opponentCrest} alt="" width={22} height={22} />
              <span>
                {shown.venue === "H" ? "v" : "at"} {shown.opponent} · {when(shown.kickoff)}
              </span>
            </p>
          ) : (
            <p className="pd-game">
              {[identity.pos, identity.club].filter(Boolean).join(" · ")}
              {planned === null ? " · no game this gameweek" : ""}
            </p>
          )}
          <div className="pd-big">
            {score !== null ? (
              <>
                <div>
                  <span className="pd-x sc-chip" style={{ background: scoreColour(score).fill, color: scoreColour(score).ink }}>{score}</span>
                  <small>xScore if he starts</small>
                </div>
                {typeof pStart === "number" ? (
                  <div>
                    <span className="pd-s">{Math.round(pStart * 100)}%</span>
                    <small>chance he starts</small>
                  </div>
                ) : null}
              </>
            ) : last10 !== null ? (
              <div>
                <span className="pd-x pd-x--grey">{last10}</span>
                <small>average, last 10 starts</small>
              </div>
            ) : null}
          </div>
        </div>
        {shape && bars.length ? (
          <div className="pd-dist" role="img" aria-label={`Lands between ${shape.low} and ${shape.high}, 8 times in 10`}>
            <div className="pd-bars">
              {bars.map((b, i) => (
                <i key={i} className={b.kind === "out" ? undefined : `pd-bar--${b.kind}`} style={{ height: `${b.h}%` }} />
              ))}
            </div>
            <div className="pd-marks">
              <span className="dec" style={{ left: `${Math.min(88, Math.max(12, shape.dec))}%` }}>
                {Math.round(shape.dec)} · {Math.round(shape.p * 100)}%
              </span>
              <span style={{ left: `${Math.min(88, Math.max(12, shape.plain))}%` }}>
                {Math.round(shape.plain)} · {Math.round((1 - shape.p) * 100)}%
              </span>
            </div>
            <div className="pd-range">
              <span>0</span>
              <span>
                Lands between {shape.low} and {shape.high}, 8 times in 10
              </span>
              <span>100</span>
            </div>
          </div>
        ) : null}
      </section>

      {sheet ? (
        <div className="pd-cols">
          <section className="pd-card pd-sheet">
            <h2>
              Stat sheet
              <span className="pd-pick" role="group" aria-label="Which games">
                {pickers.map(([key, label]) => (
                  <button key={key} type="button" aria-pressed={window === key} onClick={() => setWindow(key)}>
                    {label}
                  </button>
                ))}
              </span>
            </h2>
            <div className="pd-table">
              {groups.map((group) => (
                <div key={group.name}>
                  <p className="pd-gr">{group.name}</p>
                  {group.rows.map((row) => (
                    <div className="pd-row" key={row.name}>
                      <span>{row.name}</span>
                      <span className="n">{row.count}</span>
                      <span className={`p ${row.points === null ? "" : row.points >= 0 ? "up" : "dn"}`}>{row.points === null ? "" : signed(row.points)}</span>
                    </div>
                  ))}
                </div>
              ))}
              <div className="pd-row pd-tot">
                <span>All-around points</span>
                <span className="n" />
                <span className="p up">{signed(total)}</span>
              </div>
            </div>
            <p className="pd-foot">Per start, to {asOfLabel(asOf)}.</p>
          </section>

          <div className="pd-side">
            {strips.length ? (
              <section className="pd-card">
                <h2>Compared with other {POSITION_NAME[sheet.pos]}</h2>
                <div className="pd-cp">
                  {strips.map((strip) => {
                    const span = Math.max(1e-9, strip.hi - strip.lo);
                    const at = (v: number) => `${Math.min(100, Math.max(0, ((v - strip.lo) / span) * 100))}%`;
                    return (
                      <div key={strip.name}>
                        <div className="pd-cp-top">
                          <span className="mn">{strip.name}</span>
                          <span className="mr">{strip.rank}</span>
                        </div>
                        <div className="pd-rail">
                          {strip.values.map((v, i) => (
                            <i key={i} className="d" style={{ left: at(v) }} />
                          ))}
                          <i className="m" style={{ left: at(strip.median) }} />
                          <i className="me" style={{ left: at(strip.me) }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="pd-key">
                  <span><b className="me" />{identity.name.split(" ").slice(-1)[0]}</span>
                  <span><i className="d" />each one</span>
                  <span><u />the middle one</span>
                </p>
              </section>
            ) : null}

            <section className="pd-card">
              <h2>His last {sheet.last.length} starts</h2>
              <div className="pd-l10">
                {sheet.last.map(([s, opp, dec, venue], i) => (
                  <div key={i}>
                    <span className="ls">{s}</span>
                    <i className={dec ? "dec" : undefined} style={{ height: `${Math.max(8, s)}%` }} />
                    <span className="lo" title={venue === "H" ? "at home" : "away"}>{opp}</span>
                  </div>
                ))}
              </div>
              {sheet.pos === "GK" ? (
                <div className="pd-dc">
                  <div>
                    <b>
                      {sheet.cs} of {sheet.seasonStarts}
                    </b>
                    <small>clean sheets</small>
                  </div>
                  <div>
                    <b>{sheet.pens}</b>
                    <small>penalties saved</small>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      ) : null}

      {next.length ? (
        <section className="pd-card">
          <h2>
            Next games <span className="sub">xScore and where he lands 8 times in 10</span>
          </h2>
          <div className="pd-nx">
            {next.map((g) => (
              <div className="c" key={g.kickoff}>
                <span className="v">{g.score}</span>
                <div className="pl" role="img" aria-label={g.low !== null && g.high !== null ? `${g.score}, lands between ${g.low} and ${g.high}` : `${g.score}`}>
                  <div className="b" style={{ height: `${g.score * 1.5}px`, background: scoreColour(g.score).fill }} />
                  {g.low !== null && g.high !== null ? <div className="w" style={{ bottom: `${g.low * 1.5}px`, height: `${(g.high - g.low) * 1.5}px` }} /> : null}
                </div>
                <SorareImage src={g.crest} alt="" width={30} height={30} />
                <span className="o">
                  {g.venue === "H" ? "v" : "at"} {g.opponent}
                </span>
                <span className="wh">{day(g.kickoff)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!sheet ? <p className="pd-none">{identity.name} has no starts in the games Sofix has read yet (to {asOfLabel(asOf)}), so there is no stat sheet.</p> : null}
    </div>
  );
}
