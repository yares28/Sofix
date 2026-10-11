import { z } from "zod";

const bonus = z.tuple([z.number().finite(), z.number().finite()]).nullable();
export const ScoringSchema = z.object({
  slots: z.array(z.object({ positions: z.array(z.string()).max(4), sub: z.boolean() })).min(1).max(15),
  minInSeason: z.number().int().min(0).max(15),
  captain: z.number().finite(), season: z.number().finite(), grade: z.number().finite(),
  scarcity: z.record(z.string(), z.number().finite()), clubBonus: bonus, averageBonus: bonus,
});
export type EnteredScoring = z.infer<typeof ScoringSchema>;
export const CardMetadata = {
  index: z.number().int().min(0).max(14).optional(),
  player: z.string().max(200).nullable().optional(),
  positions: z.array(z.string()).max(4).optional(),
  level: z.number().int().min(0).max(100).optional(),
  inSeason: z.boolean().optional(),
  average: z.number().finite().nullable().optional(),
  club: z.string().max(200).nullable().optional(),
};

export const BoardMetadata = {
  rules: z.object({ appearances: z.array(z.object({ positions: z.array(z.string()), sub: z.boolean() })) }).nullish().catch(null),
  displayedTypedRules: z.array(z.object({ key: z.string() })).nullish().catch(null),
  engineConfiguration: z.object({
    captain: z.number().nullish(), season: z.number().nullish(), grade: z.number().nullish(),
    scarcity: z.record(z.string(), z.number()).nullish(),
    sameActiveClub: z.object({ number_players_per_club: z.object({ max: z.number() }), bonus: z.number() }).nullish(),
    averageScores: z.object({ max: z.number(), bonus: z.number() }).nullish(),
  }).nullish().catch(null),
};

type Board = { [K in keyof typeof BoardMetadata]?: z.infer<(typeof BoardMetadata)[K]> };
export function scoringRules(board: Board | null | undefined): EnteredScoring | undefined {
  const engine = board?.engineConfiguration;
  if (!engine || !board?.rules?.appearances.length) return undefined;
  return {
    slots: board.rules.appearances,
    minInSeason: board.displayedTypedRules?.some(r => r.key === "SeasonBonus") ? 4 : 0,
    captain: engine.captain ?? 0, season: engine.season ?? 0, grade: engine.grade ?? 0,
    scarcity: engine.scarcity ?? {},
    clubBonus: engine.sameActiveClub ? [engine.sameActiveClub.number_players_per_club.max, engine.sameActiveClub.bonus] : null,
    averageBonus: engine.averageScores ? [engine.averageScores.max, engine.averageScores.bonus] : null,
  };
}
