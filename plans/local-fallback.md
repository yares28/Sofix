# Local use during the hosting outage

Requested outcome: keep Sofix usable on this computer while Vercel is paused, without an upgrade or a production database connection.

Coverage and user actions:
- Open one local address, including Arcade and its saved browser selections, after starting a desktop launcher.
- Start again after closing the server or rebooting; reuse an existing instance instead of opening another server.
- Download published blocks directly from private R2 on startup and every ten minutes. Keep the last copy through network failure; invalidate local page caches after a successful update.
- Keep the extension's existing authentication and explicit Sorare actions. Configure its app address locally without changing production settings; the owner reloads the extension once.
- Pages and extension overlay reads use the local blocks. Existing database-backed writes (settings, mission imports and archived weeks) remain unavailable without a database; this task must report that boundary rather than claim a complete replacement for the hosted write service.

Acceptance: regression tests for environment isolation, offline startup/restart, failed updates retaining data, duplicate startup, and the extension address override; real-data page navigation and an authenticated local overlay request. No production database reads/writes or production-page sweep.

Implementation: a local production server, a Windows launcher, and a background block synchronizer. GitHub refresh jobs publish R2 before attempting Vercel revalidation (`backend/app/services/publish.py`), so the local copy can stay current independently of Vercel.

Verification (1 November 2026):
- The local gate passed repository script tests, generated API types, eslint, TypeScript, Vitest and documentation checks. The local production build passed.
- Downloaded 9,004 real R2 blocks (4,083 changed, 58.2 MB). Grid/system publication: 18:08 UTC; Sorare: 18:05 UTC. No production database connection was supplied.
- Home, Arcade and Play returned 200 from the background production server on `127.0.0.1:3000`. A second launcher invocation reused it. A real three-card local overlay request returned 200 with the existing token; the unauthenticated request returned 401. Local cache revalidation returned 200.
- The installed extension configuration was rebuilt for loopback; its token matches the server. The owner still needs to reload the extension once. `Sofix local.cmd` was placed on the owner's Desktop.
- Visual/navigation and authenticated browser-session proof remain unverified: computer use stopped because it could not confidently identify the active browser URL. HTTP checks are not a substitute for those acceptance cases. Reboot/offline behavior is covered by regression tests rather than an actual machine reboot; the ten-minute synchronization interval is scheduled, not yet observed over a full interval.
- Vercel remains unavailable under the reported CPU limit. The local server does not depend on its recovery. Database-backed writes listed above remain outside this fallback's working coverage.
