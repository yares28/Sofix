import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { database } from "../../../lib/db";
import { dispatchRefresh, latestWorkflowRun, toRefreshStatus, type DbRun } from "../../../lib/github";
import { GRID_TAG, isSameOriginRequest } from "../../../lib/refresh";
import { SYSTEM_TAG } from "../../../lib/system";
import type { ApiResponse, RefreshStatus } from "../../../lib/types";

// Starts the GitHub Actions refresh and reports on it. GITHUB_TOKEN (a fine-grained token limited to this repo's
// Actions) is read here, on the server, and never reaches the browser. Without it the button is hidden.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

// The last finished workflow run the caches were revalidated for (the job also pings /api/revalidate itself).
let revalidatedRunId: number | null = null;

function reply(status: number, body: ApiResponse<RefreshStatus>): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

function failure(status: number, error: string): NextResponse {
  return reply(status, { success: false, data: null, error });
}

async function latestDbRun(): Promise<DbRun | null> {
  const sql = database();
  if (!sql) return null;
  const rows = (await sql`
    SELECT id, trigger, status, step, started_at, finished_at, error, details
    FROM refresh_runs ORDER BY id DESC LIMIT 1`) as (Omit<DbRun, "started_at" | "finished_at"> & {
    started_at: string | Date;
    finished_at: string | Date | null;
  })[];
  const row = rows[0];
  if (!row) return null;
  const iso = (value: string | Date | null) => (value instanceof Date ? value.toISOString() : value);
  return { ...row, started_at: iso(row.started_at) as string, finished_at: iso(row.finished_at) };
}

async function currentStatus(token: string) {
  const [workflow, db] = await Promise.all([latestWorkflowRun(token), latestDbRun()]);
  return { workflow, status: toRefreshStatus(workflow, db, Date.now()) };
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.headers)) return failure(403, "Forbidden.");
  const token = process.env.GITHUB_TOKEN;
  if (!token) return failure(503, "Refresh is not configured.");
  try {
    const { status } = await currentStatus(token);
    if (status.run?.status === "running") return reply(409, { success: false, data: status, error: "A refresh is already running." });
    if (status.retry_after > 0) return reply(429, { success: false, data: status, error: "Refreshed a moment ago." });
    if (!(await dispatchRefresh(token))) return failure(502, "GitHub did not start the refresh.");
    const now = new Date().toISOString();
    return reply(202, {
      success: true,
      data: {
        run: { id: 0, trigger: "button", status: "running", step: null, started_at: now, finished_at: null, error: null, steps: {} },
        retry_after: 600,
      },
      error: null,
    });
  } catch {
    return failure(503, "GitHub is not reachable.");
  }
}

export async function GET(request: NextRequest) {
  if (!isSameOriginRequest(request.headers)) return failure(403, "Forbidden.");
  const token = process.env.GITHUB_TOKEN;
  if (!token) return failure(503, "Refresh is not configured.");
  try {
    const { workflow, status } = await currentStatus(token);
    if (workflow && workflow.status === "completed" && workflow.id !== revalidatedRunId) {
      revalidateTag(GRID_TAG);
      revalidateTag(SYSTEM_TAG);
      revalidatedRunId = workflow.id;
    }
    return reply(200, { success: true, data: status, error: null });
  } catch {
    return failure(503, "GitHub is not reachable.");
  }
}
