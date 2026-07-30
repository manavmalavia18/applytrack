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
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => ({
      company: document.title,
      role: document.title,
      url: location.href,
      jobKey: null,
      source: "popup",
    }),
  });
  statusEl.textContent = "Saving…";
  const res = await chrome.runtime.sendMessage({
    type: "SAVE",
    payload: { ...result, status: "applied" },
  });
  statusEl.textContent = res?.ok
    ? res.created
      ? "Marked applied."
      : "Already tracked — updated."
    : res?.error || "Failed";
});
