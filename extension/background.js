async function getConfig() {
  return chrome.storage.sync.get(["apiBase", "apiToken"]);
}

async function api(path, { method = "GET", body } = {}) {
  const { apiBase, apiToken } = await getConfig();
  if (!apiBase || !apiToken) {
    return { ok: false, error: "not_configured" };
  }
  const base = apiBase.replace(/\/$/, "");
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: data.error || `HTTP ${res.status}` };
  }
  return { ok: true, ...data };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === "LOOKUP") {
      const p = message.payload || {};
      const qs = new URLSearchParams();
      if (p.jobKey) qs.set("jobKey", p.jobKey);
      else if (p.url) qs.set("url", p.url);
      const result = await api(`/api/applications/lookup?${qs}`);
      sendResponse(result);
      return;
    }
    if (message.type === "SAVE") {
      const result = await api("/api/applications", {
        method: "POST",
        body: message.payload,
      });
      sendResponse(result);
      return;
    }
    sendResponse({ ok: false, error: "unknown" });
  })();
  return true;
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("ApplyTrack installed");
});
