// Sofix extension, page bridge (runs in sorare.com's own page world).
// Sorare's web app talks to its GraphQL API with your logged-in session. This script notices the address and
// headers of those requests and keeps them in memory only, inside this closure; nothing is stored or sent away.
// With them it can ask Sorare the same questions the page asks, as you. No OAuth, no password.
//
// It asks nothing on its own: every call below answers a message, and the only two that write anything save a
// draft and enter a competition, each behind its own click in the app (docs/sorare_plan.md, S6).
(() => {
  // 3: a tab that was already open keeps the previous bridge. A new one must still install, or that tab
  // stays invisible. The message source is versioned for the same reason: the old bridge would answer first.
  if (window.__sofixBridge === 3) return;
  window.__sofixBridge = 3;

  const originalFetch = window.fetch;
  let endpoint = null; // { url, headers } of the last GraphQL request Sorare's page made
  let sawGraphQLAt = 0;
  const KNOWN = "https://api.sorare.com/graphql";

  function plainHeaders(source) {
    const out = {};
    new Headers(source || {}).forEach((value, key) => {
      if (!/^(content-length|accept-encoding)$/i.test(key)) out[key] = value;
    });
    return out;
  }

  window.fetch = function sofixFetch(input, init) {
    try {
      const url = typeof input === "string" ? input : input && input.url;
      const method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
      if (url && method === "POST" && /graphql/i.test(url)) {
        endpoint = { url: new URL(url, location.href).href, headers: plainHeaders((init && init.headers) || (input && input.headers)) };
        const now = Date.now();
        if (now - sawGraphQLAt > 2000) {
          sawGraphQLAt = now;
          window.postMessage({ source: "sofix-bridge-3", type: "ready" }, location.origin);
        }
      }
    } catch {
      // never break Sorare's own request
    }
    return originalFetch.apply(this, arguments);
  };

  // The only questions this bridge will ask Sorare. It is not a general proxy: an operation that is not in
  // here is refused, whoever sends the message.
  const OPERATIONS = {
    SofixWhoAmI: "query SofixWhoAmI { currentUser { slug nickname } }",

    // What is already entered in this competition, and whether more may be.
    SofixMyLineups: `query SofixMyLineups($slug: String!) { so5 { so5Leaderboard(slug: $slug) {
      id slug teamsCap
      mySo5Lineups { id name draft confirmable deletable rewardMultiplier
        so5Appearances(includeSubs: true) { id anyCard { slug } } } } } }`,

    // Every lineup the signed-in manager put in one exact gameweek. This is deliberately fixture-level:
    // it also finds competitions that Sofix did not include in one of its own optimized plans.
    SofixFixtureLineups: `query SofixFixtureLineups($slug: String!) { so5 { so5Fixture(slug: $slug) {
      id slug gameWeek
      mySo5Lineups(withTraining: false) { id name draft confirmable
        so5Leaderboard { slug displayName }
        so5Appearances(includeSubs: true) {
          id rarity pictureUrl(derivative: "tinified") player { displayName } anyCard { slug }
        }
      }
    } } }`,

    // Sorare's own verdict on a lineup, before anything is written.
    SofixPreviewLineup: `query SofixPreviewLineup($slug: String!, $appearances: [So5AppearanceInput!]!) {
      so5 { so5Leaderboard(slug: $slug) { id
        previewSo5Lineup(appearances: $appearances) {
          rewardMultiplier
          feedbackRules { ruleName state message } } } } }`,

    // Saves the lineup **as a draft**: nothing is entered until SofixConfirmLineups.
    SofixSaveDraft: `mutation SofixSaveDraft($input: createOrUpdateSo5LineupInput!) {
      createOrUpdateSo5Lineup(input: $input) {
        errors { code message path }
        so5Lineup { id name draft confirmable rewardMultiplier } } }`,

    // The one step that enters the competition, and the only one that costs anything.
    SofixConfirmLineups: `mutation SofixConfirmLineups($input: confirmSo5LineupsInput!) {
      confirmSo5Lineups(input: $input) {
        errors { code message path }
        so5Lineups { id name draft } } }`,
  };

  function cookie(name) {
    const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : null;
  }

  // The page's own calls are the best copy of the headers. Until one happens — the tab was already open, or
  // its calls finished before this script — Sorare's website endpoint still answers as the signed-in manager,
  // because this runs in the page and the session cookie goes with it.
  function knownEndpoint() {
    const root = document.documentElement;
    const headers = { accept: "application/json", "content-type": "application/json", "sorare-client": "Web" };
    const version = root && root.getAttribute("data-sorare-version");
    const build = root && root.getAttribute("data-sorare-revision");
    if (version) headers["sorare-version"] = version;
    if (build) headers["sorare-build"] = build;
    const token = cookie("csrftoken");
    if (token) headers["x-csrf-token"] = token;
    return { url: KNOWN, headers };
  }

  async function ask(operation, variables) {
    if (!Object.hasOwn(OPERATIONS, operation)) return { state: "refused" };
    const target = endpoint || knownEndpoint();
    try {
      const response = await originalFetch(target.url, {
        method: "POST",
        credentials: "include",
        headers: { ...target.headers, "content-type": "application/json" },
        body: JSON.stringify({ operationName: operation, query: OPERATIONS[operation], variables: variables || {} }),
      });
      const issued = response.headers.get("csrf-token");
      if (issued && !cookie("csrftoken")) document.cookie = `csrftoken=${encodeURIComponent(issued)}; path=/`;
      if (!response.ok) return { state: "error", status: response.status };
      const body = await response.json();
      // Sorare answers a refused write with 200 and an errors array: those are its words, and they are kept.
      if (body && body.errors) return { state: "rejected", errors: body.errors.map((e) => String(e.message || e)) };
      return { state: "ok", data: (body && body.data) || null };
    } catch {
      return { state: "error" };
    }
  }

  async function whoAmI() {
    const answer = await ask("SofixWhoAmI", {});
    if (answer.state !== "ok") return answer.state === "unknown" ? { state: "unknown" } : { state: "error" };
    const user = answer.data && answer.data.currentUser;
    return user ? { state: "signed-in", user: user.nickname || user.slug } : { state: "signed-out" };
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window || !event.data || event.data.source !== "sofix-content-3") return;
    const { type, id, operation, variables } = event.data;
    const result = type === "whoami" ? await whoAmI() : type === "ask" ? await ask(operation, variables) : null;
    if (result) window.postMessage({ source: "sofix-bridge-3", id, ...result }, location.origin);
  });
})();
