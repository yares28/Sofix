import type { CSSProperties } from "react";

import CardZoom from "../ui/CardZoom";
import { formatKickoff } from "../../lib/grid";
import { dateRange, type GameweekHead, type HeadCast, type HeadState } from "../../lib/home";
import SorareImage from "../play/SorareImage";

const score = (x: number) => x.toFixed(1);
const pct = (p: number) => `${Math.round(p * 100)}%`;

const POSITION_FANS = [
  { pos: "GK", label: "Goalkeepers" },
  { pos: "DEF", label: "Defenders" },
  { pos: "MID", label: "Midfielders" },
  { pos: "FWD", label: "Forwards" },
] as const;

type ScoreTone = "s0" | "s1" | "s3" | "s5" | "s7" | "s9";

function scoreTone(x: number): ScoreTone {
  if (x >= 70) return "s9";
  if (x >= 55) return "s7";
  if (x >= 40) return "s5";
  if (x >= 25) return "s3";
  if (x > 0) return "s1";
  return "s0";
}

function kickoffLine(state: Extract<HeadState, { kind: "upcoming" }>): string {
  const when = formatKickoff(state.kickoff);
  return state.confirmed ? when : `${when.split(",")[0]}, time TBC`;
}

function roundStatus(state: HeadState): string {
  if (state.kind === "upcoming") return `First kickoff · ${kickoffLine(state)}`;
  if (state.kind === "live") return `Live · ${state.played} of ${state.total} played`;
  return `${state.total} played · ${state.shocks} ${state.shocks === 1 ? "upset" : "upsets"}`;
}

type FanStyle = CSSProperties & Record<"--fan-angle" | "--fan-lift" | "--fan-delay", string>;

function fanStyle(index: number, count: number): FanStyle {
  const middle = (count - 1) / 2;
  const distance = Math.abs(index - middle);
  return {
    zIndex: count - index,
    "--fan-angle": `${(index - middle) * 7}deg`,
    "--fan-lift": `${distance * 8}px`,
    "--fan-delay": `${index * 55}ms`,
  };
}

/** A compact round cue followed by the owner's strongest cards, organised as one fan for each position. */
export default function HomeHead({ head, cast, sorare }: { head: GameweekHead; cast: HeadCast | "none" | null; sorare?: string | null }) {
  const { state } = head;
  const positionFans = cast && cast !== "none"
    ? POSITION_FANS.map((fan) => ({ ...fan, cards: cast.cards.filter((card) => card.pos === fan.pos) })).filter((fan) => fan.cards.length > 0)
    : [];

  return (
    <header className={`hm-top ${state.kind}`}>
      <div className="hm-roundbar">
        <div className="hm-id">
          <h1>
            <span className="hm-kicker">LaLiga round</span>
            <b>{head.number}</b>
          </h1>
          <p className="hm-when">
            {dateRange(head.from, head.to)}
            {sorare ? ` · ${sorare}` : ""}
          </p>
        </div>
        <p className="hm-round-status">{roundStatus(state)}</p>
      </div>

      {cast === "none" ? (
        <p className="hm-spot hm-spot-empty">None of your cards play this week.</p>
      ) : cast ? (
        <div className="hm-spot hm-position-fans">
          <p className="hm-kicker">
            Your best cards
            {cast.named ? <span>Sorare GW{cast.gw}</span> : null}
          </p>
          <div className="hm-position-grid">
            {positionFans.map((fan) => (
              <section className="hm-position-fan" key={fan.pos} aria-label={`${fan.label}, ${fan.cards.length} cards`}>
                <h2>{fan.pos}</h2>
                <ol className="hm-fan-stage">
                  {fan.cards.map((card, index) => (
                    <li key={card.name} style={fanStyle(index, fan.cards.length)} aria-label={`${card.name}, ${pct(card.p)} chance to play, ${score(card.x)} xScore`}>
                      <span className={`hm-score ${scoreTone(card.x)}`} aria-hidden="true">
                        {score(card.x)}
                      </span>
                      <CardZoom className={`hm-art ${card.rarity}`} aria-hidden="true">
                        <SorareImage src={card.pic} alt="" fill />
                      </CardZoom>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </div>
      ) : null}
    </header>
  );
}
