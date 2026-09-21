// Sofix extension, sorare.com content script.
// Asks the page bridge (bridge.js) who is signed in, then tells the background worker.
// The bridge only knows once Sorare's page has made its first GraphQL request, so it retries for a while.
(() => {
  let tries = 0;

  function ask() {
    const id = `sofix-${Date.now()}-${tries}`;
    const onReply = (event) => {
      if (event.source !== window || !event.data || event.data.source !== "sofix-bridge" || event.data.id !== id) return;
      window.removeEventListener("message", onReply);
      if (event.data.state === "signed-in") chrome.runtime.sendMessage({ type: "sorare-user", user: event.data.user });
      else if (event.data.state === "signed-out") chrome.runtime.sendMessage({ type: "sorare-user", user: null });
      else if (tries++ < 8) setTimeout(ask, 5000);
    };
    window.addEventListener("message", onReply);
    window.postMessage({ source: "sofix-content", type: "whoami", id }, location.origin);
  }

  setTimeout(ask, 3000);
})();
