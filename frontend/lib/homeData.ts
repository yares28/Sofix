import { unstable_cache } from "next/cache";
import { loadGrid } from "./api";
import type { Chances } from "./home";
import { GRID_TAG } from "./refresh";
import { predictedTable } from "./table";

/**
 * The title and relegation chances behind the home's Table tile: the predicted table's 5,000 simulated seasons
 * (~50 ms) run once per published grid, not per visit. Cached and revalidated with the grid (tag fixture-grid).
 * Failures throw, so they are never cached.
 */
const cachedChances = unstable_cache(
  async (): Promise<Chances[]> => {
    const { grid } = await loadGrid();
    if (!grid) throw new Error("no grid");
    return predictedTable(grid).map((row) => ({ code: row.team.code, title: row.title, relegation: row.relegation }));
  },
  ["home-chances-v1"],
  { tags: [GRID_TAG], revalidate: 3600 },
);

export async function loadChances(): Promise<Chances[] | null> {
  try {
    return await cachedChances();
  } catch {
    return null; // the tile then shows the standings without the chances
  }
}
