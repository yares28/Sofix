import { NextResponse, type NextRequest } from "next/server";
import { authorised } from "../../../../lib/extAuth";
import { OverlayRequest, overlayNumbers } from "../../../../lib/overlay";
import { loadSorare } from "../../../../lib/playData";

// The numbers the Chrome extension draws on sorare.com's cards (extension/overlay.js). Which cards a page shows
// is only ever sent here, to your own app; nothing goes to a third party. It reads the one read model the app
// already caches, so a call costs no database query of its own. Every answer is private to the extension.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401, headers: NO_STORE });
  const parsed = OverlayRequest.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400, headers: NO_STORE });

  const sorare = await loadSorare();
  if (!sorare) return NextResponse.json({ ok: false, error: "Sorare has not been synced yet." }, { status: 503, headers: NO_STORE });

  return NextResponse.json({ ok: true, ...overlayNumbers(sorare, parsed.data, new Date()) }, { headers: NO_STORE });
}
