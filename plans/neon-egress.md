# Plan · One free Neon project for the whole month (19 Oct 2026)

Owner's ask (19 Oct): "I can't keep adding new Neon projects each time." Neon's free plan sends 5 GB a month per project.
Four projects are now in turn (Sofix, FDR, Sofix B, Sofix C); the first three ran out within October.

## What the numbers say (measured 19 Oct on Sofix B, live since 14 Oct)

- Sofix B sent 3.86 GB in about 5 days: **~750 MB a day, ~23 GB a month**, more than four free projects.
- The jobs explain ~260 MB a day: each refresh reads ~28 MB (5-7 a day, mostly `player_games` history), the half-hourly
  score check read ~1 MB (48 a day; cut on 19 Oct, 2bf64bc). The other ~500 MB a day is the website reading page blocks
  (`SELECT payload FROM read_models`; 213 reads in one stats window; blocks up to 2.4 MB) on production and local dev servers.
- The jobs rewrite **410 page blocks a day** (15.8 MB); all 2,719 blocks together are 26 MB.

## The four steps, in order

### Step 0 · Count bytes per reader (1 day) · built 20 Oct (074bd30), the day's totals still to collect
Log the size of every Neon read, tagged by who read it (refresh step, score check, Vercel page, dev server), to confirm
the split above before and after each step. Done when: one day's totals per reader are in this file.

### Step 3 · Do not rewrite a block that has not changed · done 20 Oct (074bd30)
`put` (`backend/app/services/publish.py`, the one write path) compares a hash of the new payload with the stored one
(kept in a small column, not by reading the payload) and skips the write when equal. Pages then re-download only blocks
that really changed. Built without a migration: the comparison runs inside the database. Blocks that carry their own build time
(`sorare`, `missions_pool`, `lineups`, `sorare_ahead`) still change every refresh, because their pages show it. Done when: a refresh that
changes nothing leaves every `updated_at` as it was (test), and the daily count of rewritten blocks drops.

### Step 2 · The jobs keep the game history in GitHub's cache · done 20 Oct
The refresh, league-history and replan workflows restore a copy of `player_games` from `actions/cache` (free, 10 GB per
repo, kept 7 days after last use), ask Neon for one fingerprint per player (~55 kB; no migration) and fetch only players whose rows changed,
and save the merged copy for the next run. A missing or corrupt copy
falls back to today's full read. Measured on Sofix B: five history reads sent 0.27 MB through the copy instead of 5.9 MB, results identical; filling
the copy once costs ~23 MB. Done when: a refresh reads under 3 MB from Neon instead of ~28 MB, with the same plans
(the replay tests and one refresh compared block by block against the previous one).

### Step 1 · Page blocks move to Cloudflare R2 · built 20 Oct: both tokens tested, all 2,763 blocks copied, the web app's
reads checked against Neon (identical content, an older version refused). Still to do: once Neon's counter shows the drop,
stop keeping payloads in Neon; the jobs' own reads of blocks still go to Neon.
- **Why R2:** sending data out is free with no limit; the free plan allows 10 GB stored, 1 million writes and 10 million
  reads a month. We need ~30 MB stored, ~13,000 writes and a few thousand reads a month: under 2% of each.
  **Vercel Blob was checked and does not fit:** Hobby allows 2,000 uploads a month (we make ~12,000) and, past any limit,
  Blob is shut off for 30 days.
- **Owner:** create a free Cloudflare account and turn on R2 (Cloudflare asks for a card to turn it on, even for the free
  plan; nothing is charged within the free allowance), make a private bucket `sofix-pages`, and two API tokens limited to
  it: read-write for GitHub, read-only for Vercel. Paste them as secrets (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`) in GitHub and Vercel; never in chat.
- **Jobs:** `put` also uploads the block as `<key>.json` to R2; Neon keeps the row with its `updated_at` and hash, and its
  payload until step 1 is proven (one week), then an empty payload. The jobs' own reads of blocks go to R2 too.
- **Website:** `readModelAt` (`frontend/lib/db.ts`) fetches `<key>.json` from R2 (S3 API, signed request, no new SDK if a
  ~40-line signer does it) instead of Neon; it still asks Neon only for the write time, as today. The partial reads done
  in SQL today (`missionsPool.ts`, `score_checks._page`) become whole-file reads from R2 (free), split into smaller files
  where a block is over Next's 2 MB cache limit.
- **Fallback:** if R2 does not answer, read the payload from Neon (while it is still kept) and say so on /control.
- Done when: Neon sends under 100 MB a day for a week (one project lasts the month with room), every page answers 200 with
  the same content as before, and /control shows R2's state.

## Expected result
Neon: from ~750 MB a day to a few tens of MB (write times, the jobs' changed rows, small state). R2: page blocks, free.
The four Neon projects stay as spares; no new one is needed.
