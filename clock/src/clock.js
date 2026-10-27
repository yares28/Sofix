// The outside clock (plans/roadmap.md 9.11). GitHub starts a run asked for through its API at once but its own timer hours late,
// so every minute this starts each workflow whose time in timetable.json came in the last WINDOW minutes, unless a run of it was
// created since that time (the clock's own, the Refresh button, a push). GitHub still runs the jobs; this only keeps time.

const WINDOW = 10; // minutes: a missed Cloudflare tick catches up, and the run list has long since shown the clock's own start
const API = "https://api.github.com";

const field = (spec, value) =>
  spec.split(",").some((part) => {
    const [range, step = "1"] = part.split("/");
    const [lo, hi] = range === "*" ? [0, Infinity] : range.split("-").map(Number);
    return value >= lo && value <= (hi ?? (part.includes("/") ? Infinity : lo)) && (value - lo) % Number(step) === 0;
  });

/** Whether a five-field cron (UTC) names this minute. ponytail: day-of-month and weekday are both required, not either; no timetable entry sets both. */
export function matches(cron, date) {
  const [min, hour, dom, mon, dow] = cron.trim().split(/\s+/);
  return (
    field(min, date.getUTCMinutes()) &&
    field(hour, date.getUTCHours()) &&
    field(dom, date.getUTCDate()) &&
    field(mon, date.getUTCMonth() + 1) &&
    field(dow, date.getUTCDay())
  );
}

/** The jobs with a time in the last WINDOW minutes, each with its latest such time. */
export function due(jobs, now) {
  const minute = Math.floor(now.getTime() / 60_000) * 60_000;
  return jobs.flatMap((job) => {
    for (let back = 0; back < WINDOW; back++) {
      const slot = new Date(minute - back * 60_000);
      if (matches(job.cron, slot)) return [{ job, slot }];
    }
    return [];
  });
}

const hhmm = (date) => date.toISOString().slice(11, 16);

/** One tick: start what is due and not started yet. Returns one line per start or failure. */
export async function tick(timetable, env, now, fetch = globalThis.fetch) {
  const hits = due(timetable.jobs, now);
  if (!hits.length) return [];
  if (!env.GITHUB_TOKEN) return ["GITHUB_TOKEN is not set: nothing started"];
  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${env.GITHUB_TOKEN}`,
    "user-agent": "Sofix-clock/1.0 (personal; starts its own workflows)",
    "x-github-api-version": "2022-11-28",
  };
  const base = `${API}/repos/${timetable.repo}/actions/workflows`;
  const log = [];
  for (const { job, slot } of hits) {
    const label = `${job.workflow} for ${hhmm(slot)} UTC`;
    try {
      const since = encodeURIComponent(`>=${slot.toISOString().replace(".000", "")}`);
      const list = await fetch(`${base}/${job.workflow}/runs?created=${since}&per_page=1`, { headers });
      if (!list.ok) throw new Error(`GitHub answered ${list.status}`);
      if ((await list.json()).total_count > 0) continue;
      const body = JSON.stringify({ ref: timetable.ref, ...(job.inputs && { inputs: job.inputs }) });
      const start = await fetch(`${base}/${job.workflow}/dispatches`, { method: "POST", headers, body });
      if (!start.ok) throw new Error(`GitHub answered ${start.status}`);
      log.push(`started ${label}`);
    } catch (error) {
      log.push(`${label} failed: ${error.message}`);
    }
  }
  return log;
}
