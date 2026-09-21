import type { APIRequestContext, Page } from "@playwright/test";
import { openingColumn } from "../lib/grid";
import type { ApiResponse, FixtureGrid } from "../lib/types";
import { E2E_PORT, E2E_REVALIDATE_SECRET, MOCK_PORT } from "./constants";
import recorded from "./fixtures/grid-response.json";

export const MOCK = `http://127.0.0.1:${MOCK_PORT}`;
export const APP = `http://127.0.0.1:${E2E_PORT}`;
export const grid = (recorded as ApiResponse<FixtureGrid>).data!;
export const openingMatchday = grid.matchdays[openingColumn(grid)]!.number;

/** Reset the mock API and make the app drop its cached grid (the route the refresh job calls in production). */
export async function resetBackend(request: APIRequestContext, mode: "ok" | "malformed" = "ok") {
  await request.post(`${MOCK}/__test/reset`);
  if (mode === "malformed") await request.post(`${MOCK}/__test/mode?mode=malformed`);
  await request.post(`${APP}/api/revalidate`, { headers: { authorization: `Bearer ${E2E_REVALIDATE_SECRET}` } });
}

/** Crest images come from football-data.org: block them so tests never touch the network (badges show instead). */
export async function offline(page: Page) {
  await page.route("https://crests.football-data.org/**", (route) => route.abort());
}

export const teamRows = (page: Page) => page.locator("tbody tr:not(.pin-divider)");
