// Sofix extension, page bridge (runs in sorare.com's own page world).
// Sorare's web app talks to its GraphQL API with your logged-in session. This script notices the address and
// headers of those requests and keeps them in memory only, inside this closure; nothing is stored or sent away.
// With them it can ask Sorare the same questions the page asks, as you. No OAuth, no password.
//
// It asks nothing on its own: every call below answers a message, and the only two that write anything save a
// draft and enter a competition, each behind its own click in the app (docs/sorare_plan.md, S6).
//
// It also reads the answers the page itself gets, to learn which card each picture on screen is (the overlay,
// plans/overlay.md O1). What it learns is a small index kept in this closure: nothing stored, nothing sent away.
(() => {
  // 6: starting-odds session and partial-error reporting. Already-open tabs must install this bridge too.
  // Version the message source so an older bridge cannot answer first or repeat a write.
  if (window.__sofixBridge === 6) return;
  window.__sofixBridge = 6;

  const originalFetch = window.fetch;
  let endpoint = null; // { url, headers } of the last GraphQL request Sorare's page made
  let sawGraphQLAt = 0;
  const KNOWN = "https://api.sorare.com/graphql";
  const core = window.__sofixCore; // core.js runs first; without it the bridge still works, it just learns no cards

  // Which card a picture is. Keyed by the picture's own id (core.cardImageKey), and by the player's name as an
  // image's alt text spells it, for a picture whose id was never seen in an answer. Capped, oldest out first.
  const INDEX_MAX = 2000;
  const cards = new Map(); // key -> { cardSlug, playerSlug, name }
  const byName = new Map(); // normalised name -> playerSlug, or null when two players share the name
  let announceTimer = 0;

  function learn(found) {
    if (!core || !found.length) return;
    for (const item of found) {
      cards.delete(item.key); // re-inserting moves it to the newest end
      cards.set(item.key, { cardSlug: item.cardSlug, playerSlug: item.playerSlug, name: item.name });
      if (item.name && item.playerSlug) {
        const name = core.normalizeCardName(item.name);
        if (name) byName.set(name, byName.has(name) && byName.get(name) !== item.playerSlug ? null : item.playerSlug);
      }
    }
    while (cards.size > INDEX_MAX) cards.delete(cards.keys().next().value);
    if (byName.size > INDEX_MAX) byName.clear();
    // Tell the overlay there is more to look up, once per burst of answers.
    if (!announceTimer) {
      announceTimer = setTimeout(() => {
        announceTimer = 0;
        window.postMessage({ source: "sofix-bridge-6", type: "cards" }, location.origin);
      }, 250);
    }
  }

  /** Read a copy of an answer the page asked for. Never touches the answer the page receives. */
  async function readAnswer(response, asked) {
    try {
      if (!core || !response || !response.ok) return;
      if (!/json/i.test(response.headers.get("content-type") || "")) return;
      if (Number(response.headers.get("content-length") || 0) > 8000000) return;
      const body = await response.clone().json();
      learn(core.collectCards(body));
      const missions = core.collectMissions ? core.collectMissions(body) : [];
      if (missions.length && asked) window.postMessage({ source: "sofix-bridge-6", type: "missions", missions, rarity: asked }, location.origin);
    } catch {
      // a failure of ours must never reach the page
    }
  }

  function plainHeaders(source) {
    const out = {};
    new Headers(source || {}).forEach((value, key) => {
      if (!/^(content-length|accept-encoding)$/i.test(key)) out[key] = value;
    });
    return out;
  }

  window.fetch = function sofixFetch(input, init) {
    let graphql = false;
    let asked = null;
    try {
      const url = typeof input === "string" ? input : input && input.url;
      const method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
      if (url && method === "POST" && /graphql/i.test(url)) {
        graphql = true;
        asked = core && core.missionsAsked ? core.missionsAsked(init && init.body) : null;
        endpoint = { url: new URL(url, location.href).href, headers: plainHeaders((init && init.headers) || (input && input.headers)) };
        const now = Date.now();
        if (now - sawGraphQLAt > 2000) {
          sawGraphQLAt = now;
          window.postMessage({ source: "sofix-bridge-6", type: "ready" }, location.origin);
        }
      }
    } catch {
      // never break Sorare's own request
    }
    const pending = originalFetch.apply(this, arguments);
    // Registered before the page's own handlers, so the copy is taken before the page reads the answer.
    if (graphql) pending.then((response) => readAnswer(response, asked), () => {});
    return pending;
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

    // Every lineup the signed-in manager put in one exact gameweek, with what it scored, where it ranked and what it
    // was paid. This is deliberately fixture-level: it also finds competitions that Sofix did not include in one of
    // its own optimized plans, and it works for a gameweek played long ago. Read only.
    SofixFixtureLineups: `query SofixFixtureLineups($slug: String!) { so5 { so5Fixture(slug: $slug) {
      id slug gameWeek
      mySo5Lineups(withTraining: false) { id name draft confirmable
        so5Leaderboard { slug displayName }
        so5Rankings { id ranking score so5Leaderboard { slug }
          so5Rewards { rewardConfigs { __typename
            ... on MonetaryRewardConfig { amount { usdCents } }
            ... on CardShardRewardConfig { rarity quantity }
            ... on InGameCurrencyRewardConfig { amount currency }
            ... on CardRewardConfig { rarity quality } } } }
        so5Appearances(includeSubs: true) {
          id rarity pictureUrl(derivative: "tinified") score captain player { displayName } anyCard { slug }
        }
      }
    } } }`,

    // Sorare only publishes these odds inside its products, so read one selected game with the page's session.
    SofixLineupChances: `query SofixLineupChances($id: ID!) { currentUser { slug } anyGame(id: $id) { id ... on Game {
      playerGameScores { anyPlayer { slug } anyPlayerGameStats { ... on PlayerGameStats {
        footballPlayingStatusOdds { starterOddsBasisPoints }
      } } }
    } } }`,

    // Today's daily missions of every rarity, with the picks you made and Sorare's verdict on each. Read only: the app's
    // Load button asks it, so the Missions page never has to wait for a visit to Sorare's own Missions page.
    SofixMissions: `query SofixMissions($archived: Boolean!) { currentUser { slug ${["limited", "rare", "super_rare", "unique"].map((rarity) => `
      ${rarity}: taskGroup(slug: "play") { myTasks(sport: FOOTBALL, rarity: ${rarity}, includingArchived: $archived) { __typename
        ... on DecisivePlayerPickerTask { id title description rarity mode maxAppearancesCount periodicity aasmState expired startDate taskConfigSlug
          decisiveStats { name } statThresholds { stat min } overperform { averageType by } displayedTypedRules { __typename }
          rewardConfigs { __typename ... on CardShardRewardConfig { quantity rarity flavour { displayName slug } } ... on ExperienceRewardConfig { title description } ... on InGameCurrencyRewardConfig { amount currency } }
          taskAppearances { id status rarity locked lockedAt score target anyCard { slug } anyPlayer { slug } game { id date } } }
      } }`).join(" ")} } }`,

    // A bounded, read-only batch; callers cannot supply a GraphQL document or mutation.
    SofixMissionGames: (variables) => {
      const tasks = variables?.tasks;
      if (!Array.isArray(tasks) || !tasks.length || tasks.length > 12 || tasks.some((t) => !/^[A-Za-z0-9:_-]{1,120}$/.test(t.id) || (t.after !== undefined && (typeof t.after !== "string" || t.after.length > 500))) || !Number.isFinite(Date.parse(variables.fromDate)) || !Number.isFinite(Date.parse(variables.toDate))) return null;
      return `query SofixMissionGames { currentUser { ${tasks.map((t, i) => `t${i}: task(id: ${JSON.stringify(t.id)}) { ... on DecisivePlayerPickerTask { pickableGames(first: 100, after: ${JSON.stringify(t.after ?? null)}, fromDate: ${JSON.stringify(variables.fromDate)}, toDate: ${JSON.stringify(variables.toDate)}) { nodes { game { id date competition { slug } homeTeam { id name pictureUrl } awayTeam { id name pictureUrl } } } pageInfo { hasNextPage endCursor } } } }`).join(" ")} } }`;
    },
    SofixMissionCards: (variables) => {
      const pairs = variables?.pairs;
      if (!Array.isArray(pairs) || !pairs.length || pairs.length > 24 || pairs.some((p) => !/^[A-Za-z0-9:_-]{1,120}$/.test(p.id) || !/^Game:[a-f0-9-]{36}$/.test(p.game) || (p.after !== undefined && (typeof p.after !== "string" || p.after.length > 500)))) return null;
      const averages = /^(LAST_(FIVE|FIFTEEN|FORTY)|LAST_TEN_PLAYED)_(SO5_AVERAGE_SCORE|AVERAGE_ALL_AROUND_SCORE|AVERAGE_DECISIVE_SCORE)$|^SEASON_AVERAGE_SCORE$/;
      return `query SofixMissionCards { currentUser { ${pairs.map((p, i) => `t${i}: task(id: ${JSON.stringify(p.id)}) { ... on DecisivePlayerPickerTask { pickableCards(gameId: ${JSON.stringify(p.game)}, ownedByMe: true, first: 100, after: ${JSON.stringify(p.after ?? null)}) { nodes { slug pictureUrl anyPositions anyPlayer { slug displayName } eligiblePlayerGameScores(gameId: ${JSON.stringify(p.game)}, taskId: ${JSON.stringify(p.id)}) { anyPlayerGameStats { anyTeam { id name pictureUrl } } ${averages.test(p.averageType ?? "") ? `averageScore(type: ${p.averageType})` : ""} } } pageInfo { hasNextPage endCursor } } } }`).join(" ")} } }`;
    },

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
    const query = typeof OPERATIONS[operation] === "function" ? OPERATIONS[operation](variables) : OPERATIONS[operation];
    if (!query) return { state: "refused" };
    const target = endpoint || knownEndpoint();
    try {
      const response = await originalFetch(target.url, {
        method: "POST",
        credentials: "include",
        headers: { ...target.headers, "content-type": "application/json" },
        body: JSON.stringify({ operationName: operation, query, variables: typeof OPERATIONS[operation] === "function" ? {} : variables || {} }),
      });
      const issued = response.headers.get("csrf-token");
      if (issued && !cookie("csrftoken")) document.cookie = `csrftoken=${encodeURIComponent(issued)}; path=/`;
      if (!response.ok) return { state: "error", status: response.status };
      const body = await response.json();
      if (operation === "SofixLineupChances" && body?.data?.currentUser === null) return { state: "signed-out" };
      if (["SofixMissions", "SofixMissionCards", "SofixMissionGames"].includes(operation) && body?.errors?.length) return { state: "incomplete" };
      // Sorare answers a refused write with 200 and an errors array: those are its words, and they are kept. A read that came back with
      // its data and a complaint about one part keeps the data.
      if (body && body.errors && !(body.data && Object.values(body.data).some((value) => value !== null))) {
        return { state: "rejected", errors: body.errors.map((e) => String(e.message || e)) };
      }
      if (core && body && body.data) learn(core.collectCards(body.data)); // a lineup's cards are worth knowing too
      return { state: "ok", data: (body && body.data) || null, ...(operation === "SofixLineupChances" && body?.errors?.length ? { incomplete: true } : {}) };
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

  /**
   * Which card each picture is: `items` are `{ key, name }` (a picture's id and its alt text). A picture found by
   * id answers with its card and player; one found only by name answers with the player, because a name is
   * shared by all of a player's cards. What is not known is left out.
   */
  function identify(items) {
    const found = {};
    for (const item of Array.isArray(items) ? items.slice(0, 200) : []) {
      if (!item || typeof item.key !== "string") continue;
      const known = cards.get(item.key);
      if (known) {
        found[item.key] = { cardSlug: known.cardSlug, playerSlug: known.playerSlug };
        continue;
      }
      const byAlt = core && typeof item.name === "string" ? byName.get(core.normalizeCardName(item.name)) : null;
      if (byAlt) found[item.key] = { cardSlug: null, playerSlug: byAlt };
    }
    return { state: "ok", found, known: cards.size };
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window || !event.data || event.data.source !== "sofix-content-6") return;
    const { type, id, operation, variables, items } = event.data;
    const result =
      type === "whoami" ? await whoAmI() : type === "ask" ? await ask(operation, variables) : type === "identify" ? identify(items) : null;
    if (result) window.postMessage({ source: "sofix-bridge-6", id, ...result }, location.origin);
  });
})();
