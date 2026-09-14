// Mirrors backend/app/schemas.py (fixture grid section).

export type Venue = "H" | "A";
export type FixtureStatus = "scheduled" | "live" | "finished" | "postponed";
export type DifficultyLabel = "Easy" | "Easy-ish" | "Normal" | "Hard-ish" | "Hard";
export type Lens = "overall" | "attack" | "defence";

export interface Probabilities {
  win: number;
  draw: number;
  loss: number;
}

export type Bucket = 1 | 2 | 3 | 4 | 5; // 1 = easiest

export interface CellPrediction {
  difficulty: number;
  label: DifficultyLabel;
  bucket: Bucket; // derived from label on the backend, so colour and label always agree
  expected_points: number;
  probabilities: Probabilities;
  clean_sheet: number | null;
  xg_for: number | null;
  xg_against: number | null;
}

export interface CellResult {
  goals_for: number;
  goals_against: number;
  outcome: "W" | "D" | "L";
}

export interface CellWeather {
  temperature_c: number | null;
  precipitation_mm: number | null;
  wind_kmh: number | null;
}

export interface GridCell {
  fixture_id: number;
  opponent_code: string;
  venue: Venue;
  kickoff_utc: string;
  date_confirmed: boolean;
  rescheduled: boolean;
  status: FixtureStatus;
  result: CellResult | null;
  prediction: CellPrediction | null;
  weather: CellWeather | null;
}

export interface GridTeam {
  code: string;
  name: string;
  color: string;
  cells: GridCell[][]; // one list per matchday: empty = no game, two = rescheduled double
}

export interface GridMatchday {
  number: number;
  date_from: string;
  date_to: string;
  finished: boolean;
}

/**
 * Four cut points splitting a lens into buckets 1–5.
 * higher_is_easier=false: bucket = 1 + cuts the value exceeds; true: 1 + cuts the value is below.
 */
export interface LensScale {
  cuts: number[]; // always 4 values
  higher_is_easier: boolean;
}

export interface FixtureGrid {
  season: string;
  current_matchday: number | null;
  model_version: string | null;
  lens_scales: Record<Lens, LensScale>;
  matchdays: GridMatchday[];
  teams: GridTeam[];
}

export interface GridMeta {
  last_synced_at: string | null;
  last_predicted_at: string | null;
}

// Mirrors backend/app/schemas.py (refresh section).
export type RunStatus = "running" | "succeeded" | "failed" | "abandoned";

export interface RefreshRun {
  id: number;
  trigger: string;
  status: RunStatus;
  step: string | null;
  started_at: string;
  finished_at: string | null;
  error: string | null;
  steps: Record<string, "succeeded" | "failed">;
}

export interface RefreshStatus {
  run: RefreshRun | null;
  retry_after: number; // seconds until a new refresh may start
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T | null;
  error?: string | null;
  meta?: GridMeta | null;
}
