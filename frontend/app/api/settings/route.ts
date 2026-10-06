import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { database } from "../../../lib/db";
import { dispatchRefresh } from "../../../lib/github";
import { isSameOriginRequest } from "../../../lib/refresh";

// The owner's choices the plans follow (read model `sorare_settings`, read by the Sorare job): today the essence order. Plans are made
// by the job, so saving starts a refresh; the page says the new order shows once it has run. Same-origin only, like /api/refresh, and
// the whole site sits behind Vercel's login.
export const dynamic = "force-dynamic";

const KIND = /^[a-z0-9_]{1,24}$/;
const SettingsBody = z.object({
  essenceOrder: z
    .array(z.string().regex(KIND))
    .min(1)
    .max(8)
    .refine((kinds) => new Set(kinds).size === kinds.length, "Each essence once."),
});

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.headers)) return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
  const parsed = SettingsBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: "That order can't be saved." }, { status: 400 });
  const sql = database();
  if (!sql) return NextResponse.json({ success: false, error: "No database configured." }, { status: 503 });
  await sql`
    INSERT INTO read_models (key, payload, updated_at)
    VALUES ('sorare_settings', ${JSON.stringify(parsed.data)}::json, now())
    ON CONFLICT (key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at`;
  const token = process.env.GITHUB_TOKEN;
  const refreshing = token ? await dispatchRefresh(token).catch(() => false) : false;
  return NextResponse.json({ success: true, data: { ...parsed.data, refreshing } }, { headers: { "Cache-Control": "no-store" } });
}
