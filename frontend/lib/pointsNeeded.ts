/**
 * Points needed (plans/points-needed.md): the raw Sorare score each card of a complete Arcade or Pro lineup needs for the lineup to
 * reach its step's target. Every card still able to score aims at the same bonus-adjusted end score, counting what it has already;
 * divided by the card's multiplier it is his raw score to end on. A card already past it keeps what it has, a card that cannot reach
 * it under the 100-point ceiling takes its 100, and the others share the rest. A playing card shows how far he is from his.
 * One balanced way to the target, not five minimums. Arcade and Pro have no substitutes, so a DNP is a finished 0 and no captain moves.
 */

export const MAX_RAW = 100;
const EPS = 1e-9;

export type NeedCard = {
  /** Sorare's whole scoring multiplier for this card here, bonuses added once (1.6 for a +10% captain at +50%); null when unknown. */
  multiplier: number | null;
  /** Why the multiplier is unknown, said on the card. */
  unknown?: string;
  /** "finished" covers a confirmed DNP (raw 0). */
  state: "to play" | "live" | "finished";
  /** His raw score so far (live or finished); null when unknown. Not read for a card still to play. */
  raw: number | null;
};

export type NeedCardResult =
  /** `raw`: the raw score this card should end on (a card already past it: the one it aimed at); `share`: what it brings, bonus-adjusted.
   * A live card also says what it has (`now`, raw). */
  | { kind: "need"; raw: number; share: number; live: boolean; multiplier: number; now?: number }
  | { kind: "settled"; contribution: number }
  | { kind: "reached"; contribution: number | null }
  | { kind: "unreachable" }
  | { kind: "unknown"; reason: string };

export type NeedResult = {
  state: "open" | "reached" | "unreachable" | "unknown" | "incomplete";
  current: number | null;
  remaining: number | null;
  /** Bonus-adjusted points every card still able to score could add at 100 raw; null when a multiplier is unknown. */
  room: number | null;
  cards: NeedCardResult[];
};

/** Pro: the card's own bonuses (in-season, level, rarity: `Competition.multiplier`) + the board's captain bonus. Prize boosts never. */
export function proMultiplier(o: { mult: number; captain: boolean; captainBonus: number | null | undefined }): number | null {
  if (!Number.isFinite(o.mult)) return null;
  if (!o.captain) return o.mult;
  return typeof o.captainBonus === "number" && Number.isFinite(o.captainBonus) ? o.mult + o.captainBonus : null;
}

export function pointsNeeded(target: number | null | undefined, cards: NeedCard[], size = 5): NeedResult {
  const none = (reason: string, state: NeedResult["state"] = "unknown"): NeedResult =>
    ({ state, current: null, remaining: null, room: null, cards: cards.map(() => ({ kind: "unknown", reason })) });
  if (typeof target !== "number" || !Number.isFinite(target) || target <= 0) return none("no target for this step");
  if (cards.length < size) return none(`the lineup has ${cards.length} of ${size} cards`, "incomplete");

  const blind = cards.find((c) => c.state !== "to play" && (c.raw === null || c.multiplier === null));
  if (blind) return none(blind.raw === null ? "a started card's score is unknown" : blind.unknown ?? "a started card's bonus is unknown");
  const raw = (c: NeedCard) => (c.state === "to play" ? 0 : c.raw!);
  const contribution = (c: NeedCard) => (c.state === "to play" ? 0 : c.raw! * c.multiplier!);
  const current = cards.reduce((sum, c) => sum + contribution(c), 0);
  const remaining = Math.max(0, target - current);

  if (remaining <= EPS) return { state: "reached", current, remaining: 0, room: 0, cards: cards.map((c) => ({ kind: "reached", contribution: c.state === "to play" ? null : contribution(c) })) };

  // The cards still able to add points, with their room under the ceiling (bonus-adjusted); an unknown multiplier has no known room.
  const open = cards.map((c, i) => ({ c, i, room: c.multiplier === null ? Infinity : Math.max(0, MAX_RAW - raw(c)) * c.multiplier }))
    .filter(({ c, room }) => c.state !== "finished" && room > EPS);
  const room = open.some((o) => !Number.isFinite(o.room)) ? null : open.reduce((sum, o) => sum + o.room, 0);
  const out: NeedCardResult[] = cards.map((c) => ({ kind: "settled", contribution: contribution(c) }));
  if (room !== null && room < remaining - EPS) {
    for (const o of open) out[o.i] = { kind: "unreachable" };
    return { state: "unreachable", current, remaining, room, cards: out };
  }

  // One level for every card still able to score, counting what it has already (the owner, 3 Nov 2026): each ends on the same
  // bonus-adjusted score, a card already above it keeps what it has and a card that cannot reach it takes its 100. The level is the
  // one where the cards' ends add up to what the finished cards leave of the target.
  const goal = target - cards.reduce((sum, c) => sum + (c.state === "finished" ? contribution(c) : 0), 0);
  const end = (o: (typeof open)[number], level: number) => Math.max(contribution(o.c), Math.min(level, contribution(o.c) + o.room));
  let low = 0;
  let high = Math.max(...open.map((o) => contribution(o.c) + (Number.isFinite(o.room) ? o.room : goal)), goal);
  for (let step = 0; step < 100; step += 1) {
    const level = (low + high) / 2;
    if (open.reduce((sum, o) => sum + end(o, level), 0) < goal) low = level;
    else high = level;
  }
  for (const o of open) {
    out[o.i] = o.c.multiplier === null
      ? { kind: "unknown", reason: o.c.unknown ?? "score bonus unknown" }
      : { kind: "need", raw: Math.min(high, contribution(o.c) + o.room) / o.c.multiplier, share: end(o, high), live: o.c.state === "live", multiplier: o.c.multiplier, ...(o.c.state === "live" ? { now: raw(o.c) } : {}) };
  }
  return { state: "open", current, remaining, room, cards: out };
}

