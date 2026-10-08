import { z } from "zod";
export const MissionRarity = z.enum(["limited", "rare", "super_rare", "unique"]);
export const MissionPickSchema = z.object({
  player: z.string().min(1).max(120).regex(/^[\w-]+$/), game: z.string().max(120).nullable(),
  rarity: z.string().max(20).nullable(), status: z.enum(["READY", "SUCCESS", "FAILURE"]).nullable(),
  card: z.string().min(1).max(120).regex(/^[\w-]+$/).optional(), id: z.string().max(120).optional(),
  locked: z.boolean().optional(), score: z.number().finite().optional(), target: z.number().finite().optional(),
});
export const MissionSchema = z.object({
  id: z.string().min(1).max(120), title: z.string().min(1).max(80), description: z.string().max(1000),
  mode: z.enum(["DECISIVE", "SCORE"]), picks: z.number().int().min(1).max(10), made: z.number().int().min(0).max(10),
  period: z.string().max(20).nullable(), state: z.string().max(30).nullable(), stats: z.array(z.string().max(40)).max(20).default([]),
  appearances: z.array(MissionPickSchema).max(10).optional(), startDate: z.string().datetime({ offset: true }).optional(),
  config: z.string().max(120).optional(), thresholds: z.array(z.object({ stat: z.string().max(40), min: z.number().finite() })).max(20).optional(),
  overperform: z.object({ by: z.number().finite(), averageType: z.string().max(40) }).optional(),
  ruleTypes: z.array(z.string().max(80)).max(20).optional(), eligibleCards: z.record(z.string().max(120), z.array(z.string().max(120)).max(100)).refine((x) => Object.keys(x).length <= 24).optional(),
  rewards: z.array(z.object({ type: z.string().max(80), amount: z.number().finite().optional(), label: z.string().max(300) })).max(20).optional(),
});
