import type { APIRequestContext, Page } from "@playwright/test";
import { openingColumn } from "../lib/grid";
import type { ApiResponse, FixtureGrid } from "../lib/types";
import { E2E_PORT, MOCK_PORT } from "./constants";
import recorded from "./fixtures/grid-response.json";

export const MOCK = `http://127.0.0.1:${MOCK_PORT}`;
export const APP = `http://127.0.0.1:${E2E_PORT}`;
export const grid = (recorded as ApiResponse<FixtureGrid>).data!;
export const openingMatchday = grid.matchdays[openingColumn(grid)]!.number;

/** Reset the mock API and make the app drop its cached grid (the refresh route revalidates on a new finished run). */
export async function resetBackend(request: APIRequestContext, mode: "ok" | "malformed" = "ok") {
  await request.post(`${MOCK}/__test/reset`);
  if (mode === "malformed") await request.post(`${MOCK}/__test/mode?mode=malformed`);
  await request.get(`${APP}/api/refresh`, { headers: { "x-fdr-refresh": "1", "sec-fetch-site": "same-origin" } });
}

/** Crest images come from football-data.org: block them so tests never touch the network (badges show instead). */
export async function offline(page: Page) {
  await page.route("https://crests.football-data.org/**", (route) => route.abort());
}

export const teamRows = (page: Page) => page.locator("tbody tr:not(.pin-divider)");
