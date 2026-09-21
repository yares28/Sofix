import { z } from "zod";
import type { FixtureGrid, GridMeta } from "./types";

/**
 * Runtime check of the API payload before it reaches the board. `satisfies` ties each schema to the
 * TypeScript types (generated from the API's OpenAPI document), so a backend change that the schema
 * doesn't follow fails `npm run typecheck`.
 */
const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "not a date");
const probability = z.number().min(0).max(1);

const PredictionSchema = z.object({
  difficulty: z.number().min(0).max(100),
  label: z.enum(["Very favourite", "Favourite", "Even", "Underdog", "Big underdog"]),
  bucket: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  expected_points: z.number().min(0).max(3),
  probabilities: z.object({ win: probability, draw: probability, loss: probability }),
  clean_sheet: probability.nullable(),
  xg_for: z.number().min(0).nullable(),
  xg_against: z.number().min(0).nullable(),
  both_score: probability.nullish(),
});

const RecordSchema = z
  .object({
    band: z.string().min(1).max(20),
    games: z.number().int().min(0),
    wins: z.number().int().min(0),
    rate: probability,
    league: probability,
    edge: z.number().min(-1).max(1),
  })
  .nullish();

const CellSchema = z.object({
  fixture_id: z.number().int(),
  opponent_code: z.string().min(1).max(8),
  venue: z.enum(["H", "A"]),
  kickoff_utc: isoDate,
  date_confirmed: z.boolean(),
  rescheduled: z.boolean(),
  status: z.enum(["scheduled", "live", "finished", "postponed"]),
  result: z
    .object({ goals_for: z.number().int().min(0), goals_against: z.number().int().min(0), outcome: z.enum(["W", "D", "L"]) })
    .nullable(),
  review: z
    .object({
      outcome_chance: probability,
      points: z.number().int().min(0).max(3),
      expected_points: z.number().min(0).max(3),
      surprise: probability,
    })
    .nullish(),
  prediction: PredictionSchema.nullable(),
  market: z
    .object({
      win: probability,
      draw: probability,
      loss: probability,
      scores: probability,
      scores_2plus: probability,
      clean_sheet: probability,
      concedes_2plus: probability,
      both_score: probability,
      expected_points: z.number().min(0).max(3),
      bookmakers: z.number().int().min(0),
      fetched_at: isoDate,
    })
    .nullish(),
  record: RecordSchema,
  record_price: RecordSchema,
});

const LensScaleSchema = z.object({ cuts: z.array(z.number()).length(4), higher_is_easier: z.boolean() });

export const FixtureGridSchema = z.object({
  season: z.string(),
  current_matchday: z.number().int().nullable(),
  model_version: z.string().nullable(),
  lens_scales: z.object({
    overall: LensScaleSchema,
    attack: LensScaleSchema,
    defence: LensScaleSchema,
    odds: LensScaleSchema,
    record: LensScaleSchema,
    market_record: LensScaleSchema,
  }),
  matchdays: z.array(z.object({ number: z.number().int(), date_from: isoDate, date_to: isoDate, finished: z.boolean() })),
  teams: z.array(
    z.object({
      code: z.string().regex(/^[A-Z0-9]{3}$/),
      name: z.string().min(1),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      crest_url: z.string().startsWith("https://crests.football-data.org/").nullable(),
      cells: z.array(z.array(CellSchema)),
      opening: z.array(z.number().int().min(1).max(30)).nullish(), // pre-season projected position per gameweek
    }),
  ),
}) satisfies z.ZodType<FixtureGrid>;

export const GridMetaSchema = z.object({
  last_synced_at: isoDate.nullable(),
  last_predicted_at: isoDate.nullable(),
  model_notes: z
    .array(z.object({ lens: z.enum(["overall", "attack", "defence"]).nullable(), text: z.string().max(300) }))
    .default([]),
}) satisfies z.ZodType<GridMeta>;

export const GridResponseSchema = z.object({
  success: z.boolean(),
  data: FixtureGridSchema.nullish(),
  error: z.string().nullish(),
  meta: GridMetaSchema.nullish(),
});
