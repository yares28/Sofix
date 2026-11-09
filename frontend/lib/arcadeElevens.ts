import { z } from "zod";
import { announcedSides } from "./actualLineups";
import { readCopy, shareCopy } from "./chromeCopy";
import { askExtension, extensionAtLeast, pingExtension } from "./extension";
import { sideIn, type ArcadeCard, type ArcadeChances, type ArcadeGame } from "./arcade";

export const ARCADE_ELEVENS_VERSION = "0.4.21";
const WINDOW_MS = 3 * 3600_000;
const KEEP_MS = 3 * 60_000;
const KEY = "sofix-arcade-elevens:1";
const Kept = z.record(z.string(), z.object({ kickoff: z.string(), at: z.number(), cards: z.array(z.string()), players: z.record(z.string(), z.tuple([z.number().int().min(0).max(10000), z.number()])) }));
export type ArcadeElevens = { state: "ok" | "outdated" | "no-extension"; chances: ArcadeChances; games: string[]; unread: string[]; checked: number; at: number };

/** Only a complete official XI can assert 100% or 0%; an unannounced side says nothing about any player. */
export function parseArcadeElevens(value: unknown, game: ArcadeGame, cards: ArcadeCard[], now: number): ArcadeChances[string] | null {
  const body = z.object({ anyGame: z.unknown() }).safeParse(value);
  const read = body.success ? announcedSides(body.data.anyGame) : null;
  if (!read || read.id !== game.id || Date.parse(read.kickoff) !== Date.parse(game.kickoff) || read.home !== game.home?.slug || read.away !== game.away?.slug) return null;
  const out: ArcadeChances[string] = {};
  for (const side of read.sides) {
    const starters = new Set(side.rows.flatMap((r) => r.players.map((p) => p.slug)));
    for (const card of cards.filter((c) => sideIn(c, game) === side.team)) out[card.player] = [starters.has(card.player) ? 10000 : 0, Math.floor(now / 1000)];
  }
  return out;
}

/** Read imminent games through the existing Sorare tab. Never opens a page, polls the app, or reuses another game's eleven. */
export async function readArcadeElevens(games: ArcadeGame[], cards: ArcadeCard[], force = false, now = Date.now()): Promise<ArcadeElevens> {
  let kept: z.infer<typeof Kept> = {};
  try { kept = Kept.parse(JSON.parse(localStorage.getItem(KEY) ?? "{}")); } catch { /* empty or old storage */ }
  const eligible = games.filter((g) => Date.parse(g.kickoff) > now - WINDOW_MS && Date.parse(g.kickoff) <= now + WINDOW_MS && cards.some((c) => sideIn(c, g) !== null));
  const valid = new Map(eligible.map((g) => [g.id, g.kickoff]));
  kept = Object.fromEntries(Object.entries(kept).filter(([id, row]) => valid.get(id) === row.kickoff && row.at <= now && now < Date.parse(row.kickoff) + WINDOW_MS));
  const chances: ArcadeChances = Object.fromEntries(Object.entries(kept).map(([id, row]) => [id, row.players]));
  const result: ArcadeElevens = { state: "ok", chances, games: Object.keys(chances).filter((id) => Object.keys(chances[id]!).length > 0), unread: [], checked: eligible.length, at: now };
  if (!eligible.length) return result;
  const extension = await pingExtension();
  if (!extension) return (await readCopy<ArcadeElevens>(KEY))?.value ?? { ...result, state: "no-extension" };
  if (!extensionAtLeast(extension.version, ARCADE_ELEVENS_VERSION)) return { ...result, state: "outdated" };
  for (const game of eligible) {
    const mine = [...new Set(cards.filter((c) => sideIn(c, game) !== null).map((c) => c.player))].sort();
    if (!force && kept[game.id] && now - kept[game.id]!.at < KEEP_MS && JSON.stringify(mine) === JSON.stringify(kept[game.id]!.cards)) continue;
    const answer = z.object({ ok: z.literal(true), state: z.string(), status: z.number().optional(), data: z.unknown().optional() })
      .safeParse(await askExtension({ type: "sorare", step: "arcade-elevens", game: game.id }, 25_000));
    const players = answer.success && answer.data.state === "ok" ? parseArcadeElevens(answer.data.data, game, cards, now) : null;
    if (players === null) {
      result.unread.push(game.id);
      if (answer.success && answer.data.status === 429) { result.unread.push(...eligible.slice(eligible.indexOf(game) + 1).map((g) => g.id)); break; }
      continue;
    }
    // A partial announcement cannot erase a previously confirmed opposite side.
    chances[game.id] = { ...chances[game.id], ...players };
    kept[game.id] = { kickoff: game.kickoff, at: now, cards: mine, players: chances[game.id]! };
  }
  try { localStorage.setItem(KEY, JSON.stringify(kept)); } catch { /* unavailable storage: retain this visit's read */ }
  result.games = Object.keys(chances).filter((id) => Object.keys(chances[id]!).length > 0);
  shareCopy(KEY, result);
  return result;
}
