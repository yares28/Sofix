import { cardScore, type PlayCard, type PlayingPlayer, type XsVersions } from "./play";

/**
 * The xS version switch (plans/xscore-versions.md): the owner picks which number every card shows, kept in this browser
 * like the theme. v1 is the default. Pages draw every version's number and one CSS rule on `html[data-xs]` shows the picked
 * one, so the server renders nothing per choice and switching needs no request.
 */
export type XsVersion = "v0" | "v1" | "v2" | "v3";
export const XS_VERSIONS: readonly XsVersion[] = ["v0", "v1", "v2", "v3"];
export const XS_KEY = "sofix-xs";
const PICKABLE = new Set<string>(["v0", "v2", "v3"]); // v1 is the default: no attribute

/** Runs before the first paint, so a saved version never flashes v1's numbers first. */
export const XS_SCRIPT = `try{var x=localStorage.getItem("${XS_KEY}");if(x==="v0"||x==="v2"||x==="v3")document.documentElement.dataset.xs=x}catch(e){}`;

/** The version on screen: v0, v2 or v3 only when picked, else v1. */
export function shownXs(saved: string | null | undefined): XsVersion {
  return saved && PICKABLE.has(saved) ? (saved as XsVersion) : "v1";
}

export type Roles = { pStart?: number | null; pOn?: number | null };
type Scenario = { pct: number; score: number };

const one = (n: number) => Math.round(n * 10) / 10;
const asSub = ({ pStart, pOn }: Roles) => pStart != null && pOn != null && pOn > pStart;

/** Each version's number in one role. v3 is v0's normal score (its decisive one from a 75% chance, worked out by the job) for a
 * starter and v2's for a substitute; without v0 on file it shows v2's, as v2 shows v1's without its own. */
function inRole(v1: number, game: XsVersions, sub: boolean): { v0: number | undefined; v2: number; v3: number } {
  const v2 = (sub ? game.subPoint : game.startPoint) ?? v1;
  return { v0: sub ? game.subPrev : game.startPrev, v2, v3: (sub ? game.subPoint : game.startV3) ?? v2 };
}

/**
 * One card's number in each version. v1 is what is published today (`x`, his chance of playing included). v2 is his most
 * likely final score in his likelier role (starting, or coming on), v3 likewise from v0's two scores. v0 is the old formula's
 * score in each role weighed by its chance, like v1's. No made-up numbers: a version the game does not carry shows the one it
 * stands in for (v0 and v2: v1's; v3: v2's).
 */
export function xsNumbers(v1: number | null, game: XsVersions | undefined, roles: Roles): Record<XsVersion, number | null> {
  if (v1 === null || !game) return { v0: v1, v1, v2: v1, v3: v1 };
  const { v2, v3 } = inRole(v1, game, asSub(roles));
  const { pStart, pOn } = roles;
  const v0 = game.startPrev != null && pStart != null ? one(pStart * game.startPrev + (pOn ?? 0) * (game.subPrev ?? 0)) : v1;
  return { v0, v1, v2, v3 };
}

/**
 * The decisive scenario a version names beside its number, "27% chance of 79": v2's from Sofix v1's game, v3's from v0's (absent
 * once v3's number has switched to it, so it is never said twice). Null when the chance rounds to none or its score is unknown.
 */
export function decisiveOf(game: XsVersions | undefined, roles: Roles, version: "v2" | "v3" = "v2"): Scenario | null {
  if (!game) return null;
  const sub = asSub(roles);
  const [p, score] = sub ? [game.subPDec, game.subDecIf] : version === "v3" ? [game.pDecPrev, game.decPrevIf] : [game.pDec, game.decIf];
  if (p == null || score == null || Math.round(p * 100) < 1) return null;
  return { pct: Math.round(p * 100), score: Math.round(score) };
}

/** A card that already names his role ("if he starts", "if he comes on": Play's plans): each version's score in that role. */
export function roleNumbers(v1: number, game: XsVersions | undefined, role: "start" | "sub" | null): Record<XsVersion, number> {
  if (!game || role === null) return { v0: v1, v1, v2: v1, v3: v1 };
  const { v0, v2, v3 } = inRole(v1, game, role === "sub");
  return { v0: v0 ?? v1, v1, v2, v3 };
}

