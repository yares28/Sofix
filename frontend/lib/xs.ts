import { cardScore, type PlayCard, type PlayingPlayer, type XsVersions } from "./play";

/**
 * The xS version switch (plans/xscore-versions.md): the owner picks which number every card shows, kept in this browser
 * like the theme. v1 is the default. Pages draw all three numbers and one CSS rule on `html[data-xs]` shows the picked one,
 * so the server renders nothing per choice and switching needs no request.
 */
export type XsVersion = "v0" | "v1" | "v2";
export const XS_VERSIONS: readonly XsVersion[] = ["v0", "v1", "v2"];
export const XS_KEY = "sofix-xs";

/** Runs before the first paint, so a saved version never flashes v1's numbers first. */
export const XS_SCRIPT = `try{var x=localStorage.getItem("${XS_KEY}");if(x==="v0"||x==="v2")document.documentElement.dataset.xs=x}catch(e){}`;

/** The version on screen: v0 or v2 only when picked, else v1. */
export function shownXs(saved: string | null | undefined): XsVersion {
  return saved === "v0" || saved === "v2" ? saved : "v1";
}

export type Roles = { pStart?: number | null; pOn?: number | null };

const one = (n: number) => Math.round(n * 10) / 10;
const asSub = ({ pStart, pOn }: Roles) => pStart != null && pOn != null && pOn > pStart;

/**
 * One card's number in each version. v1 is what is published today (`x`, his chance of playing included). v2 is his most
 * likely final score in his likelier role (starting, or coming on). v0 is the old formula's score in each role weighed by its
 * chance, like v1's. No made-up numbers: a version the game does not carry, or v0 without the chances, shows v1's.
 */
export function xsNumbers(v1: number | null, game: XsVersions | undefined, roles: Roles): Record<XsVersion, number | null> {
  if (v1 === null || !game) return { v0: v1, v1, v2: v1 };
  const v2 = asSub(roles) ? game.subPoint : game.startPoint;
  const { pStart, pOn } = roles;
  const v0 = game.startPrev != null && pStart != null ? one(pStart * game.startPrev + (pOn ?? 0) * (game.subPrev ?? 0)) : v1;
  return { v0, v1, v2: v2 ?? v1 };
}

/** The decisive scenario of his likelier role, "27% chance of 79": null when the chance rounds to none or its score is unknown. */
export function decisiveOf(game: XsVersions | undefined, roles: Roles): { pct: number; score: number } | null {
  if (!game) return null;
  const [p, score] = asSub(roles) ? [game.subPDec, game.subDecIf] : [game.pDec, game.decIf];
  if (p == null || score == null || Math.round(p * 100) < 1) return null;
  return { pct: Math.round(p * 100), score: Math.round(score) };
}

/** A card that already names his role ("if he starts", "if he comes on": Play's plans): each version's score in that role, v1's where a version has none. */
export function roleNumbers(v1: number, game: XsVersions | undefined, role: "start" | "sub" | null): Record<XsVersion, number> {
  if (!game || role === null) return { v0: v1, v1, v2: v1 };
  const [v0, v2] = role === "sub" ? [game.subPrev, game.subPoint] : [game.startPrev, game.startPoint];
  return { v0: v0 ?? v1, v1, v2: v2 ?? v1 };
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
 * points), and the decisive scenario of that role. Nothing when no version differs from v1's and there is no scenario: older
 * payloads and other leagues answer exactly as before.
 */
export function tileVersions(
  v1: number,
  game: XsVersions | undefined,
  roles: Roles,
  starts: boolean,
): { xs?: { v0: number; v2: number }; dec?: { pct: number; score: number } } {
  if (!game) return {};
  const all = starts ? roleNumbers(v1, game, "start") : xsNumbers(v1, game, roles);
  const [v0, v2] = [Math.round(all.v0 ?? v1), Math.round(all.v2 ?? v1)];
  const dec = decisiveOf(game, starts ? { pStart: 1, pOn: 0 } : roles);
  return { ...(v0 !== Math.round(v1) || v2 !== Math.round(v1) ? { xs: { v0, v2 } } : {}), ...(dec ? { dec } : {}) };
}

/** What each version is, in the owner's words (plans/xscore-versions.md): the switch's menu and the Audit say the same. */
export const XS_ABOUT: Record<XsVersion, string> = {
  v0: "Before 12 Nov: normal and decisive score mixed",
  v1: "Expected points · the default",
  v2: "The most likely final score",
};

export type Replay = { cases: number; previousHits: number; meanHits: number; hits: number };

/**
 * Each version's share within 7 points on one replay (lib/data/sofix_v1_replay.json, the same games for all three): v0 is the
 * previous model, v1 Sofix v1's expected points, v2 its most likely score. ±10 and ±15 are not in the replay yet.
 */
export function replayRates(replay: Replay): Record<XsVersion, number> {
  return { v0: replay.previousHits / replay.cases, v1: replay.meanHits / replay.cases, v2: replay.hits / replay.cases };
}
