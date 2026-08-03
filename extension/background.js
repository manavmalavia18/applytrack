// Shared normalize/merge/lookup helpers for "remember answers" (chrome.storage.local only).
importScripts("learned-answers.js");

async function getConfig() {
  return chrome.storage.sync.get(["apiBase", "apiToken"]);
}

async function getLearnedStore() {
  const { learnedAnswers } = await chrome.storage.local.get("learnedAnswers");
  return {
    byQuestion: learnedAnswers?.byQuestion || {},
    byCompany: learnedAnswers?.byCompany || {},
  };
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
      if (p.url) qs.set("url", p.url);
      else if (!p.jobKey) {
        sendResponse({ ok: false, error: "missing_url" });
        return;
      }
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
    if (message.type === "FILL_ANSWERS") {
      const result = await api("/api/fill-answers", {
        method: "POST",
        body: message.payload,
      });
      sendResponse(result);
      return;
    }
    if (message.type === "DRAFT_ANSWERS") {
      const result = await api("/api/draft-answers", {
        method: "POST",
        body: message.payload,
      });
      sendResponse(result);
      return;
    }
    if (message.type === "GET_PROFILE") {
      const result = await api("/api/profile");
      sendResponse(result);
      return;
    }
    if (message.type === "LEARN_ANSWERS") {
      const p = message.payload || {};
      const store = await getLearnedStore();
      const { store: next, learnedCount } = mergeLearnedAnswers(store, {
        companyKey: p.companyKey || "",
        entries: Array.isArray(p.entries) ? p.entries : [],
      });
      await chrome.storage.local.set({ learnedAnswers: next });
      sendResponse({ ok: true, learned: learnedCount });
      return;
    }
    if (message.type === "LOOKUP_LEARNED") {
      const p = message.payload || {};
      const store = await getLearnedStore();
      const answers = lookupLearnedAnswers(store, {
        questions: Array.isArray(p.questions) ? p.questions : [],
        companyKey: p.companyKey || "",
      });
      sendResponse({ ok: true, answers });
      return;
    }
    sendResponse({ ok: false, error: "unknown" });
  })();
  return true;
});

chrome.runtime.onInstalled.addListener(async () => {
  try {
    const { refreshTabId } = await chrome.storage.session.get("refreshTabId");
    if (refreshTabId) {
      await chrome.storage.session.remove("refreshTabId");
      await chrome.tabs.reload(refreshTabId);
    }
  } catch (err) {
    console.warn("ApplyTrack post-reload tab refresh skipped", err);
  }
});
