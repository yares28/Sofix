import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { database } from "../../../../lib/db";
import { SYSTEM_TAG } from "../../../../lib/system";

// The Chrome extension says it is alive and which Sorare account is signed in (extension/background.js).
// It calls only when something changed or every 6 hours, because each write wakes Neon. It never sends
// Sorare credentials: only the version and the account's public nickname.
export const dynamic = "force-dynamic";

const CheckIn = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  sorare_user: z.string().trim().min(1).max(40).nullable(),
});

function authorised(request: NextRequest): boolean {
  const expected = process.env.EXTENSION_TOKEN ?? "";
  if (expected.length < 32) return false;
  const [scheme, supplied] = (request.headers.get("authorization") ?? "").split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  const parsed = CheckIn.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Bad check-in." }, { status: 400 });
  const sql = database();
  if (!sql) return NextResponse.json({ ok: false, error: "No database configured." }, { status: 503 });

  const payload = { ...parsed.data, seen_at: new Date().toISOString() };
  await sql`
    INSERT INTO read_models (key, payload, updated_at)
    VALUES ('extension', ${JSON.stringify(payload)}::json, now())
    ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at`;
  revalidateTag(SYSTEM_TAG);
  return NextResponse.json({ ok: true, seen_at: payload.seen_at }, { headers: { "Cache-Control": "no-store" } });
}
