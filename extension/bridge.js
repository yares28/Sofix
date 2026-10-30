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
  // 9: the newest bridge takes over a tab left open across an update (8 skipped itself and kept its old questions).
  // 8: reads your Pro lineups. 7: starting odds come from native page responses; custom queries silently receive null.
  // Version the message source so an older bridge cannot answer first or repeat a write. Within version 9 and later, only
  // the bridge injected last speaks: an earlier one in the same tab passes everything through and answers nothing.
  const ME = Math.random().toString(36).slice(2);
  window.__sofixBridge = 9;
  window.__sofixBridgeId = ME;
  const current = () => window.__sofixBridgeId === ME;

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
  const startingOdds = new Map(); // exact game/player -> native reading; this tab only, expires in 15 minutes
  // Sorare gives start % only to its own registered questions (seen 21 Oct 2026: the Arcade compose page's bench is asked by id, and the
  // same id with other dates and positions answers with every card's start % days ahead). The id seen on 21 Oct; a newer one replaces it.
  const BENCH = "SeriesComposeBenchQuery";
  let benchExtensions = { clientLibrary: { name: "@apollo/client", version: "4.2.11" }, operationId: "React/30aff0273a9cbb5ee2480754e2f972ea151f6ba3e94d56c59263132b81cba22e" };
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
    announce();
  }

  /** Tell the overlay there is more to look up, once per burst of answers. */
  function announce() {
    if (!announceTimer) {
      announceTimer = setTimeout(() => {
        announceTimer = 0;
        if (!current()) return;
        window.postMessage({ source: "sofix-bridge-9", type: "cards" }, location.origin);
      }, 250);
    }
  }

  /** Read a copy of an answer the page asked for. Never touches the answer the page receives. */
  async function readAnswer(response, asked, native) {
    try {
      if (!current()) return;
      if (!core || !response || !response.ok) return;
      if (!/json/i.test(response.headers.get("content-type") || "")) return;
      if (Number(response.headers.get("content-length") || 0) > 8000000) return;
      const body = await response.clone().json();
      learn(core.collectCards(body));
      if (native) {
        const fresh = []; // a number this tab has not said yet, or not for five minutes
        const games = new Set();
        for (const row of core.collectStartingOdds(body)) {
          const key = `${row.game}|${row.player}`;
          const before = startingOdds.get(key);
          games.add(row.game);
          if (row.basisPoints !== null && (!before || before.basisPoints !== row.basisPoints || Date.now() - before.observedAt >= 5 * 60000)) {
            fresh.push({ game: row.game, player: row.player, basisPoints: row.basisPoints });
          }
          startingOdds.delete(key);
          startingOdds.set(key, { ...row, observedAt: Date.now() });
        }
        while (startingOdds.size > INDEX_MAX) startingOdds.delete(startingOdds.keys().next().value);
        // Passed on so the app can save it: a reading then outlives this tab (plans/sorare-start-chances.md). `games` names every
        // game the answer spoke of, also one Sorare has no number for yet, so "Read the round" knows the page has answered.
        if (games.size) announce(); // the overlay asks for Sorare's own numbers again (`odds`)
        if (games.size) window.postMessage({ source: "sofix-bridge-9", type: "chances", rows: fresh.slice(0, 500), games: [...games].slice(0, 100) }, location.origin);
      }
      const missions = core.collectMissions ? core.collectMissions(body) : [];
      if (missions.length && asked) window.postMessage({ source: "sofix-bridge-9", type: "missions", missions, rarity: asked }, location.origin);
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
    if (!current()) return originalFetch.apply(this, arguments);
    let graphql = false;
    let asked = null;
    let native = false;
    try {
      const url = typeof input === "string" ? input : input && input.url;
      const method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
      if (url && method === "POST" && new URL(url, location.href).href === KNOWN) {
        graphql = true;
        try {
          const body = JSON.parse(init?.body);
          native = typeof body?.operationName === "string" && !body.operationName.startsWith("Sofix");
          // Sorare's compose page names its bench question by a registered id, not by its text; keep the newest id seen.
          const id = body?.extensions?.operationId;
          if (body?.operationName === BENCH && typeof id === "string" && /^React\/[0-9a-f]{40,64}$/.test(id)) {
            benchExtensions = { clientLibrary: body.extensions.clientLibrary, operationId: id };
          }
        } catch { /* an unreadable request body must not break the page */ }
        asked = core && core.missionsAsked ? core.missionsAsked(init && init.body) : null;
        endpoint = { url: new URL(url, location.href).href, headers: plainHeaders((init && init.headers) || (input && input.headers)) };
        const now = Date.now();
        if (now - sawGraphQLAt > 2000) {
          sawGraphQLAt = now;
          window.postMessage({ source: "sofix-bridge-9", type: "ready" }, location.origin);
        }
      }
    } catch {
      // never break Sorare's own request
    }
    const pending = originalFetch.apply(this, arguments);
    // Registered before the page's own handlers, so the copy is taken before the page reads the answer.
    if (graphql) pending.then((response) => readAnswer(response, asked, native), () => {});
    return pending;
  };

  // The only questions this bridge will ask Sorare. It is not a general proxy: an operation that is not in
  // here is refused, whoever sends the message.
  // One entered lineup as the app draws it, in a gameweek or on a Pro step.
  const LINEUP = `id name draft confirmable
        so5Leaderboard { slug displayName
          rules { appearances(includeSubs: true) { positions sub } }
          engineConfiguration { season captain grade scarcity sameActiveClub averageScores }
          displayedTypedRules { key } }
        so5Rankings { id ranking score so5Leaderboard { slug }
          so5Rewards { rewardConfigs { __typename
            ... on MonetaryRewardConfig { amount { usdCents } }
            ... on CardShardRewardConfig { rarity quantity }
            ... on InGameCurrencyRewardConfig { amount currency }
            ... on CardRewardConfig { rarity quality } } } }
        so5Appearances(includeSubs: true) {
          id index grade positions averageScore(type: LAST_TEN_PLAYED_SO5_AVERAGE_SCORE)
          rarity pictureUrl(derivative: "tinified") score captain player { slug displayName }
          anyCard { slug inSeasonEligible anyTeam { name } }
        }`;

  // What a step or a mission pays, as the Arcade reads take it.
  const REWARDS = `__typename
    ... on MonetaryRewardConfig { amount { eurCents usdCents referenceCurrency } }
    ... on CardShardRewardConfig { rarity quantity cardSet { slug } }
    ... on InGameCurrencyRewardConfig { amount currency }
    ... on CardRewardConfig { rarity quality }
    ... on CardPacksRewardConfig { cardPack { slug title } }`;

  // Sorare's task(id:) and gameId arguments take the bare UUID since Oct 2026 ("Tasks::Task:…" answers "TaskConfig(id=) not found").
  const bare = (id) => String(id).replace(/^.*:/, "");
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
      id slug gameWeek startDate endDate
      mySo5Lineups(withTraining: false) { ${LINEUP} }
    } } }`,

    // Your Pro lineups: Pro plays per league matchday, outside the gameweek above, so its lineups sit on the steps of
    // every Pro board (LaLiga's and the others). A Pro lineup is a task lineup: its cards each carry their own game.
    // Read only; the app keeps those whose first game falls in the gameweek it shows.
    SofixProLineups: `query SofixProLineups { currentUser { boards(mode: CAREER, sport: FOOTBALL) {
      id title ... on CareerBoard { configSlug so5Competition { displayName } }
      steps { __typename level target state
        myLineups { __typename
          ... on TaskLineup { id draft confirmable aasmState score
            taskAppearances { id index captain rarity positions score pictureUrl(derivative: "tinified")
              averageScore(type: LAST_TEN_PLAYED_SO5_AVERAGE_SCORE)
              anyCard { slug inSeasonEligible anyTeam { name } } player { slug displayName } game { date } } }
          ... on So5Lineup { ${LINEUP} so5Fixture { slug startDate } } } } } } }`,

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
      return `query SofixMissionGames { currentUser { ${tasks.map((t, i) => `t${i}: task(id: ${JSON.stringify(bare(t.id))}) { ... on DecisivePlayerPickerTask { pickableGames(first: 100, after: ${JSON.stringify(t.after ?? null)}, fromDate: ${JSON.stringify(variables.fromDate)}, toDate: ${JSON.stringify(variables.toDate)}) { nodes { game { id date competition { slug } homeTeam { id name pictureUrl } awayTeam { id name pictureUrl } } } pageInfo { hasNextPage endCursor } } } }`).join(" ")} } }`;
    },
    SofixMissionCards: (variables) => {
      const pairs = variables?.pairs;
      if (!Array.isArray(pairs) || !pairs.length || pairs.length > 12 || pairs.some((p) => !/^[A-Za-z0-9:_-]{1,120}$/.test(p.id) || !/^Game:[a-f0-9-]{36}$/.test(p.game) || (p.after !== undefined && (typeof p.after !== "string" || p.after.length > 500)))) return null;
      const averages = /^(LAST_(FIVE|FIFTEEN|FORTY)|LAST_TEN_PLAYED)_(SO5_AVERAGE_SCORE|AVERAGE_ALL_AROUND_SCORE|AVERAGE_DECISIVE_SCORE)$|^SEASON_AVERAGE_SCORE$/;
      return `query SofixMissionCards { currentUser { ${pairs.map((p, i) => `t${i}: task(id: ${JSON.stringify(bare(p.id))}) { ... on DecisivePlayerPickerTask { pickableCards(gameId: ${JSON.stringify(bare(p.game))}, ownedByMe: true, first: 100, after: ${JSON.stringify(p.after ?? null)}) { nodes { slug pictureUrl anyPositions anyPlayer { slug displayName } eligiblePlayerGameScores(gameId: ${JSON.stringify(bare(p.game))}, taskId: ${JSON.stringify(p.id)}) { anyPlayerGameStats { anyTeam { id name pictureUrl } } ${averages.test(p.averageType ?? "") ? `averageScore(type: ${p.averageType})` : ""} } } pageInfo { hasNextPage endCursor } } } }`).join(" ")} } }`;
    },

    // Arcade (plans/set.md, step 1): the current set, your common gems and essence, and your set board with each step's target,
    // reward, lives and packs. Read only, like the three below; split in four so each stays a small question for Sorare.
    SofixArcade: `query SofixArcade { cardSet { currentSet { slug name startDate endDate availableCompetitions { slug displayName } } }
      currentUser { slug
        gems: inGameCurrencyBalances(inGameCurrencies: [COMMON_GEM], sport: FOOTBALL) { currency amount cap }
        essence: cardShardsChests(rarities: [common], sport: FOOTBALL) { rarity cardShardsCount maxCardShardsCount cardSet { slug } }
        setBoard(mode: CAREER, sport: FOOTBALL) { __typename id title endDate
          ... on CareerBoard { configSlug rarities restartable so5Competition { slug displayName } }
          myCurrentStep { id level }
          steps { __typename id level target originalTarget state
            engineConfiguration { captain collection sameActiveClub activeClubs specialEditionCard specialEditionCards }
            rewardConfigs { ${REWARDS} }
            ... on CareerStep { title maxLineupsCount remainingLineupsCount lockedLineupsCount pendingLineupsCount
              cardPacks { slug title price effectivePrice currency cardsCount canPurchase competition { slug } } } } } } }`,

    // The lineups on each step of your set board: which are live, locked, cancelled, and what each card scored.
    SofixArcadeLineups: `query SofixArcadeLineups { currentUser { setBoard(mode: CAREER, sport: FOOTBALL) { id
      steps { id level myLineups { __typename
        ... on TaskLineup { id draft aasmState score cancelledAt forfeitable hasLiveGames updatable
          taskAppearances { id index captain positions score locked bonus
            anyCard { slug } player { slug displayName } game { id date } } } } } } } }`,

    // Today's General daily missions (Sorare's Play missions window, `setPlayTasks`, seen 22 Oct 2026: the Decisive Player Picker, some
    // days more), with their rewards, your picks and your progress. The older Common panel's streaks could no longer be played.
    SofixArcadeMissions: `query SofixArcadeMissions { currentUser {
      setPlayTasks(sport: FOOTBALL) { __typename
        ... on DecisivePlayerPickerTask { id title description mode maxAppearancesCount periodicity aasmState expired startDate taskConfigSlug
          decisiveStats { name } statThresholds { stat min }
          rewardConfigs { ${REWARDS} }
          taskAppearances { id status locked score target anyCard { slug } anyPlayer { slug } game { id date } } }
        ... on ThresholdsStreakTask { id title description progress target expired rewardConfigs { ${REWARDS} } } } } }`,

    // Your common cards, 100 at a time; the app keeps the current set's.
    SofixArcadeCards: (variables) => {
      const after = variables?.after ?? null;
      if (after !== null && (typeof after !== "string" || after.length > 500)) return null;
      return `query SofixArcadeCards { currentUser { cards(rarities: [common], sport: FOOTBALL, sorts: [RECENTLY_OWNED_FIRST], first: 100, after: ${JSON.stringify(after)}) {
        totalCount
        nodes { slug pictureUrl cardEditionName anyPositions cardSet { slug }
          skinEdition { bonus skinName variantName }
          anyPlayer { slug displayName } anyTeam { slug name pictureUrl ... on Club { domesticLeague { slug displayName } } } }
        pageInfo { hasNextPage endCursor } } } }`;
    },

    // The games your set board can be played on (plans/set.md, step 2): each card's next game, found by its club.
    SofixArcadeGames: (variables) => {
      const after = variables?.after ?? null;
      if (after !== null && (typeof after !== "string" || after.length > 500)) return null;
      if (!Number.isFinite(Date.parse(variables?.fromDate)) || !Number.isFinite(Date.parse(variables?.toDate))) return null;
      return `query SofixArcadeGames { currentUser { setBoard(mode: CAREER, sport: FOOTBALL) { ... on CareerBoard {
        pickableGames(first: 50, after: ${JSON.stringify(after)}, fromDate: ${JSON.stringify(variables.fromDate)}, toDate: ${JSON.stringify(variables.toDate)}) {
          nodes { id totalCount game { id date statusTyped competition { slug displayName } homeTeam { slug name pictureUrl } awayTeam { slug name pictureUrl } } }
          pageInfo { hasNextPage endCursor } } } } } }`;
    },

    // Arcade step 3 (plans/set.md): the club collection bonus Sorare gives each card on your set board, up to 50 cards a question.
    SofixArcadeBonuses: (variables) => {
      const cards = variables?.cards;
      if (!Array.isArray(cards) || !cards.length || cards.length > 50 || cards.some((c) => typeof c !== "string" || !/^[a-z0-9-]{1,160}$/.test(c))) return null;
      return `query SofixArcadeBonuses { currentUser { setBoard(mode: CAREER, sport: FOOTBALL) { ... on CareerBoard {
        ${cards.map((c, i) => `b${i}: bonuses(cardSlug: ${JSON.stringify(c)}) { key bonusBasisPoints }`).join(" ")} } } } }`;
    },
    // Up to 50 players' last 15 games: what each scored and the minutes he played (his likely range), and Sorare's word on him: his
    // tier (GOAT = Icon), his usual role (starter, regular, substitute) and any open injury (0.4.18; Sorare's `news` is empty, 29 Oct).
    // L5, L10 and L40 are the same averages Gallery stores (0.4.20).
    SofixArcadePast: (variables) => {
      const players = variables?.players;
      if (!Array.isArray(players) || !players.length || players.length > 50 || players.some((p) => typeof p !== "string" || !/^[a-z0-9-]{1,120}$/.test(p))) return null;
      return `query SofixArcadePast { players(slugs: ${JSON.stringify(players)}) { slug ... on Player { gameplayTier playingStatus activeInjuries { active expectedEndDate }
        l5: averageScore(type: LAST_FIVE_SO5_AVERAGE_SCORE) l10: averageScore(type: LAST_TEN_PLAYED_SO5_AVERAGE_SCORE) l40: averageScore(type: LAST_FORTY_SO5_AVERAGE_SCORE)
        playerGameScores(last: 15) { score anyGame { date } anyPlayerGameStats { ... on PlayerGameStats { minsPlayed } } } } } }`;
    },
    // Arcade's collection missions (0.4.18): what each counts (players, clubs or a league), your progress and the target.
    SofixArcadeCollection: `query SofixArcadeCollection { currentUser {
      tracks: setCollectionsTaskTracks(sport: FOOTBALL) { ...SofixCollectTask }
      setBoard(mode: CAREER, sport: FOOTBALL) { myCollectionTasks(rarity: common) { ...SofixCollectTask } } } }
      fragment SofixCollectTask on TaskInterface { __typename id title description progress target expired aasmState rewardConfigs { ${REWARDS} }
        ... on CardsCountTargetTask { players { slug } specifiedTeams { ... on TeamInterface { slug name } } competitions { slug } }
        ... on CardsCountTask { specifiedTeams { ... on TeamInterface { slug name } } competitions { slug } } }`,
    // Sorare rejects both list nesting and repeated anyPlayer roots: one named player per history request.
    SofixArcadeDecisive: (variables) => {
      const players = variables?.players;
      const after = variables?.after ?? {};
      const before = variables?.before;
      if (!Array.isArray(players) || !players.length || players.length > 1 || players.some((p) => typeof p !== "string" || !/^[a-z0-9-]{1,120}$/.test(p))) return null;
      if (typeof before !== "string" || !/^\d{4}-\d{2}-\d{2}T[0-9:.]+Z$/.test(before) || !Number.isFinite(Date.parse(before))) return null;
      if (typeof after !== "object" || after === null || players.some((p) => after[p] != null && (typeof after[p] !== "string" || !/^[A-Za-z0-9+/=_-]{1,256}$/.test(after[p])))) return null;
      return `query SofixArcadeDecisive { ${players.map((p, i) => `p${i}: anyPlayer(slug: ${JSON.stringify(p)}) { slug ... on Player {
        allPlayerGameScores(first: 40, to: ${JSON.stringify(before)}${after[p] ? `, after: ${JSON.stringify(after[p])}` : ""}) {
          pageInfo { hasNextPage endCursor }
          nodes { scoreStatus anyGame { date } anyPlayerGameStats { ... on PlayerGameStats { minsPlayed gameStarted } } ... on PlayerGameScore { detailedScore { stat statValue } } }
        } } }`).join(" ")} }`;
    },
    // One game's Sorare projections ("if he plays"), which Sorare publishes about two days before kick-off.
    SofixArcadeProjections: (variables) => {
      if (typeof variables?.game !== "string" || !/^Game:[0-9a-f-]{36}$/i.test(variables.game)) return null;
      return `query SofixArcadeProjections { anyGame(id: ${JSON.stringify(variables.game)}) { ... on Game { id playerGameScores { projection { score } anyPlayer { slug } } } } }`;
    },

    // Arcade step 5: Sorare's published draw odds of the current step's packs, two slots a question (Sorare's size cap).
    SofixArcadePackOdds: (variables) => {
      const slots = variables?.slots;
      if (!Array.isArray(slots) || !slots.length || slots.length > 2 || slots.some((i) => !Number.isInteger(i) || i < 0 || i > 9)) return null;
      return `query SofixArcadePackOdds { currentUser { setBoard(mode: CAREER, sport: FOOTBALL) { myCurrentStep { ... on CareerStep { cardPacks { slug cardsCount
        ${slots.map((i) => `s${i}: slotGameplayTierOdds(slotIndex: ${i}) { gameplayTier probabilityBasisPoint playerOdds { probabilityBasisPoint player { slug } team { slug } } }`).join(" ")} } } } } } }`;
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

  /**
   * Arcade's start %, read like Sorare's compose page reads its bench: one position, one date window, 30 of your common cards a page,
   * best first. Read only. It goes through the page's own fetch (as a native question) so what it shows is saved like any page reading.
   */
  async function arcadeBench(v) {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const positions = ["Goalkeeper", "Defender", "Midfielder", "Forward"];
    if (!uuid.test(v?.task ?? "") || !positions.includes(v?.position) || !Number.isFinite(Date.parse(v?.minDate)) || !Number.isFinite(Date.parse(v?.maxDate))
      || (v.after !== null && (typeof v.after !== "string" || v.after.length > 500))) return { state: "refused" };
    const body = {
      operationName: BENCH,
      variables: {
        pageSize: 50, isAndroidApp: false, isIosApp: false, withCollectionPredictions: false, taskId: v.task, sport: "FOOTBALL", isMarket: false,
        offerRarity: "common", googlePlayStoreCountryCode: null, after: v.after,
        filters: {
          query: "", includeUnavailablePlayers: true, includeUsed: true, includePostExpiration: false, sortType: { type: "PROJECTED_GRADE", direction: "DESC" },
          rarities: ["common"], lastTenPlayedSo5AverageScore: { min: 0, max: 100 }, gamesDate: { minDate: v.minDate, maxDate: v.maxDate },
          positions: [v.position], selectedObjectIds: [],
        },
      },
      extensions: benchExtensions,
    };
    const target = endpoint || knownEndpoint();
    try {
      const response = await window.fetch(target.url, { method: "POST", credentials: "include", headers: { ...target.headers, "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) return { state: "error", status: response.status };
      const answer = await response.json();
      const bench = answer?.data?.currentUser?.task?.myFilteredBench;
      if (!bench) return { state: "rejected", errors: (answer?.errors ?? []).map((e) => String(e?.message ?? e)).slice(0, 3) };
      const rows = core ? core.collectStartingOdds(answer).filter((r) => r.basisPoints !== null).slice(0, 200) : [];
      return { state: "ok", data: { cards: bench.nodes?.length ?? 0, after: bench.pageInfo?.hasNextPage ? bench.pageInfo.endCursor : null, rows } };
    } catch {
      return { state: "error" };
    }
  }

  async function ask(operation, variables) {
    if (operation === "SofixLineupChances") {
      const id = variables?.id;
      if (typeof id !== "string" || !/^Game:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return { state: "refused" };
      const rows = [];
      for (const [key, row] of startingOdds) {
        if (Date.now() - row.observedAt >= 15 * 60000) { startingOdds.delete(key); continue; }
        if (row.game === id) rows.push({ anyPlayer: { slug: row.player }, observedAt: row.observedAt,
          anyPlayerGameStats: { footballPlayingStatusOdds: row.basisPoints === null ? null : { starterOddsBasisPoints: row.basisPoints } } });
      }
      return rows.length ? { state: "ok", native: true, data: { anyGame: { id, playerGameScores: rows } } } : { state: "unseen" };
    }
    if (operation === "SofixArcadeBench") return arcadeBench(variables);
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
      if (["SofixMissions", "SofixMissionCards", "SofixMissionGames"].includes(operation) && body?.errors?.length) return { state: "incomplete" };
      // Sorare answers a refused write with 200 and an errors array: those are its words, and they are kept. A read that came back with
      // its data and a complaint about one part keeps the data.
      if (body && body.errors && !(body.data && Object.values(body.data).some((value) => value !== null))) {
        return { state: "rejected", errors: body.errors.map((e) => String(e.message || e)) };
      }
      if (core && body && body.data) learn(core.collectCards(body.data)); // a lineup's cards are worth knowing too
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

  /**
   * Sorare's own start chance for each of `players`, as this tab's answers carried it in the last 15 minutes (the badge at a card's
   * foot). Only a player with one game among them is answered: with two, which one a tile is about is not known here. A game the
   * answer calls started or played is left out: Sorare's number then says what happened, not what it expects.
   */
  function odds(players) {
    const wanted = new Set(Array.isArray(players) ? players.slice(0, 200) : []);
    const games = new Map(); // player -> game -> basis points
    for (const [key, row] of startingOdds) {
      if (Date.now() - row.observedAt >= 15 * 60000) { startingOdds.delete(key); continue; }
      if (!wanted.has(row.player) || (row.status && row.status !== "scheduled")) continue;
      if (!games.has(row.player)) games.set(row.player, new Map());
      games.get(row.player).set(row.game, row.basisPoints);
    }
    const found = {};
    for (const [player, byGame] of games) {
      const [only] = byGame.values();
      if (byGame.size === 1 && only !== null) found[player] = only / 10000;
    }
    return { state: "ok", odds: found };
  }

  window.addEventListener("message", async (event) => {
    if (!current() || event.source !== window || !event.data || event.data.source !== "sofix-content-9") return;
    const { type, id, operation, variables, items, players } = event.data;
    const result =
      type === "whoami" ? await whoAmI() : type === "ask" ? await ask(operation, variables) : type === "identify" ? identify(items) : type === "odds" ? odds(players) : null;
    if (result) window.postMessage({ source: "sofix-bridge-9", id, ...result }, location.origin);
  });
})();
