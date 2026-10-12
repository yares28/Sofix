import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { database } from "../../../../lib/db";
import { authorised } from "../../../../lib/extAuth";
import { ChanceBatch, CHANCES_TAG, saveChances } from "../../../../lib/sorareChances";

export const dynamic = "force-dynamic";

/** Starting chances the extension read from Sorare's own page, kept so they outlive the tab (plans/sorare-start-chances.md). */
export async function POST(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  const batch = ChanceBatch.safeParse(await request.json().catch(() => null));
  if (!batch.success) return NextResponse.json({ ok: false, error: "Not a list of starting chances." }, { status: 400 });
  if (!database()) return NextResponse.json({ ok: false, error: "No database configured." }, { status: 503 });
  try {
    const games = await saveChances(batch.data.rows);
    revalidateTag(CHANCES_TAG);
    return NextResponse.json({ ok: true, games, players: batch.data.rows.length }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Starting chances could not be saved; retry." }, { status: 503 });
  }
}
