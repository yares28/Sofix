import type { RefreshRun, RefreshStatus } from "./types";

/**
 * The Refresh button starts the same GitHub Actions workflow the schedule runs (refresh.yml), so production needs
 * no Python server. GitHub says whether the job is queued, running or done; Neon's refresh_runs row (written by the
 * job itself) adds the step it is on and which steps failed.
 */
export const COOLDOWN_SECONDS = 10 * 60;
export const REFRESH_WORKFLOW = "refresh.yml";

export type WorkflowRun = {
  id: number;
  status: string; // queued | in_progress | completed | waiting | requested | pending
  conclusion: string | null; // success | failure | cancelled | timed_out | skipped | …
  created_at: string;
  updated_at: string;
};

export type DbRun = {
  id: number;
  trigger: string;
  status: RefreshRun["status"];
  step: string | null;
  started_at: string;
  finished_at: string | null;
  error: string | null;
  details: Record<string, { status?: string }> | null;
};

const ACTIVE = new Set(["queued", "in_progress", "waiting", "requested", "pending"]);

export function stepsOf(details: DbRun["details"]): RefreshRun["steps"] {
  const steps: RefreshRun["steps"] = {};
  for (const [name, value] of Object.entries(details ?? {})) {
    if (value?.status === "succeeded" || value?.status === "failed") steps[name] = value.status;
  }
  return steps;
}

/** What the button needs, from GitHub's latest workflow run and Neon's latest refresh row. */
export function toRefreshStatus(workflow: WorkflowRun | null, db: DbRun | null, now: number): RefreshStatus {
  const lastStart = Math.max(
    workflow ? Date.parse(workflow.created_at) : Number.NEGATIVE_INFINITY,
    db ? Date.parse(db.started_at) : Number.NEGATIVE_INFINITY,
  );
  const retry = Number.isFinite(lastStart) ? Math.ceil(COOLDOWN_SECONDS - (now - lastStart) / 1000) : 0;
  const retryAfter = Math.max(0, retry);
  if (!workflow && !db) return { run: null, retry_after: 0 };

  // The database row belongs to this workflow run when it started after GitHub queued the run.
  const dbMatches = Boolean(workflow && db && Date.parse(db.started_at) >= Date.parse(workflow.created_at) - 60_000);

  if (workflow && ACTIVE.has(workflow.status)) {
    return {
      run: {
        id: dbMatches && db ? db.id : 0,
        trigger: dbMatches && db ? db.trigger : "button",
        status: "running",
        step: dbMatches && db?.status === "running" ? db.step : null,
        started_at: dbMatches && db ? db.started_at : workflow.created_at,
        finished_at: null,
        error: null,
        steps: dbMatches && db ? stepsOf(db.details) : {},
      },
      retry_after: retryAfter,
    };
  }

  if (workflow) {
    const ok = workflow.conclusion === "success";
    return {
      run: {
        id: dbMatches && db ? db.id : 0,
        trigger: dbMatches && db ? db.trigger : "button",
        status: ok ? "succeeded" : "failed",
        step: null,
        started_at: dbMatches && db ? db.started_at : workflow.created_at,
        finished_at: dbMatches && db ? db.finished_at : workflow.updated_at,
        error: ok ? null : (dbMatches && db?.error) || `GitHub run ${workflow.conclusion ?? "stopped"}`,
        steps: dbMatches && db ? stepsOf(db.details) : {},
      },
      retry_after: retryAfter,
    };
  }

  // No workflow visible (no token scope, or never run on GitHub): fall back to the database row alone.
  const run = db!;
  return {
    run: {
      id: run.id,
      trigger: run.trigger,
      status: run.status,
      step: run.step,
      started_at: run.started_at,
      finished_at: run.finished_at,
      error: run.error,
      steps: stepsOf(run.details),
    },
    retry_after: retryAfter,
  };
}

function repo(): string {
  return process.env.GITHUB_REPO ?? "yares28/Sofix";
}

/** GitHub's REST API; end-to-end tests point it at their mock server (never set it in production). */
function apiBase(): string {
  return process.env.GITHUB_API_URL ?? "https://api.github.com";
}

function headers(token: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export async function latestWorkflowRun(token: string): Promise<WorkflowRun | null> {
  const url = `${apiBase()}/repos/${repo()}/actions/workflows/${REFRESH_WORKFLOW}/runs?per_page=1`;
  const response = await fetch(url, { headers: headers(token), cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
  const body = (await response.json()) as { workflow_runs?: WorkflowRun[] };
  return body.workflow_runs?.[0] ?? null;
}

export async function dispatchRefresh(token: string): Promise<boolean> {
  const url = `${apiBase()}/repos/${repo()}/actions/workflows/${REFRESH_WORKFLOW}/dispatches`;
  const response = await fetch(url, {
    method: "POST",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main", inputs: { trigger: "button" } }),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  return response.status === 204;
}
