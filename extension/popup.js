const apiBaseEl = document.getElementById("apiBase");
const apiTokenEl = document.getElementById("apiToken");
const statusEl = document.getElementById("status");

chrome.storage.sync.get(["apiBase", "apiToken"], (cfg) => {
  apiBaseEl.value = cfg.apiBase || "";
  apiTokenEl.value = cfg.apiToken || "";
});

document.getElementById("save").addEventListener("click", async () => {
  await chrome.storage.sync.set({
    apiBase: apiBaseEl.value.trim().replace(/\/$/, ""),
    apiToken: apiTokenEl.value.trim(),
  });
  statusEl.textContent = "Saved.";
});

document.getElementById("mark").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) {
    statusEl.textContent = "No active tab.";
    return;
  }
  statusEl.textContent = "Saving…";
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["ats.js", "parsers.js"],
    });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (typeof parseJobPage === "function") {
          let p = parseJobPage();
          if (typeof resolveJobPayload === "function") p = resolveJobPayload(p);
          else if (typeof mergeRememberedJob === "function" && p.source) {
            p = mergeRememberedJob(p, p.source);
          }
          return p;
        }
        return {
          company: document.title,
          role: document.title,
          url: location.href,
          jobKey: null,
          source: "popup",
        };
      },
    });
    const res = await chrome.runtime.sendMessage({
      type: "SAVE",
      payload: { ...result, status: "applied" },
    });
    statusEl.textContent = res?.ok
      ? res.created
        ? "Marked applied."
        : "Already tracked — updated."
      : res?.error || "Failed";
  } catch (e) {
    statusEl.textContent = e instanceof Error ? e.message : "Failed";
  }
});

document.getElementById("show").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    statusEl.textContent = "No active tab.";
    return;
  }
  statusEl.textContent = "Injecting…";
  try {
    // Clear stale boot flag so re-inject can mount UI after extension updates
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        try {
          delete window.__applytrackBooted;
        } catch {
          window.__applytrackBooted = false;
        }
        document.getElementById("applytrack-host")?.remove();
      },
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["ats.js", "parsers.js", "content.js"],
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (typeof window.__applytrackOpen === "function") window.__applytrackOpen();
      },
    });
    statusEl.textContent = "Opened on this tab.";
  } catch (e) {
    statusEl.textContent = e instanceof Error ? e.message : "Inject failed — refresh the page.";
  }
});

document.getElementById("reload").addEventListener("click", async () => {
  statusEl.textContent = "Reloading…";
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    await chrome.storage.session.set({ refreshTabId: tab?.id ?? null });
  } catch {
    /* ignore */
  }
  chrome.runtime.reload();
});
