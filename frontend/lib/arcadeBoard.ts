import type { Arcade, ArcadeLineup } from "./arcade";
import { bigReward, cashOf, SETTLES_AFTER_MS, type StepInfo } from "./arcadePlan";

/** Where an Arcade climb starts, shared by the Arcade page and the extension's dock (plans/dock-v2.md). */

/** Each step's target, lives left (Sorare's count for a started step, else the full 4) and whether its reward is big. */
export function stepInfos(arcade: Arcade): StepInfo[] {
  return (arcade.board?.steps ?? []).map((s) => ({ number: s.number, target: s.target, lives: s.lineups?.remaining ?? s.lineups?.max ?? 4, big: bigReward(s.rewards), cash: cashOf(s.rewards) }));
}

/** A lineup on Sorare still waiting or playing: not cancelled, not a draft, a card not locked yet or a game live. */
const running = (l: ArcadeLineup) => !l.cancelled && !l.draft && (l.live || l.cards.some((c) => !c.locked));
/** When a lineup on Sorare settles: its last game's kick-off plus the time Sorare takes to count it. */
const settlesOf = (l: ArcadeLineup) => Math.max(0, ...l.cards.map((c) => (c.kickoff ? Date.parse(c.kickoff) : 0))) + SETTLES_AFTER_MS;

/**
 * Where the climb starts. With lives left on the current step, there and now. With none left but lineups waiting, the plan goes on as if
 * the first to settle clears it: the next step from then, its lives less the waiting lineups that have not started by then (they move
 * on with you, owner's answer 8). Cards in a running lineup are held until it settles.
 */
export function climbStart(arcade: Arcade, steps: StepInfo[], current: number) {
  const step = arcade.board?.steps.find((s) => s.number === current);
  const waiting = (step?.entered ?? []).filter(running);
  const held = (arcade.board?.steps ?? []).flatMap((s) => s.entered.filter(running).flatMap((l) => l.cards.flatMap((c) => (c.slug ? [{ card: c.slug, until: settlesOf(l) }] : []))));
  const lives = steps.find((s) => s.number === current)?.lives ?? 4;
  if (lives > 0 || !waiting.length || current >= (steps.at(-1)?.number ?? 1)) return { start: { step: current, lives, notBefore: null, held }, waiting, after: null };
  const first = waiting.reduce((a, b) => (settlesOf(a) <= settlesOf(b) ? a : b));
  const at = settlesOf(first);
  const movingOn = waiting.filter((l) => l !== first && l.cards.every((c) => !c.kickoff || Date.parse(c.kickoff) > at)).length;
  return { start: { step: current + 1, lives: Math.max(0, 4 - movingOn), notBefore: at, held }, waiting, after: { at, movingOn } };
}

/**
 * The step the climb is on, the one Sorare's compose page lets you play: Sorare's current step, moved past every step already cleared
 * (Sorare keeps naming a cleared step until its reward is claimed: on 1 Nov 2026 the page said step 2 · 300 while lineups went on
 * step 3 · 360). Every number on the page reads this one step.
 */
export function climbStep(arcade: Arcade): number {
  const steps = arcade.board?.steps ?? [];
  let current = arcade.board?.current ?? 1;
  while (["CLAIMABLE", "CLAIMED"].includes(steps.find((s) => s.number === current)?.state ?? "") && steps.some((s) => s.number === current + 1)) current += 1;
  return current;
}
