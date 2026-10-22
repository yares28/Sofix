import type { Sorare } from "./play";

export type SearchPlayer = { slug: string; name: string; club: string | null; pic: string };

/** Everyone with a player page the top bar can find: the LaLiga index and your own players, each once. */
export function searchIndex(data: Sorare | null, foreign: SearchPlayer[] = []): SearchPlayer[] {
  const out = new Map<string, SearchPlayer>();
  for (const p of data?.market ?? []) out.set(p.slug, { slug: p.slug, name: p.name, club: p.club, pic: p.pic });
  for (const p of (data?.weeks ?? []).flatMap((w) => w.playing.players)) {
    if (p.player && !out.has(p.player)) out.set(p.player, { slug: p.player, name: p.name, club: p.club ?? null, pic: p.pic });
  }
  for (const p of foreign) if (!out.has(p.slug)) out.set(p.slug, p);
  return [...out.values()];
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Players whose name has every typed word, accents ignored; a name that starts with the query first. */
export function findPlayers(players: SearchPlayer[], query: string, limit = 8): SearchPlayer[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return players
    .map((p) => ({ p, name: fold(p.name) }))
    .filter(({ name }) => words.every((w) => name.includes(w)))
    .sort((a, b) => Number(b.name.startsWith(words[0]!)) - Number(a.name.startsWith(words[0]!)) || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ p }) => p);
}

/** Keep the active calendar selection when opening a global search result. */
export function searchPlayerHref(slug: string, search: Pick<URLSearchParams, "get">): string {
  const selected = new URLSearchParams();
  for (const key of ["w", "gw"]) {
    const value = search.get(key);
    if (value) selected.set(key, value);
  }
  return `/players/${slug}${selected.size ? `?${selected}` : ""}`;
}
