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

async function enrichGreenhousePayload(p) {
  if (!p || p.source !== "greenhouse") return p;
  const jid = String(p.jobKey || "").replace(/^greenhouse:/i, "");
  if (!jid) return p;
  const role = String(p.role || "").trim();
  const roleWeak =
    !role ||
    /^unknown role$/i.test(role) ||
    (role.match(/\s\|\s/g) || []).length >= 2 ||
    (/\bcareers?\b/i.test(role) && !/\b(recruiter|director|manager|program|partner|coach)\b/i.test(role)) ||
    /\b(see openings|current openings|open positions)\b/i.test(role);
  const coWeak = !p.company || /^(unknown|unknown company|careers?)$/i.test(String(p.company).trim());
  if (!roleWeak && !coWeak) return p;
  const tokens = Array.isArray(p.boardTokens) ? p.boardTokens : [];
  for (const token of tokens) {
    if (!token) continue;
    try {
      const res = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs/${encodeURIComponent(jid)}`,
      );
      if (!res.ok) continue;
      const data = await res.json();
      const apiRole = (data.title || "").trim();
      const apiCompany = (data.company_name || data.offices?.[0]?.name || "").trim();
      if (!apiRole && !apiCompany) continue;
      return {
        ...p,
        role: roleWeak && apiRole ? apiRole : p.role,
        company: coWeak && apiCompany ? apiCompany : p.company,
        jobKey: p.jobKey || `greenhouse:${jid}`,
        source: "greenhouse",
      };
    } catch {
      /* try next token */
    }
  }
  return p;
}

function usableNotifyRole(role) {
  const s = String(role || "").trim();
  if (!s || /^unknown role$/i.test(s)) return "";
  if ((s.match(/\s\|\s/g) || []).length >= 2) return "";
  if (/\bcareers?\b/i.test(s) && !/\b(recruiter|director|manager|program|partner|coach)\b/i.test(s)) {
    return "";
  }
  if (/\b(see openings|current openings|open positions)\b/i.test(s)) return "";
  return s;
}

function notifyTab(tabId, message) {
  if (!tabId) return;
  try {
    const sent = chrome.tabs.sendMessage(tabId, message);
    if (sent && typeof sent.catch === "function") sent.catch(() => {});
  } catch {
    /* tab gone */
  }
}

function notifyTabApplied(tabId, payload) {
  if (!tabId) return;
  const role = usableNotifyRole(payload?.role);
  const body = {
    status: payload?.status || "applied",
    company: payload?.company,
    jobKey: payload?.jobKey,
    ...(role ? { role } : {}),
  };
  notifyTab(tabId, { type: "APPLIED_SAVED", payload: body });
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
    // Token missing/revoked/wrong — never surface raw "Unauthorized" in the panel.
    if (res.status === 401 || data.error === "Unauthorized") {
      return { ok: false, error: "auth_required" };
    }
    return { ok: false, error: data.error || `HTTP ${res.status}` };
  }
  return { ok: true, ...data };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
    // Content script fires this on Submit and may close the tab immediately.
    // Lookup + save run here so the write survives navigation/unload.
    if (message.type === "AUTO_SAVE_APPLIED") {
      const raw = message.payload || {};
      notifyTabApplied(sender.tab?.id, {
        status: "applied",
        role: raw.role,
        company: raw.company,
        jobKey: raw.jobKey,
      });
      const p = await enrichGreenhousePayload(raw);
      const { boardTokens: _tokens, ...body } = p;
      const qs = new URLSearchParams();
      if (body.jobKey) qs.set("jobKey", body.jobKey);
      if (body.url) qs.set("url", body.url);
      const look =
        body.jobKey || body.url ? await api(`/api/applications/lookup?${qs}`) : { ok: false };
      if (look?.ok && look.found && !look.stale) {
        const betterRole = usableNotifyRole(body.role);
        const savedBad = !usableNotifyRole(look.application?.role);
        if (betterRole && savedBad) {
          const result = await api("/api/applications", {
            method: "POST",
            body: {
              ...body,
              status: look.application?.status || "applied",
            },
          });
          notifyTabApplied(sender.tab?.id, {
            status: look.application?.status || "applied",
            role: body.role,
            company: body.company,
            jobKey: body.jobKey,
          });
          sendResponse(result);
          return;
        }
        notifyTabApplied(sender.tab?.id, {
          status: look.application?.status || "applied",
          role: look.application?.role || body.role,
          company: look.application?.company || body.company,
          jobKey: body.jobKey,
        });
        sendResponse({ ok: true, already: true, application: look.application });
        return;
      }
      const result = await api("/api/applications", {
        method: "POST",
        body: {
          ...body,
          status: "applied",
          newCycle: Boolean(look?.stale),
        },
      });
      if (result?.ok) {
        notifyTabApplied(sender.tab?.id, {
          status: "applied",
          role: body.role,
          company: body.company,
          jobKey: body.jobKey,
        });
      }
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
    if (message.type === "FILL_PROGRESS") {
      notifyTab(sender.tab?.id, { type: "FILL_PROGRESS", payload: message.payload || {} });
      sendResponse({ ok: true });
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
