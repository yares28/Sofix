// API types, generated from the backend's OpenAPI document (lib/openapi.json → lib/api.gen.ts).
// Don't edit shapes here: change backend/app/schemas.py, then
//   backend: python -m app.openapi_export     frontend: npm run gen:types
import type { components } from "./api.gen";

type Schemas = components["schemas"];

export type FixtureGrid = Schemas["FixtureGrid"];
export type GridMeta = Schemas["GridMeta"];
export type GridTeam = Schemas["GridTeam"];
export type GridCell = Schemas["GridCell"];
export type GridMatchday = Schemas["GridMatchday"];
export type CellPrediction = Schemas["CellPrediction"];
export type CellResult = Schemas["CellResult"];
export type CellWeather = Schemas["CellWeather"];
export type Probabilities = Schemas["Prob"];
export type LensScale = Schemas["LensScale"];
export type RefreshRun = Schemas["RefreshRunOut"];
export type RefreshStatus = Schemas["RefreshStatus"];

export type Venue = GridCell["venue"];
export type FixtureStatus = GridCell["status"];
export type DifficultyLabel = CellPrediction["label"];
export type Bucket = CellPrediction["bucket"]; // 1 = easiest
export type Lens = keyof Schemas["LensScales"];
export type RunStatus = RefreshRun["status"];

/** The API's response envelope (generated per payload type as ApiResponse_X_; one generic here). */
export interface ApiResponse<T> {
  success: boolean;
  data?: T | null;
  error?: string | null;
  meta?: GridMeta | null;
}
