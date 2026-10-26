# Plan · Neon write-mostly, for good (owner, 26 Oct 2026)

**What you asked.** An actual solution to Neon's monthly limit instead of another band-aid: measure every reader of Neon for a day,
then make Neon write-mostly with a byte budget per job, and research a free host without a transfer cap as the fallback. Before the
score engine's E1.

**Why the earlier fixes did not hold.** 14, 20 and 24 Oct each found one large reader and fixed it
([neon-egress.md](neon-egress.md), [neon-quota-recurrence.md](neon-quota-recurrence.md)). Each fix worked, but nothing stops the
next feature from adding a reader. On 26 Oct the four free projects had sent 6.7 + 5.8 + 4.7 + 5.2 = 22.4 GB this month, about
860 MB a day (`check.mjs --live`).

## 1 · Measure (built 26 Oct)

GitHub keeps a job's log behind a sign-in and Vercel keeps its logs an hour, so each reader writes down its own reads:

- **Every Python process** that talks to Neon writes one `read_models` row when it ends:
  - key `neon_ledger:<day>:<run>-<attempt>-<pid>`, or `local-<pid>` outside GitHub;
  - the bytes it was sent, its workflow, job and command, and its twelve biggest readers;
  - a reader is a table, or for a page block its kind: `read_models:audit_players`.
  - Code: `app/services/neon_ledger.py`, hooked into `app/db.py`'s counting cursor.
- **Every web server** (Vercel and the dev server) writes the same row every ten minutes or every 1 MB read (`frontend/lib/neonLedger.ts`,
  `lib/db.ts`).
- **The rows' write time is 1970,** so a ledger row never decides which project is live. Rows older than 14 days are deleted by the next
  write. A write does not count toward the limit; reading a day back is a few kB.
- **The day's report:** `python -m app.services.neon_ledger --day 20261027` (by workflow and command, then by reader).
- **What the ledger cannot see:** bytes outside the counted cursors (the protocol's own overhead, `neon_switch`'s probes of each
  project). Neon's own per-project counter (`describe_project`, or `neon_status` from the refresh) over the same day gives the
  total, so the gap is measured too.

## 2 · Fix (after the day)

1. **Rank the readers** from the day's report, the biggest first, each with what it reads and why.
2. **Write-mostly.** Jobs read their inputs from GitHub's cache (as the player games already do) and pages read from Cloudflare R2
   (as page blocks already do). Neon is written each run and read only to rebuild a cache that is missing. Each large reader moves in its
   own change, with its test.
3. **A byte budget per job.** Each workflow's command gets a budget, the ledger's number for it after the fix plus room. A run over its
   budget logs it and writes a `neon_ledger` row marked over. A test holds each job's reads under its budget on the e2e/mock data, so a
   new feature that adds a reader fails before the push.
4. **Confirm:** a day's ledger after the fix, against this day's.

## 3 · The fallback: a free host without a transfer cap (researched 26 Oct)

Only a free plan that is free for good, keeps the data and has no monthly transfer limit. Checked on the vendors' own pricing pages:

| Host | Free plan | Transfer | Fit for Sofix |
|---|---|---|---|
| **Cloudflare R2** (already used for page blocks) | 10 GB stored, 1 M writes and 10 M reads a month | free, no charge for egress | **the first choice**: not a database, but every page block and every job input that is "a payload by key" can live there; the jobs already hold its write token and Vercel its read token |
| **Cloudflare D1** (SQLite) | 5 GB total, 5 M rows read and 100 k rows written a day; over a limit, queries fail until 00:00 UTC | no egress or bandwidth charges | counts rows, not bytes: a 1.5 MB block is one row. The day's 5 M rows bound a full-table job, so the jobs' normalized tables would need indexes on every filter |
| **Turso** (libSQL, SQLite) | 100 databases, 5 GB, 500 M rows read and 10 M written a month; over a limit, databases are blocked (no overage on Free) | not stated on the pricing page | the same row counting as D1, with a monthly budget instead of a daily one. The backend already runs on SQLite locally, which shortens a move |
| **Oracle Cloud Always Free** (a VM running Postgres) | 4 Arm cores, 24 GB memory, 200 GB disk; idle instances can be reclaimed | 10 TB out a month (third-party guides; Oracle's page to confirm) | real Postgres with no transfer limit in practice, but a server to look after (updates, backups, TLS), and Arm capacity is often unavailable |
| Supabase Free | 500 MB database, paused after a week idle | 5 GB a month | the same cap as Neon: no |

**The conclusion.** The fix is architectural before it is a host:
- R2, already in place, has no transfer charge. Moving the readers there (§2) removes the limit for page data and job inputs.
- If the measured day shows the jobs' own table reads are too large for that, Turso or D1 is the next step. They count rows instead of bytes, and the backend already speaks SQLite.
- A self-run Postgres on Oracle is the last resort.

Sources: [Cloudflare D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/),
[Turso pricing](https://turso.tech/pricing.md), [OCI free tier breakdown](https://selfhost.it.com/blog/oci-free-tier-breakdown) (third-party),
[free Postgres comparison](https://github.com/freebase-cloud/free-postgres-hosting) (third-party, Supabase's 5 GB).
