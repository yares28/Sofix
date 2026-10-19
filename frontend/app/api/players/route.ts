import { NextResponse } from "next/server";
import { loadSorare } from "../../../lib/playData";
import { searchIndex } from "../../../lib/playerSearch";

/** The top bar's player search: names and slugs from the cached Sorare read, fetched once when the search first opens. */
export async function GET() {
  return NextResponse.json(searchIndex(await loadSorare()), { headers: { "cache-control": "public, max-age=3600" } });
}
