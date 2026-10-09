import { z } from "zod";

export const DATASETS = ["games", "odds", "forecasts", "absences", "weeks"] as const;
export const DATASET_NAME = { games: "Player games", odds: "Match odds", forecasts: "Match forecasts", absences: "Absence spells", weeks: "Your weeks" };
const count = z.number().int().nonnegative();
const moment = z.string().refine((value) => /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value) && Number.isFinite(Date.parse(value)));
const dataset = z.object({
  id: z.enum(DATASETS), count, newest: moment.nullable(), lastRead: moment.nullable(),
  players: count.optional(), ongoing: count.optional(), source: z.string().max(160).nullable().optional(),
  warnings: z.array(z.string().max(300)),
});
const health = z.object({ version: z.literal(1), generatedAt: moment,
  datasets: z.array(dataset).length(5).refine((rows) => new Set(rows.map((r) => r.id)).size === 5),
});
export type DatasetHealth = z.infer<typeof dataset>;
export type DataHealth = z.infer<typeof health>;
export function readHealth(value: unknown): DataHealth | null {
  const parsed = health.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function coverage(row: DatasetHealth): string {
  const n = row.count.toLocaleString("en-GB");
  switch (row.id) {
    case "games": return `${n} game rows${row.players !== undefined ? ` · ${row.players.toLocaleString("en-GB")} players` : ""}`;
    case "odds": return `${n} price readings${row.source ? ` · ${row.source}` : ""}`;
    case "forecasts": return `${n} matches`;
    case "absences": return `${n} spells${row.ongoing !== undefined ? ` · ${row.ongoing} without a recorded return` : ""}`;
    case "weeks": return `${n} saved weeks`;
  }
}

export function latestCoverage(row: DatasetHealth): string {
  if (!row.newest) return row.count ? "Latest date not recorded" : "Nothing saved yet";
  const label = { games: "Latest past game", odds: "Latest priced match", forecasts: "Latest match", absences: "Latest report", weeks: "Latest week ended" }[row.id];
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", day: "numeric", month: "short", year: "numeric" }).format(new Date(row.newest));
  return `${label} ${date}`;
}
