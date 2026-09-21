import { describe, expect, it } from "vitest";
import { toRefreshStatus, type DbRun, type WorkflowRun } from "./github";

const NOW = Date.parse("2026-09-21T12:00:00Z");

const workflow = (status: string, conclusion: string | null, created = "2026-09-21T11:58:00Z"): WorkflowRun => ({
  id: 99,
  status,
  conclusion,
  created_at: created,
  updated_at: "2026-09-21T11:59:30Z",
});

const dbRun = (over: Partial<DbRun> = {}): DbRun => ({
  id: 14,
  trigger: "button",
  status: "running",
  step: "odds",
  started_at: "2026-09-21T11:58:40Z",
  finished_at: null,
  error: null,
  details: { sync: { status: "succeeded" } },
  ...over,
});

describe("toRefreshStatus", () => {
  it("is empty when nothing ever ran", () => {
    expect(toRefreshStatus(null, null, NOW)).toEqual({ run: null, retry_after: 0 });
  });

  it("shows a queued run as starting (no step yet)", () => {
    const status = toRefreshStatus(workflow("queued", null), dbRun({ started_at: "2026-09-20T15:16:00Z", status: "succeeded" }), NOW);
    expect(status.run).toMatchObject({ status: "running", step: null, id: 0 });
    expect(status.retry_after).toBe(480);
  });

  it("takes the step from the database row once the job has started", () => {
    const status = toRefreshStatus(workflow("in_progress", null), dbRun(), NOW);
    expect(status.run).toMatchObject({ id: 14, status: "running", step: "odds", steps: { sync: "succeeded" } });
  });

  it("reports a finished run with its steps", () => {
    const done = dbRun({ status: "succeeded", step: null, finished_at: "2026-09-21T11:59:10Z", details: { sync: { status: "succeeded" }, predict: { status: "succeeded" } } });
    const status = toRefreshStatus(workflow("completed", "success"), done, NOW);
    expect(status.run).toMatchObject({ status: "succeeded", steps: { sync: "succeeded", predict: "succeeded" } });
  });

  it("explains a failed GitHub run even without a database row", () => {
    const status = toRefreshStatus(workflow("completed", "failure"), null, NOW);
    expect(status.run).toMatchObject({ status: "failed", error: "GitHub run failure" });
  });

  it("ends the cooldown ten minutes after the last start", () => {
    const status = toRefreshStatus(workflow("completed", "success", "2026-09-21T11:40:00Z"), null, NOW);
    expect(status.retry_after).toBe(0);
  });
});