/** Up to one decimal, rounded up so the badge never says less than needed; "50", not "50.0". */
export const roundUp = (x: number) => Math.ceil(x * 10 - 1e-6) / 10;
/** Down to one decimal, so the badge never says he is further past it than he is. */
const roundDown = (x: number) => Math.floor(x * 10 + 1e-6) / 10;
const oneDecimal = (x: number) => String(Math.round(x * 10) / 10);
const bonusWords = (m: number, captain: boolean) => `Score bonus: ${m > 1 + EPS ? `+${Math.round((m - 1) * 100)}%` : "none"}${captain ? " (captain included)" : ""}.`;

export type NeedBadge = { label: string; detail: string; tone: "need" | "live" | "ahead" | "settled" | "reached" | "unreachable" | "unknown" };

/** The pill's text and its explanation for card `i`. */
export function needBadge(result: NeedResult, i: number, target: number | null | undefined, captain = false): NeedBadge {
  const c = result.cards[i];
  const goal = typeof target === "number" ? `the ${oneDecimal(target)}-point target` : "the target";
  if (!c || c.kind === "unknown") return { label: "—", detail: `Points needed unknown: ${c?.kind === "unknown" ? c.reason : "no data"}.`, tone: "unknown" };
  if (c.kind === "reached") return { label: "✓", detail: `Target reached on provisional scores: ${oneDecimal(result.current ?? 0)} of ${oneDecimal(target ?? 0)}. Sorare validates the result after the games${c.contribution === null ? "" : `; this card has ${oneDecimal(c.contribution)}`}.`, tone: "reached" };
  if (c.kind === "settled") return { label: "✓", detail: `Finished: contributed ${oneDecimal(c.contribution)} toward ${goal}.`, tone: "settled" };
  if (c.kind === "unreachable") return { label: "Unreachable", detail: `Even 100 from every card still able to score adds ${oneDecimal(result.room ?? 0)}, short of the ${oneDecimal(result.remaining ?? 0)} still needed for ${goal}.`, tone: "unreachable" };
  const sofar = result.current ? ` (${oneDecimal(result.current)} so far)` : "";
  if (c.live && c.now !== undefined) {
    // Playing: how far he is from the score he should end on, "-7" short of it, "+3" past it (the owner, 3 Nov 2026).
    const gap = c.raw - c.now;
    return gap > EPS
      ? { label: `-${roundUp(gap)}`, detail: `${oneDecimal(c.now)} so far: ${roundUp(gap)} short of the ${roundUp(c.raw)} he should end on, to contribute ${oneDecimal(c.share)} toward ${goal}${sofar}. ${bonusWords(c.multiplier, captain)}`, tone: "live" }
      : { label: `+${roundDown(-gap)}`, detail: `${oneDecimal(c.now)} so far: ${roundDown(-gap)} past the ${roundUp(c.raw)} he should end on; the others need less. ${bonusWords(c.multiplier, captain)}`, tone: "ahead" };
  }
  return c.live
    ? { label: `-${roundUp(c.raw)}`, detail: `Needs ${roundUp(c.raw)} raw points toward ${goal}${sofar}. ${bonusWords(c.multiplier, captain)}`, tone: "live" }
    : { label: String(roundUp(c.raw)), detail: `Needs ${roundUp(c.raw)} raw points to contribute ${oneDecimal(c.share)} toward ${goal}${sofar}. ${bonusWords(c.multiplier, captain)}`, tone: "need" };
}

/** A card's state from a week's scores (lib/planScoresData.ts): no entry is still to play, an unfinished entry is live, a finished
 * entry that did not play is a DNP (a finished 0). */
export function scoreState(got: { score: number; played: boolean; complete?: boolean } | undefined): Pick<NeedCard, "state" | "raw"> {
  if (!got) return { state: "to play", raw: null };
  if (got.complete === false) return got.played ? { state: "live", raw: got.score } : { state: "to play", raw: null };
  return { state: "finished", raw: got.played ? got.score : 0 };
}

/** A Pro lineup's pills, one per starter (Pro has no substitutes): the card's own bonuses + the board's captain bonus. */
export function proNeeds<C extends { mult: number; captain?: boolean; unknown?: string }>(target: number | null | undefined, captainBonus: number | null | undefined, starters: C[], stateOf: (card: C) => Pick<NeedCard, "state" | "raw">): NeedBadge[] {
  const result = pointsNeeded(target, starters.map((card) => ({
    multiplier: proMultiplier({ mult: card.mult, captain: !!card.captain, captainBonus }),
    unknown: card.unknown ?? (card.captain && Number.isFinite(card.mult) ? "the board's captain bonus is not published yet" : "card bonus unknown"),
    ...stateOf(card),
  })));
  return starters.map((card, i) => needBadge(result, i, target, !!card.captain));
}
