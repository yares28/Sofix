// Sofix extension, sorare.com content script.
// The only way between the extension and your Sorare session: it passes a question to the page bridge
// (bridge.js) and passes the answer back. It starts by asking who is signed in; the rest it does on request,
// when you press a step of Apply in the app.
// The bridge only knows the API's address once Sorare's page has made its first GraphQL request, so it retries.
(() => {
  let tries = 0;
  let asked = 0;

  /** Put one question to the page bridge and wait for its answer. */
  function bridge(message, timeoutMs = 20000) {
    return new Promise((resolve) => {
      const id = `sofix-${Date.now()}-${asked++}`;
      const timer = setTimeout(() => {
        window.removeEventListener("message", onReply);
        resolve({ state: "timeout" });
      }, timeoutMs);
      const onReply = (event) => {
        if (event.source !== window || !event.data || event.data.source !== "sofix-bridge" || event.data.id !== id) return;
        clearTimeout(timer);
        window.removeEventListener("message", onReply);
        const { source, id: _id, ...answer } = event.data;
        resolve(answer);
      };
      window.addEventListener("message", onReply);
      window.postMessage({ source: "sofix-content", id, ...message }, location.origin);
    });
  }

  async function whoAmI() {
    const answer = await bridge({ type: "whoami" });
    if (answer.state === "signed-in") chrome.runtime.sendMessage({ type: "sorare-user", user: answer.user });
    else if (answer.state === "signed-out") chrome.runtime.sendMessage({ type: "sorare-user", user: null });
    else if (tries++ < 8) setTimeout(whoAmI, 5000);
  }

  // From the background worker, which is relaying a step the app asked for.
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id || message?.type !== "ask") return;
    bridge({ type: "ask", operation: message.operation, variables: message.variables }).then(reply);
    return true; // reply asynchronously
  });

  setTimeout(whoAmI, 3000);
})();
