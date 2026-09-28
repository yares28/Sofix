// Sofix extension, sorare.com content script.
// The only way between the extension and your Sorare session: it passes a question to the page bridge
// (bridge.js) and passes the answer back. It starts by asking who is signed in; the rest it does on request,
// when you press a step of Apply in the app, or when the app pings and the background asks again.
(() => {
  if (globalThis.__sofixContent === 3) return;
  globalThis.__sofixContent = 3;

  let asked = 0;
  let tries = 0;
  let known = false;

  /** Put one question to the page bridge and wait for its answer. */
  function bridge(message, timeoutMs = 8000) {
    return new Promise((resolve) => {
      const id = `sofix-${Date.now()}-${asked++}`;
      const timer = setTimeout(() => {
        window.removeEventListener("message", onReply);
        resolve({ state: "timeout" });
      }, timeoutMs);
      const onReply = (event) => {
        if (event.source !== window || !event.data || event.data.source !== "sofix-bridge-3" || event.data.id !== id) return;
        clearTimeout(timer);
        window.removeEventListener("message", onReply);
        const { source, id: _id, type, ...answer } = event.data;
        resolve(answer);
      };
      window.addEventListener("message", onReply);
      window.postMessage({ source: "sofix-content-3", id, ...message }, location.origin);
    });
  }

  function remember(answer) {
    if (answer.state === "signed-in") {
      known = true;
      chrome.runtime.sendMessage({ type: "sorare-user", user: answer.user });
    } else if (answer.state === "signed-out") {
      known = false;
      chrome.runtime.sendMessage({ type: "sorare-user", user: null });
    } else if (tries++ < 12) setTimeout(whoAmI, 4000);
    return answer;
  }

  function whoAmI() {
    return bridge({ type: "whoami" }).then(remember);
  }

  // A GraphQL call of the page's own just landed: ask again, in case the first look was too early.
  window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.source !== "sofix-bridge-3" || event.data.type !== "ready" || known) return;
    tries = 0;
    whoAmI();
  });

  // From the background worker: a liveness check, a fresh "who is signed in", or a step the app asked for.
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message?.type === "sofix-ping-3") {
      reply({ ok: true, version: 3 });
      return;
    }
    if (message?.type === "whoami") {
      bridge({ type: "whoami" }).then((answer) => {
        remember(answer);
        reply(answer);
      });
      return true;
    }
    if (message?.type !== "ask") return;
    bridge({ type: "ask", operation: message.operation, variables: message.variables }, 20000).then(reply);
    return true;
  });

  setTimeout(whoAmI, 1000);
})();
