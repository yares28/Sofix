import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { loadSorare } from "../../../lib/playData";
import { chartWindow, WINDOWS } from "../../../lib/statCharts";
import { loadStatCharts } from "../../../lib/statChartsData";

const Window = z.enum(WINDOWS.map((w) => w.key) as [string, ...string[]]);

/**
 * The Stats page's charts, one window at a time (this season, L5, L10 or L40), fetched by the page once per window it shows.
 * The model changes once a day, so a browser and Vercel's edge keep an answer for an hour and no render pays for it.
 */
export async function GET(request: NextRequest) {
  const window = Window.safeParse(request.nextUrl.searchParams.get("w") ?? "cur");
  if (!window.success) return NextResponse.json({ error: "Unknown window." }, { status: 400 });
  const [model, sorare] = await Promise.all([loadStatCharts(), loadSorare({ market: false })]);
  return NextResponse.json(chartWindow(model, window.data as (typeof WINDOWS)[number]["key"], sorare?.collection ?? []), {
    headers: { "cache-control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
