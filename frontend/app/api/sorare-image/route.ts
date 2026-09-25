import type { NextRequest } from "next/server";

// A same-origin fallback for Sorare card art. Card images are hot-linked directly in the browser
// (see components/play/SorareImage.tsx); this route is only used when that direct load fails — e.g. a
// viewing environment that can't reach assets.sorare.com. The app server fetches the picture and streams
// it back from the app's own origin, so it always renders. Locked to Sorare's two asset hosts (no SSRF).

export const runtime = "nodejs";

const ALLOWED = ["https://assets.sorare.com/", "https://frontend-assets.sorare.com/"];

export async function GET(request: NextRequest) {
  const target = request.nextUrl.searchParams.get("u");
  if (!target || !ALLOWED.some((origin) => target.startsWith(origin))) {
    return new Response("Only Sorare asset URLs are allowed.", { status: 400 });
  }
  let upstream: Response;
  try {
    upstream = await fetch(target, { headers: { referer: "" }, cache: "force-cache" });
  } catch {
    return new Response("Upstream fetch failed.", { status: 502 });
  }
  const type = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || !type.startsWith("image/")) {
    return new Response("Not an image.", { status: 502 });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": type,
      "cache-control": "public, max-age=86400, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
