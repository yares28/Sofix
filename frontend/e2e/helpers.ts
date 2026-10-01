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
export async function resetBackend(request: APIRequestContext, mode: "ok" | "malformed" | "no-sorare" | "no-news-laliga" | "no-news-national" = "ok") {
  await request.post(`${MOCK}/__test/reset`);
  if (mode === "malformed") await request.post(`${MOCK}/__test/mode?mode=malformed`);
  if (mode === "no-sorare") await request.post(`${MOCK}/__test/mode?sorare=missing`);
  // The planned week with nothing from Futbol Fantasy about it: one of club games, one of national teams only.
  if (mode === "no-news-laliga") await request.post(`${MOCK}/__test/mode?news=laliga`);
  if (mode === "no-news-national") await request.post(`${MOCK}/__test/mode?news=national`);
  await request.post(`${APP}/api/revalidate`, { headers: { authorization: `Bearer ${E2E_REVALIDATE_SECRET}` } });
}

/**
 * Pictures are hot-linked from football-data.org (crests), Sorare (card art, faces) and Futbol Fantasy: block them so tests
 * never touch the network. The board shows colour badges instead, and Sorare's images stay empty.
 */
export async function offline(page: Page) {
  await page.route("https://crests.football-data.org/**", (route) => route.abort());
  await page.route("https://assets.sorare.com/**", (route) => route.abort());
  // Futbol Fantasy's crests and player photos, on the Lineups page.
  await page.route("https://static.futbolfantasy.com/**", (route) => route.abort());
  await page.route("https://media.futbolfantasy.com/**", (route) => route.abort());
}

export const teamRows = (page: Page) => page.locator("tbody tr:not(.pin-divider)");
