# Two independent installations and a responsive app

Requested 30 October 2026. This supersedes the shared ten-account design in
[the original audit plan](performance-ten-users.md). There are two people, each running their own GitHub repository,
Vercel project, Neon database and private R2 bucket. No shared-user platform or account switching is requested.

## Required outcome and actions

The second person clones the code, connects their own services/secrets and enters their Sorare username once in
their repository's Actions variable `SORARE_USER`. All scheduled refreshes, replans, Pro reads and reward checks
must use that manager. Missing configuration must never silently read the original owner's account. The extension
and refresh buttons must target this installation, not the original one. An empty installation must not inherit
private data, credentials or browser caches from the original. Existing owner data and service configuration stay intact.

Both installations need quicker page loads and responsive controls, with the same forecasts, selected-GW coverage,
source identities and complete lists. No paid resources, destructive migration, deleted history, reduced simulation
accuracy or extra manual page visits are accepted substitutes. Check → Draft → explicit Enter remains unchanged.

## Delivery order

1. Make one-manager installation configuration explicit; remove original-owner fallbacks from scheduled jobs,
   repository links/actions, clock and extension allowlists; provide a complete independent-install guide.
   Test missing configuration and a different manager/repository/origin before fixing behavior.
2. Remove the Table's avoidable repeat work with output parity tests; move expensive calculation to published
   prepared results while keeping all modes/splits/GWs. Check production-build navigation and cold publication.
3. Continue page-specific data reduction and shared-view caching from the audit; preserve private access rules,
   freshness, week rollover, bookmarks and every existing control. Each usable increment is checked and shipped.

## Verification

Tests use two distinct deterministic installations, no real second-person secrets or source calls. Check a cold
empty install, missing username, configured manager, every owner-dependent scheduled task, correct action repository,
extension origin rejection and existing-owner compatibility. Performance uses local mocks, a production build,
current/old/empty GWs and each Table mode, with published and missing/stale derived data distinguished.
Record observed performance, local gates, page/browser checks and any unavailable real-account checks here.
Provisioning the other person's accounts and entering their private credentials remain their setup actions.

## Implementation and measured evidence

- [Setup guide](../docs/independent-install.md): the one username input is the repository Actions variable `SORARE_USER`.
  Missing values no longer fall back to the original owner. Score/reward checks now receive that variable too.
  Existing production's variable and the main checkout's local username were explicitly preserved as the same owner.
- GitHub action URLs derive from explicit configuration or this Vercel deployment's Git metadata. Local check commands
  discover their repository from `origin` and their Vercel IDs from the project's own CLI link/environment, with no
  original-owner fallback. A missing usage configuration is reported as unavailable, not silently measured elsewhere.
- Extension configuration permits the installation's app and explicit aliases only; tests cover a different origin,
  alias preservation, rejection of the original app and invalid URLs without printing tokens. The owner's generated
  files were rebuilt from existing secrets, retaining the two previously accepted owner app origins.
- Actual table **rows** now read recorded standings without forecasting; Home/Fixtures' round table computes expected
  points without simulating finish chances that it discards. Output-parity tests preserve ranks, points, venue splits,
  selected rounds, European league-phase filtering, next-fixture source and missing/zero FDR. Expected/Predicted keep
  their existing seeded 5,000 simulations. Stable European grid references avoid unnecessary repeat work on re-render.
- An offline same-process probe measured Actual's former computation at 61.4 ms and its results-only replacement at
  0.6 ms (`docs/performance-independent.json`). This is **not whole-page latency**: the season hero and chart still
  compute their displayed projections and need publication work. Source pages and Control also omit unused market data.
- 64 local mock browser checks passed across Board, Control, domestic/European leagues and mobile. Production build
  succeeded. Initial full gate exposed three tests relying on an implicit default manager; those fixtures now declare
  their manager, and their focused rerun passed. Import order, one test mock type and row type inference were repaired.
  The final `node scripts/check.mjs` passed repository/clock tests, formatting, lint, Python/frontend type checks,
  the complete Python/Vitest suites, API generation and documentation drift. The second-manager publication dry-run
  also passed separately after its assertion was strengthened.
- After the round-table change, Board had 39 passing cases and one calendar-sensitive test failure: its chosen GW
  could already be the default, and its generic date assertion could accept the previous week before navigation.
  The test now starts from another retained week and waits for the exact served planned week; its focused rerun passed.
  ESLint and TypeScript were rerun after that test correction. No product navigation behavior changed.
- Final production-build navigation was inspected in the in-app browser at 1440 and 390 px, including Table controls;
  neither viewport had document-level horizontal overflow. These inspections use recorded mocks, not live owner blocks.
  The owner's Chrome was used by the command-line browser suite, but his existing open Chrome tabs were not exposed.
- The final mock production build handled 60 warm navigation-data requests from two simultaneous clients with no errors:
  median 40 ms, p95 80.4 ms, p99 88 ms (`docs/performance-two-clients.json`). This short local sample measures server
  responses, not browser responsiveness, the second person's account or sustained live capacity.

Not verified: a real second manager's installation, new service provisioning, his authenticated extension session or
his first cold source refresh. The owner's open Chrome is unavailable in the exposed browser inventory; local mock
production-build inspection uses the available in-app browser. No new accounts, paid resources or database changes
were made, and no refresh was manually dispatched. The original ten-client benchmark remains historical evidence.

## Remaining performance work

Publish the season hero, forecast-table variants and chart once per input change; reduce full-season/client payloads
and cache rendered football pages while preserving publish freshness and week rollover. This increment does not
claim those remaining costs are solved, nor that two independent real deployments have passed acceptance.
