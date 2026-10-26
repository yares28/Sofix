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

## 4 · Pages read R2 only; nothing local reaches production (built 26 Oct)

**Why.** The ledger's first five hours counted 15.5 MB while Neon's own counter grew ~360 MB. The readers it could not see were
local: three folders kept the production address in `frontend/.env.local`, two dev servers ran on it, and every session's first
`check.mjs --live` queried all four projects. And every page view asked Neon for each block's write time, so pages broke
whenever Neon refused.

**The local copy.** `npm run blocks` (`frontend/scripts/blocks.mjs`) lists R2 and downloads every block whose ETag changed
into `frontend/.blocks/` (git-ignored, ~44 MB, 2,910 blocks; the first copy took 78 s, later ones only the changes). `predev`
runs it with `--daily`, so `npm run dev` starts on a copy at most a day old; a failure keeps the copy there is. With
`SOFIX_BLOCKS_DIR` set (it is, in `.env.local`) the dev server reads that folder and nothing else: the UI check on
"real read models" uses it. Worktrees point `SOFIX_BLOCKS_DIR` at the main folder's copy. A local Python script reads
`frontend/.blocks/<key>.json` (`{updatedAt, payload}`; the file name is the key URL-encoded) instead of the database.

**R2's certificate (24 Oct).** Local R2 reads failed then because the network presented a self-signed interception certificate
(`core1.netops.test`). On 26 Oct the endpoint presents Google Trust Services' WE1 certificate, `openssl` verifies it (code 0),
and both Python (`httpx`, certifi) and Node read and list R2 with validation on. Nothing was bypassed; if the interception comes
back, the copy command fails and keeps the old copy.

**No production address in local settings.** `DATABASE_URL`/`DATABASE_URL_SPARE` were removed from `frontend/.env.local` and the
two Claude worktrees' copies; the values still live in GitHub, Vercel and the git-ignored `.env.sofix*-neon`/`.env.neon-spares`.
`database()` (`frontend/lib/db.ts`) returns nothing under `next dev` unless `SOFIX_PRODUCTION=1`, and `app/db.py` refuses a Neon
connection outside GitHub Actions unless `SOFIX_PRODUCTION=1`. `check.mjs --live` reads `neon_status` from R2
(`blocks.mjs --get`), which `neon_switch` now publishes there.

**A deliberate production read** (one SELECT, as AGENTS.md allows), from `backend/`, with the app login and nothing saved:

```bash
SOFIX_PRODUCTION=1 POSTGRES_URL="$(grep '^APP_URL=' ../.env.sofix-b-neon | cut -d= -f2- | sed 's|^postgres\(ql\)\?://|postgresql+psycopg://|')" .venv/Scripts/python -m app.services.neon_ledger --day 20261027
```

`APP_URL` in that file is Sofix B's `fdr_app` login (use the live project's file). The address lives only in that one command's
environment; never in a dev setting, never printed.

**Pages read R2 alone.** A block's version is its R2 ETag: one HEAD for a block, one listing for a family (`missions_day:`,
`my_week:`, `lineups_day:`, `player_games:`). Each payload is cached in Next's cache under that version (`readModel`,
`readModelAt`); big ones are split after one download (`sorare`, `missions_pool`, score records). Tables pages used to query
are published as blocks by every job's last step (`publish.publish_to_r2`, run by `notify_app`): `player_games:<slug>` for each
player (built from the games copy in GitHub's cache, uploaded only when its md5 changed) and `refresh_runs` (last eight runs and
the newest one's steps). The same step copies any block written outside `publish.put` (merges in Postgres, the web app's
writes, a failed upload) and deletes blocks Neon no longer holds. The web app's writes stay on Neon and upload their block
straight away when Vercel has the `R2_WRITE_*` key; without it they reach R2 at the next job's end.

**What still reads Neon from the web app:** the write routes' own reads before a write (a merge, the owner check), and the
refresh button's status while a GitHub run is going (its live step). No page view needs Neon.

**player_sheets in pieces (26 Oct).** At 2.3 MB the sheets were over Next's 2 MB cache limit, so every player page downloaded
them again; they are now read as a head and four groups of players, each cached under the block's version (`lib/playerGames.ts`).
The last production database addresses in local files (`frontend/.env.local.fdr`, `.env.local.sofix`, the Codex worktree) are removed.
