(function () {
  let chip = null;

  function ensureChip() {
    if (chip) return chip;
    chip = document.createElement("button");
    chip.id = "applytrack-chip";
    chip.type = "button";
    chip.textContent = "ApplyTrack…";
    document.documentElement.appendChild(chip);
    chip.addEventListener("click", onClick);
    return chip;
  }

  async function refresh() {
    const parsed = parseJobPage();
    ensureChip();
    chip.textContent = "Checking…";
    chip.classList.remove("applied");
    const res = await chrome.runtime.sendMessage({
      type: "LOOKUP",
      payload: parsed,
    });
    if (!res?.ok) {
      chip.textContent = res?.error === "not_configured" ? "Set up ApplyTrack" : "ApplyTrack error";
      return;
    }
    if (res.found && res.application) {
      const status = res.application.status || "applied";
      chip.textContent = `Already ${status} · ${res.application.company || ""}`.trim();
      chip.classList.add("applied");
      chip.dataset.mode = "update";
    } else {
      chip.textContent = "Mark Applied";
      chip.dataset.mode = "create";
    }
  }

  async function onClick() {
    const parsed = parseJobPage();
    chip.textContent = "Saving…";
    const res = await chrome.runtime.sendMessage({
      type: "SAVE",
      payload: { ...parsed, status: "applied" },
    });
    if (!res?.ok) {
      chip.textContent = res?.error || "Save failed";
      return;
    }
    chip.classList.add("applied");
    chip.textContent = res.created ? "Applied ✓" : "Updated ✓";
    chip.dataset.mode = "update";
    setTimeout(refresh, 800);
  }

  refresh();
  let last = location.href;
  setInterval(() => {
    if (location.href !== last) {
      last = location.href;
      refresh();
    }
  }, 1200);
})();
