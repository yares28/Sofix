import type { APIRequestContext, Page } from "@playwright/test";
import { openingColumn } from "../lib/grid";
import type { Sorare } from "../lib/play";
import type { ApiResponse, FixtureGrid } from "../lib/types";
import { E2E_PORT, E2E_REVALIDATE_SECRET, MOCK_PORT } from "./constants";
import recordedGrid from "./fixtures/grid-response.json";
import recordedSorare from "./fixtures/sorare-response.json";

export const MOCK = `http://127.0.0.1:${MOCK_PORT}`;
export const APP = `http://127.0.0.1:${E2E_PORT}`;
/** The grid the mock serves. Its dates are moved forward there with the Sorare week's, so read dates from `servedGrid`. */
export const grid = (recordedGrid as ApiResponse<FixtureGrid>).data!;
export const openingMatchday = grid.matchdays[openingColumn(grid)]!.number;

/** The grid as the mock serves it, dates moved: what the app sees. */
export async function servedGrid(request: APIRequestContext): Promise<FixtureGrid> {
  return ((await (await request.get(`${MOCK}/api/fixture-grid`)).json()) as ApiResponse<FixtureGrid>).data!;
}
/** The Sorare gameweek the mock serves. Its dates are moved forward there, so only read what doesn't move. */
export const sorare = (recordedSorare as unknown as ApiResponse<Sorare>).data!;

/** Reset the mock API and make the app drop its cached data (the route the refresh job calls in production). */
export async function resetBackend(
  request: APIRequestContext,
  mode: "ok" | "malformed" | "no-sorare" | "no-news-laliga" | "no-news-national" | "expected" | "no-audit" | "audit-enough" | "missions-stale" = "ok",
) {
  await request.post(`${MOCK}/__test/reset`);
  if (mode === "malformed") await request.post(`${MOCK}/__test/mode?mode=malformed`);
  if (mode === "no-sorare") await request.post(`${MOCK}/__test/mode?sorare=missing`);
  // The Audit page that was never written, and the one whose record has enough settled games to give figures.
  if (mode === "no-audit") await request.post(`${MOCK}/__test/mode?audit=missing`);
  if (mode === "audit-enough") await request.post(`${MOCK}/__test/mode?audit=enough`);
  // Missions last loaded two days ago.
  if (mode === "missions-stale") await request.post(`${MOCK}/__test/mode?missions=stale`);
  // The planned week with nothing from Futbol Fantasy about it: one of club games, one of national teams only.
  if (mode === "no-news-laliga") await request.post(`${MOCK}/__test/mode?news=laliga`);
  if (mode === "no-news-national") await request.post(`${MOCK}/__test/mode?news=national`);
  // The planned week with one lineup for a competition Sorare has not listed yet.
  if (mode === "expected") await request.post(`${MOCK}/__test/mode?news=expected`);
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

/**
 * The text the page draws smaller than `min` px (the readable-size rule of the 1 Oct review: 11 px on a desktop, 10 px on a phone),
 * as "text (size px)". The same rule as `npm run design`: SVG text is left out (its size is in the drawing's own units) and so is
 * text only a screen reader gets.
 */
export function smallText(page: Page, min: number): Promise<string[]> {
  return page.evaluate((limit) => {
    const found: string[] = [];
    for (const el of document.querySelectorAll("body *")) {
      if (el instanceof SVGElement || el.closest("svg, .visually-hidden, [hidden], script, style")) continue;
      const text = [...el.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent!.trim()).join(" ").trim();
      if (!text) continue;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (rect.width < 2 || rect.height < 2 || style.visibility === "hidden" || style.display === "none") continue;
      const size = parseFloat(style.fontSize);
      if (size < limit) found.push(`${text.slice(0, 18)} (${size}px) in ${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""}`);
    }
    return found;
  }, min);
}
