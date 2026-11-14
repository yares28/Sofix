import { outlookOf, newerChances, sideIn, type Arcade, type ArcadeBench, type ArcadeChances, type ArcadeExtras, type ArcadeLaLiga, type ArcadeRead } from "./arcade";
import { climbStart, climbStep, stepInfos } from "./arcadeBoard";
import { DOCK_MODEL_VERSION, type ArcadeDockModel, type DockElevens, type DockInput } from "./arcadeDock";
import type { ArcadeElevens } from "./arcadeElevens";
import type { Outlook } from "./arcadePlan";

/**
 * The dock's Arcade engine (plans/dock-v2.md), run by the extension in a hidden page: the Arcade page's reads, then its climb in a worker.
 * Every way it can go wrong ends in a run state the dock puts in words; a failed run never replaces the last good plan.
 */

export type Stage = "board" | "forecasts" | "lineups" | "plan";
export const STAGES: Stage[] = ["board", "forecasts", "lineups", "plan"];
/** The climb's time; past it, the best lineup for the step alone (rough). The dock calls a run stopped past its deadline + grace. */
export const PLAN_MS = 150_000;
export const ROUGH_MS = 30_000;
export const READ_MS = 120_000;
export const GRACE_MS = 15_000;

export type RunError = { stage: Stage; text: string; at: number };
export type RunState = {
  state: "working" | "done" | "failed";
  stage: Stage | null;
  startedAt: number;
  /** When this stage must have answered: past it (plus GRACE_MS) the dock says the run stopped. */
  deadline: number;
  error: RunError | null;
  /** Readings that did not come, said under the plan without failing it ("Sofix unreachable", "Projections not read"). */
  notes: string[];
};
export type EngineReport = { run: RunState; model?: ArcadeDockModel };

export type EngineDeps = {
  readArcade: () => Promise<ArcadeRead>;
  readExtras: (arcade: Arcade) => Promise<ArcadeExtras | null>;
  appData: (games: string[], players: string[]) => Promise<{ laliga: ArcadeLaLiga; chances: ArcadeChances } | null>;
  readBench: (stepId: string, until: string | null, force: boolean) => Promise<ArcadeBench | null>;
  readElevens: (arcade: Arcade, force: boolean) => Promise<ArcadeElevens>;
  plan: (input: DockInput, ms: number) => Promise<ArcadeDockModel>;
  rough: (input: DockInput, ms: number) => Promise<ArcadeDockModel>;
  aim: () => Promise<number | null>;
  report: (report: EngineReport) => void;
  now: () => number;
};

/** What a failed board read says, in words. */
export const BOARD_WORDS: Record<string, string> = {
  "no-extension": "The engine could not reach the extension. Reload Sofix on chrome://extensions.",
  outdated: "The extension is older than the engine. Run configure, then Sofix reloads itself.",
  "no-tab": "Open sorare.com in this Chrome, signed in.",
  "signed-out": "Sign in to Sorare on the open tab.",
  unreadable: "Sorare answered in a shape Sofix doesn't know yet, so nothing is shown rather than a wrong number.",
  "chrome-copy": "Sorare could not be read.",
};

