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

## 3 · The fallback: a free host without a transfer cap

Researched beside the measurement. Only a host whose free plan is free for good, keeps the data, and has no monthly transfer limit
the app could reach. Findings and sources go here.
