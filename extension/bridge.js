// Sofix extension, page bridge (runs in sorare.com's own page world).
// Sorare's web app talks to its GraphQL API with your logged-in session. This script notices the address and
// headers of those requests and keeps them in memory only, inside this closure; nothing is stored or sent away.
// With them it can ask Sorare "who is signed in?" the same way the page does. No OAuth, no password.
(() => {
  if (window.__sofixBridge) return;
  window.__sofixBridge = true;

  const originalFetch = window.fetch;
  let endpoint = null; // { url, headers } of the last GraphQL request Sorare's page made

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
      }
    } catch {
      // never break Sorare's own request
    }
    return originalFetch.apply(this, arguments);
  };

  async function whoAmI() {
    if (!endpoint) return { state: "unknown" };
    try {
      const response = await originalFetch(endpoint.url, {
        method: "POST",
        credentials: "include",
        headers: { ...endpoint.headers, "content-type": "application/json" },
        body: JSON.stringify({
          operationName: "SofixWhoAmI",
          query: "query SofixWhoAmI { currentUser { slug nickname } }",
          variables: {},
        }),
      });
      if (!response.ok) return { state: "error", status: response.status };
      const body = await response.json();
      const user = body && body.data && body.data.currentUser;
      return user ? { state: "signed-in", user: user.nickname || user.slug } : { state: "signed-out" };
    } catch {
      return { state: "error" };
    }
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window || !event.data || event.data.source !== "sofix-content" || event.data.type !== "whoami") return;
    const result = await whoAmI();
    window.postMessage({ source: "sofix-bridge", id: event.data.id, ...result }, location.origin);
  });
})();
