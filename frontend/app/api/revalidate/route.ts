import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { SORARE_TAG } from "../../../lib/play";
import { GRID_TAG } from "../../../lib/refresh";
import { SYSTEM_TAG } from "../../../lib/system";

// Called by the refresh job when it has published new data (backend/app/services/publish.py).
// The job reaches the protected deployment with the Vercel bypass header and proves itself with REVALIDATE_SECRET.
export const dynamic = "force-dynamic";

const MIN_SECRET_LENGTH = 32;

function sameSecret(supplied: string, expected: string): boolean {
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const expected = process.env.REVALIDATE_SECRET ?? "";
  if (expected.length < MIN_SECRET_LENGTH) {
    return NextResponse.json({ revalidated: false, error: "Not configured." }, { status: 503 });
  }
  const [scheme, supplied] = (request.headers.get("authorization") ?? "").split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !supplied || !sameSecret(supplied, expected)) {
    return NextResponse.json({ revalidated: false, error: "Not authorised." }, { status: 401 });
  }
  revalidateTag(GRID_TAG);
  revalidateTag(SYSTEM_TAG);
  revalidateTag(SORARE_TAG);
  return NextResponse.json({ revalidated: true }, { headers: { "Cache-Control": "no-store" } });
}
