import type { MissionRow } from "./missions";
import type { MissionPlayer } from "./missionsPool";

/** Merge Sorare's current owned pickable cards with forecasts; source game identities always stay intact. */
export function missionPlayers(players: MissionPlayer[], missions: MissionRow[], rarity: string): MissionPlayer[] {
  const merged = new Map(players.map((p) => [p.card ?? p.player ?? p.name, { ...p, games: [...p.games] }]));
  for (const mission of missions) for (const c of mission.inventory ?? []) {
    let p = merged.get(c.card);
    if (!p) {
      const known = players.find((p) => p.player === c.player && p.rarity === rarity);
      p = known ? { ...known, card: c.card, games: [...known.games] } : {
        card: c.card, player: c.player, name: c.name, pos: c.pos, pic: c.pic, avatar: "", crest: null,
        rarity, club: null, inSeason: false, cards: 1, p: 0, x: 0, average: 0, availabilityKnown: false, games: [],
      };
      merged.set(c.card, p);
    }
    if (!p.games.some((g) => g.id === c.game.id)) p.games.push({ ...c.game, availabilityKnown: false });
  }
  return [...merged.values()];
}
