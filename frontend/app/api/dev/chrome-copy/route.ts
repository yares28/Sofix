import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isSameOriginRequest } from "../../../../lib/refresh";

export const dynamic = "force-dynamic";

/** Arcade reads saved by the Chrome with the extension, for other browsers on the dev server (lib/chromeCopy.ts). Git-ignored. */
const DIR = path.resolve(".chrome-copy");
const Name = z.string().regex(/^[\w:.-]{1,160}$/);
const MAX_BYTES = 30_000_000;
const fileOf = (name: string) => path.join(DIR, `${name.replace(/[^\w.-]/g, "_")}.json`);
/** Only the real-data dev server (`npm run dev` sets SOFIX_BLOCKS_DIR); the browser tests blank it, so they never see your board. */
const off = () => process.env.NODE_ENV !== "development" || !process.env.SOFIX_BLOCKS_DIR;

export async function GET(request: NextRequest) {
  const name = Name.safeParse(request.nextUrl.searchParams.get("name"));
  if (off() || !name.success) return NextResponse.json({ error: "Not found." }, { status: 404 });
  try {
    return new NextResponse(await readFile(fileOf(name.data), "utf8"), { headers: { "content-type": "application/json", "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "No copy yet." }, { status: 404 });
  }
}

export async function PUT(request: NextRequest) {
  const name = Name.safeParse(request.nextUrl.searchParams.get("name"));
  if (off() || !name.success) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!isSameOriginRequest(request.headers)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const body = await request.text();
  if (body.length > MAX_BYTES) return NextResponse.json({ error: "Too large." }, { status: 413 });
  let value: unknown;
  try { value = JSON.parse(body); } catch { return NextResponse.json({ error: "Not JSON." }, { status: 400 }); }
  await mkdir(DIR, { recursive: true });
  await writeFile(fileOf(name.data), JSON.stringify({ at: Date.now(), value }));
  return NextResponse.json({ ok: true });
}
