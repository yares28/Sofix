# Your own Sofix

Each person runs a separate copy: their own repository, Vercel project, Neon database, private R2 bucket and Chrome
extension configuration. No database, bucket, saved lineup, token or service account is shared between the two copies.

## Where to enter the Sorare username

In **your GitHub repository → Settings → Secrets and variables → Actions → Variables → New repository variable**:

- Name: `SORARE_USER`
- Value: your Sorare manager's username, as it appears in the profile address. Do not enter an email or password.

Enter it once. Refresh, replan, Pro rebuilding and automatic reward checks all use that variable. An installation with
no username must stop its account reads rather than assume the original owner's name. For local Python commands, set
the same `SORARE_USER` in the ignored root `.env` (see `.env.example`). The website displays the collection published
by those jobs; setting a username only in Vercel does not configure the Python jobs.

Set the username before the first data refresh. A different manager needs a fresh independent database/bucket, not a
change of username over somebody else's existing history. Never copy the original `.env`, `.blocks`, database rows,
generated extension credentials or browser storage as a shortcut.

## Connect your services

1. Create your own GitHub copy with `main` as its deployment branch. Repository access is the source for the web app
   and jobs. Enable Actions after your own configuration is ready. Use your own API keys and secrets throughout.
2. Create an empty Neon project. Apply this repository's migrations using the database owner's connection before
   starting the jobs. Give the app a separate `fdr_app` login with only row read/write privileges. Keep its owner
   password out of GitHub Actions and Vercel. Configure the app connection with the existing TLS requirements.
   Additional spare projects are optional; leave spare settings empty for a single project. Do not import any of the
   original owner's five project addresses or IDs.
3. Create your own **private** R2 bucket using Standard storage. Make a read key for the web app and a read/write key
   for jobs and app writes. Do not make the bucket public. Stay inside the included allowances; this setup authorizes
   no paid plan, raised cap or extra storage charge.
4. Import your repository into Vercel with **`frontend` as the root directory**, using its normal Next.js build.
   Keep deployment protection enabled. Choose your own production app address and protection-bypass secret.
5. Add the settings below. Generate fresh random values of at least 32 characters for the extension token and
   revalidation secret. Put matching values in each listed place; never copy the original owner's values.

GitHub **repository secrets**:

- `POSTGRES_URL`: your `fdr_app` connection, using the backend's `postgresql+psycopg://` form.
- `FOOTBALL_DATA_ORG_TOKEN`, `SORARE_API_KEY`: your read-only source keys. `ODDS_API_KEY` is optional; absent odds stay absent.
- `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`: your bucket and jobs' read/write key.
- `APP_URL`: your protected production app address; `REVALIDATE_SECRET` and `VERCEL_BYPASS_SECRET`.
- `NEON_API_KEY`: your own Neon organization key for usage reporting and automatic spare-project selection, if used.
  `POSTGRES_URL_SPARE` stays empty unless you deliberately configure your own migrated spare projects.

Vercel **project environment variables**:

- `DATABASE_URL`: your `fdr_app` connection in the frontend driver's `postgresql://` form, with verified TLS.
  `DATABASE_URL_SPARE` is optional and belongs only to your own projects.
- `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`: the same bucket and its read key.
- `R2_WRITE_ACCESS_KEY_ID`, `R2_WRITE_SECRET_ACCESS_KEY`: your read/write key, so extension imports and saved lineups
  are visible immediately. These remain server-only; the browser receives no R2 credentials.
- `REVALIDATE_SECRET`: the same fresh value as GitHub; `EXTENSION_TOKEN`: your own fresh extension bearer token.
- `GITHUB_TOKEN`: a fine-grained token restricted to your repository, with Actions read/write permission.
- `GITHUB_REPO`: `your-github-name/your-repository`. The app can derive this from Vercel's Git repository metadata;
  setting it explicitly also covers local development and deployments where system metadata is disabled.

Redeploy after adding/changing Vercel environment variables. A refresh button now addresses the configured repository,
never the original owner's repository when configuration is missing. The Control link opens your Vercel dashboard.

## Keep the automatic updates

The outside clock is part of the normal workflow, including half-hourly score and near-lock checks. In your copy of
`clock/timetable.json`, change **`repo`** to your own `your-github-name/your-repository`; keep `ref` as `main` and retain
the timetable. Deploy `clock/wrangler.toml` to your own Cloudflare account and give that Worker your own restricted
`GITHUB_TOKEN`. Use its documented deployment commands. Do not deploy a copied clock until its repository is correct.
Do not point it at the original owner's repository or reuse his token.

The regular refresh workflow also has GitHub schedule backups, but they do not replace the outside clock's timing.
After the migrations, secrets, username and clock are ready, start **Scheduled refresh** once for this new installation.
Then confirm that Home/Gallery show **your username and your cards** and that later updates run automatically.

## Connect your Chrome extension

In the ignored root `.env`, enter your `APP_URL`, `EXTENSION_TOKEN` and `VERCEL_BYPASS_SECRET`. Run:

```powershell
node extension/scripts/configure.mjs
```

Load this copy's `extension` folder unpacked in Chrome and open Sorare signed in as the configured manager. The
generated `manifest.json` and `config.js` stay ignored and contain private configuration. A new copy accepts only its
own app address and localhost. If you use another address for the **same app**, list exact extra origins in
`APP_ORIGINS`, comma-separated, then configure again and press **Reload**. There is no built-in permission for the
original app's address. Use one installation per Chrome profile; installing two unpacked copies with the same extension
identity into one profile is not an account switcher.

Check the selected GW on Home/Play, your entered lineups, Gallery, missions and rewards. Check → Draft → explicit Enter
is unchanged. Existing Sorare sessions are read through the extension; Sofix never asks for your Sorare password.

## Local development and verification

Use a local copy of **your own** R2 blocks in `frontend/.blocks`, referenced by `SOFIX_BLOCKS_DIR`. Ordinary local
development must not carry a production database address. Browser and load tests use deterministic mocks.
The repository check discovers its GitHub repository from `origin` and checks the `APP_URL` in your own ignored `.env`.
For usage reporting, link this copy with the Vercel CLI, or supply your own `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`
in the command's environment. An unlinked copy reports usage as unavailable; it never substitutes the original project.

Before relying on a new installation, verify a cold first refresh, the displayed manager/cards, selected-GW navigation,
automatic score/reward checks, a failed source retaining honest missing/stale state, and extension operation after tab
closure. These are checks to complete with the second manager; mock tests do not establish his real deployment works.