/** Reject after `ms`: a read that never answers ends the stage instead of hanging the run. */
export function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} did not answer`)), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error: unknown) => { clearTimeout(timer); reject(error instanceof Error ? error : new Error(String(error))); });
  });
}

const failedPart = (detail: string) => {
  const part = detail.split(":")[0]?.trim() ?? "";
  return { board: "your board", cards: "your cards", lineups: "your lineups", missions: "your missions", games: "the games" }[part] ?? part ?? "Sorare";
};

/** One run. `prev` is the last good plan, kept on any failure. */
export async function runEngine(deps: EngineDeps, prev: ArcadeDockModel | null, force = false): Promise<RunState> {
  const startedAt = deps.now();
  const notes: string[] = [];
  let run: RunState = { state: "working", stage: "board", startedAt, deadline: startedAt + READ_MS, error: null, notes };
  const stage = (next: Stage, ms: number) => { run = { ...run, stage: next, deadline: deps.now() + ms }; deps.report({ run }); };
  const fail = (text: string): RunState => {
    run = { ...run, state: "failed", error: { stage: run.stage ?? "board", text, at: deps.now() } };
    deps.report({ run });
    return run;
  };
  const done = (model: ArcadeDockModel): RunState => {
    run = { ...run, state: "done", stage: null, deadline: deps.now() };
    deps.report({ run, model });
    return run;
  };
  deps.report({ run });

  try {
    // 1. The board and your cards, from the open tab.
    const read = await within(deps.readArcade(), READ_MS, "Sorare");
    if (read.state === "no-set") return done(emptyModel(deps.now(), "no-set", prev));
    if (read.state === "failed") return fail(`Couldn't read ${failedPart(read.detail)} from Sorare (${read.detail.split(":").slice(1).join(":").trim() || "refused"}).`);
    if (read.state !== "ok") return fail(BOARD_WORDS[read.state] ?? "Sorare could not be read.");
    const arcade = read.arcade;
    if (read.unread.length) notes.push(`Not read this time: ${read.unread.join(", ")}`);
    if (!arcade.board) return done(emptyModel(deps.now(), "no-board", prev, arcade));
    const games = arcade.games ?? [];
    const myGames = games.filter((g) => arcade.cards.some((c) => sideIn(c, g) !== null));
    const current = climbStep(arcade);
    const step = arcade.board.steps.find((s) => s.number === current) ?? null;

    // 2. Forecasts: Sorare's projections and past scores, Sofix's numbers and saved start %, Sorare's start % for the step.
    stage("forecasts", READ_MS);
    const players = [...new Set(arcade.cards.map((c) => c.player))];
    const [extras, app, bench] = await Promise.all([
      within(deps.readExtras(arcade), READ_MS, "Sorare's projections").catch(() => null),
      within(deps.appData(myGames.map((g) => g.id), players), 30_000, "Sofix").catch(() => null),
      step ? within(deps.readBench(step.id, arcade.set.end, force), READ_MS, "Sorare's start %").catch(() => null) : Promise.resolve(null),
    ]);
    if (!extras) return fail("Couldn't read projections and past scores from Sorare.");
    if (extras.unread.length) notes.push(`Not read this time: ${extras.unread.join(", ")}`);
    if (!app) notes.push("Sofix unreachable: Sorare's numbers only");
    if (bench && bench.state === "refused") notes.push("Sorare refused its start % read; the saved ones are used");

    // 3. The announced elevens of games within three hours.
    stage("lineups", READ_MS);
    const elevens = await within(deps.readElevens(arcade, force), READ_MS, "Sorare's lineups").catch((): ArcadeElevens => ({ state: "ok", chances: {}, games: [], unread: myGames.filter((g) => Math.abs(Date.parse(g.kickoff) - deps.now()) < 3 * 3_600_000).map((g) => g.id), checked: 0, at: deps.now() }));
    const saved = app?.chances ?? null;
    const chances = bench && bench.state === "ok" && Object.keys(bench.chances).length ? newerChances(saved, bench.chances) : saved;
    const laliga = app?.laliga ?? {};
    const outlooks: Outlook[] = myGames.flatMap((g) => arcade.cards.filter((c) => sideIn(c, g) !== null).map((c) => outlookOf(c, g, extras, chances, laliga, elevens.chances)));
    const windowed = myGames.filter((g) => Math.abs(Date.parse(g.kickoff) - elevens.at) <= 3 * 3_600_000).map((g) => g.id);
    const dockElevens: DockElevens = {
      games: elevens.games, unread: [...new Set(elevens.unread)], checked: windowed, bench: elevens.bench ?? {}, chances: elevens.chances,
      at: elevens.checked || elevens.unread.length ? elevens.at : null, limited: !!elevens.limited, outdated: elevens.state === "outdated",
    };

    // 4. The climb, in a worker; past its time, the best lineup for the step alone.
    const now = deps.now();
    const steps = stepInfos(arcade);
    const input: DockInput = {
      outlooks, steps, boardSteps: arcade.board.steps, start: climbStart(arcade, steps, current).start, current, aim: await deps.aim().catch(() => null),
      captainBonus: step?.captain ?? arcade.board.steps[0]?.captain ?? 0, now, set: { name: arcade.set.name, end: arcade.set.end }, games: myGames,
      status: extras.status ?? {}, elevens: dockElevens, sofix: !!app, prev,
    };
    stage("plan", PLAN_MS);
    try {
      return done(await within(deps.plan(input, PLAN_MS), PLAN_MS, "The climb"));
    } catch {
      notes.push("The full climb took too long: this is the best lineup for the step on its own");
      stage("plan", ROUGH_MS);
      try {
        return done(await within(deps.rough(input, ROUGH_MS), ROUGH_MS, "The rough lineup"));
      } catch {
        return fail("Calculation stopped before a lineup was found.");
      }
    }
  } catch (error) {
    return fail(error instanceof Error && /did not answer/.test(error.message) ? `${error.message}.` : "Something in the read broke; the last plan is kept.");
  }
}

function emptyModel(now: number, state: ArcadeDockModel["state"], prev: ArcadeDockModel | null, arcade?: Arcade): ArcadeDockModel {
  return {
    v: DOCK_MODEL_VERSION, state, at: now, set: arcade ? { name: arcade.set.name, end: arcade.set.end } : prev?.set ?? { name: "Arcade", end: null },
    step: { number: 0, target: 0, lives: 0, max: 4, of: 0, reward: null }, aim: 0, next: null, best: [], clubs: [],
    lineupsOut: { announced: [], waiting: [], unread: [], checkedAt: null, limited: false, retryAt: null, outdated: false }, sofix: true, change: null, alerts: [], kickoffs: [],
  };
}

/** Whether the dock should call a run stopped: still "working" well past the deadline of the stage it is on. */
export const stopped = (run: Pick<RunState, "state" | "deadline"> | null, now: number) => !!run && run.state === "working" && now > run.deadline + GRACE_MS;