/** A plan's card in every version: his score in the role the card names (`cardScore`), from his first game of the week. */
export function cardXs(card: Pick<PlayCard, "pStart" | "start" | "on" | "mu" | "player">, players: PlayingPlayer[]): Record<XsVersion, number> {
  const { value, words } = cardScore(card);
  const games = players.find((p) => card.player && p.player === card.player)?.games ?? [];
  const first = [...games].sort((a, b) => a.kickoff.localeCompare(b.kickoff))[0];
  return roleNumbers(value, first, words === "if he comes on" ? "sub" : words === "if he starts" ? "start" : null);
}

/** A player's week number (`x`, his chance of playing included) in every version, from his first game of the week. */
export function playerXs(x: number | null, player: Pick<PlayingPlayer, "games" | "pStart" | "pOn"> | undefined): Record<XsVersion, number | null> {
  const first = player ? [...player.games].sort((a, b) => a.kickoff.localeCompare(b.kickoff))[0] : undefined;
  return xsNumbers(x, first, { pStart: first?.pStart ?? player?.pStart, pOn: first?.pOn ?? player?.pOn });
}

/**
 * The sorare.com overlay's tile in the other versions (it shows his score if he starts when it has the split, else his expected
 * points), and each scenario of that role (`dec` v2's, `dec3` v3's). Nothing when no version differs from v1's and there is no
 * scenario: older payloads and other leagues answer exactly as before.
 */
export function tileVersions(
  v1: number,
  game: XsVersions | undefined,
  roles: Roles,
  starts: boolean,
): { xs?: { v0: number; v2: number; v3: number }; dec?: Scenario; dec3?: Scenario } {
  if (!game) return {};
  const all = starts ? roleNumbers(v1, game, "start") : xsNumbers(v1, game, roles);
  const [v0, v2, v3] = [all.v0, all.v2, all.v3].map((n) => Math.round(n ?? v1)) as [number, number, number];
  const role = starts ? { pStart: 1, pOn: 0 } : roles;
  const dec = decisiveOf(game, role, "v2");
  const dec3 = decisiveOf(game, role, "v3");
  const shown = Math.round(v1);
  return { ...(v0 !== shown || v2 !== shown || v3 !== shown ? { xs: { v0, v2, v3 } } : {}), ...(dec ? { dec } : {}), ...(dec3 ? { dec3 } : {}) };
}

/** What each version is, in the owner's words (plans/xscore-versions.md): the switch's menu and the Audit say the same. */
export const XS_ABOUT: Record<XsVersion, string> = {
  v0: "Before 12 Nov: normal and decisive score mixed",
  v1: "Expected points · the default",
  v2: "The most likely final score",
  v3: "v0's normal score, its decisive one at 75%",
};

export type Replay = { cases: number; previousHits: number; meanHits: number; hits: number };
export type Band = 7 | 10 | 15;

/**
 * Starters' hits on the research's side-by-side replay of the same 6,754 LaLiga starts (Jan–Oct 2026, docs/xscore-failure-analysis.md
 * "Sofix v0, v1, v2 and v3 replayed side by side" in the research branch): what lib/data/sofix_v1_replay.json does not hold yet.
 */
const STARTER_HITS: Record<Band, Partial<Record<XsVersion, number>>> = {
  7: { v3: 2611 },
  10: { v1: 2922, v2: 3343, v3: 3386 },
  15: { v1: 4240, v2: 4229, v3: 4366 },
};

/** Each version's share within 7 points on one replay (lib/data/sofix_v1_replay.json): v0 the previous model, v1 the expected points, v2 the most likely score. */
export function replayRates(replay: Replay): Partial<Record<XsVersion, number>> {
  return { v0: replay.previousHits / replay.cases, v1: replay.meanHits / replay.cases, v2: replay.hits / replay.cases };
}

/** Starters' replay rates within a band, every version that has one: the replay file's, then the research's (`STARTER_HITS`). */
export function starterRates(band: Band, replay: Replay): Partial<Record<XsVersion, number>> {
  const research = Object.fromEntries(Object.entries(STARTER_HITS[band]).map(([v, hits]) => [v, hits / replay.cases]));
  return { ...(band === 7 ? replayRates(replay) : {}), ...research };
}
