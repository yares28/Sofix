import type { APIRequestContext, Page } from "@playwright/test";
import { openingColumn } from "../lib/grid";
import type { Sorare } from "../lib/play";
import type { ApiResponse, FixtureGrid } from "../lib/types";
import { E2E_PORT, E2E_REVALIDATE_SECRET, MOCK_PORT } from "./constants";
import recordedGrid from "./fixtures/grid-response.json";
import recordedSorare from "./fixtures/sorare-response.json";

export const MOCK = `http://127.0.0.1:${MOCK_PORT}`;
export const APP = `http://127.0.0.1:${E2E_PORT}`;
export const grid = (recordedGrid as ApiResponse<FixtureGrid>).data!;
export const openingMatchday = grid.matchdays[openingColumn(grid)]!.number;
/** The Sorare gameweek the mock serves. Its dates are moved forward there, so only read what doesn't move. */
export const sorare = (recordedSorare as unknown as ApiResponse<Sorare>).data!;

/** Reset the mock API and make the app drop its cached data (the route the refresh job calls in production). */
export async function resetBackend(request: APIRequestContext, mode: "ok" | "malformed" | "no-sorare" = "ok") {
  await request.post(`${MOCK}/__test/reset`);
  if (mode === "malformed") await request.post(`${MOCK}/__test/mode?mode=malformed`);
  if (mode === "no-sorare") await request.post(`${MOCK}/__test/mode?sorare=missing`);
  await request.post(`${APP}/api/revalidate`, { headers: { authorization: `Bearer ${E2E_REVALIDATE_SECRET}` } });
}

/**
 * Pictures are hot-linked from football-data.org (crests) and Sorare (card art, faces): block both so tests
 * never touch the network. The board shows colour badges instead, and Sorare's images stay empty.
 */
export async function offline(page: Page) {
  await page.route("https://crests.football-data.org/**", (route) => route.abort());
  await page.route("https://assets.sorare.com/**", (route) => route.abort());
}

export const teamRows = (page: Page) => page.locator("tbody tr:not(.pin-divider)");
