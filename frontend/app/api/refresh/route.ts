import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { GRID_TAG, isSameOriginRequest } from "../../../lib/refresh";
import type { ApiResponse, RefreshStatus } from "../../../lib/types";

// Proxies the owner-only refresh endpoints. REFRESH_TOKEN is read here, on the server, and never reaches the browser.
export const dynamic = "force-dynamic";

const API_BASE = process.env.API_BASE_URL ?? "http://127.0.0.1:8000";
const NO_STORE = { "Cache-Control": "no-store" };

// The last finished run the grid cache was revalidated for (one server process, one user).
let revalidatedRunId: number | null = null;

function envelope(status: number, error: string): NextResponse {
  const body: ApiResponse<RefreshStatus> = { success: false, data: null, error };
  return NextResponse.json(body, { status, headers: NO_STORE });
}

async function callApi(path: string, method: "GET" | "POST", request: NextRequest) {
  if (!isSameOriginRequest(request.headers)) return { response: envelope(403, "Forbidden.") };
  const token = process.env.REFRESH_TOKEN;
  if (!token) return { response: envelope(503, "Refresh is not configured.") };
  try {
    const upstream = await fetch(`${API_BASE}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const body = (await upstream.json()) as ApiResponse<RefreshStatus>;
    return { status: upstream.status, body };
  } catch {
    return { response: envelope(503, "The API is not reachable.") };
  }
}

export async function POST(request: NextRequest) {
  const result = await callApi("/api/admin/refresh", "POST", request);
  if (result.response) return result.response;
  return NextResponse.json(result.body, { status: result.status, headers: NO_STORE });
}

export async function GET(request: NextRequest) {
  const result = await callApi("/api/admin/refresh/latest", "GET", request);
  if (result.response) return result.response;
  const run = result.body.data?.run;
  // Any finished run may have written data (steps are isolated), so refresh the cached grid once per run.
  if (result.status === 200 && run && run.status !== "running" && run.id !== revalidatedRunId) {
    revalidateTag(GRID_TAG);
    revalidatedRunId = run.id;
  }
  return NextResponse.json(result.body, { status: result.status, headers: NO_STORE });
}
