import { NextResponse, type NextRequest } from "next/server";
import { LogBatch } from "../../../../lib/arcadeLog";
import { saveLog } from "../../../../lib/arcadeLogStore";
import { database } from "../../../../lib/db";
import { isSameOriginRequest } from "../../../../lib/refresh";

export const dynamic = "force-dynamic";

/**
 * Your Arcade lineups and their results, kept so Sofix can check the chances it printed (plans/arcade-trust.md step 8). The Arcade page
 * sends a read only when it changed; never polled.
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.headers)) return NextResponse.json({ ok: false, error: "Forbidden." }, { status: 403 });
  const batch = LogBatch.safeParse(await request.json().catch(() => null));
  if (!batch.success) return NextResponse.json({ ok: false, error: "Not an Arcade lineup read." }, { status: 400 });
  if (!database()) return NextResponse.json({ ok: false, error: "No database configured." }, { status: 503 });
  try {
    const lineups = await saveLog(batch.data);
    return NextResponse.json({ ok: true, lineups }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "The lineups could not be saved; they are sent again with the next read." }, { status: 503 });
  }
}
