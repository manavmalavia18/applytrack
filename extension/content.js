(function () {
  "use strict";

  // UI only on the top frame — iframes still get click-to-log below.
  const isTop = window === window.top;
  let uiStarted = false;
  let autoStarted = false;

  const DRAFT_STORAGE_KEY = "applytrack:answerDraft";

  /** Live-scrape filled text answers (Ashby-friendly). Used for draft buffer + learn. */
  function scrapeAnswerEntries() {
    const nodes = [
      ...document.querySelectorAll("textarea"),
      ...document.querySelectorAll('input[type="text"]'),
      ...document.querySelectorAll('input[type="email"]'),
      ...document.querySelectorAll("input:not([type])"),
      ...document.querySelectorAll("[contenteditable='true']"),
      ...document.querySelectorAll("[role='textbox']"),
    ];
    const entries = [];
    let idx = 0;
    for (const input of nodes) {
      if (!(input instanceof HTMLElement)) continue;
      if (input.disabled || input.readOnly) continue;
      if (input.type === "password" || input.type === "hidden") continue;
      // Don't require visible — Ashby may detach nodes mid-submit; still try .value
      const value = input.isContentEditable
        ? (input.innerText || input.textContent || "").trim()
        : String(input.value || "").trim();
      if (!value || value.length < 2) continue;
      if (typeof shouldLearnValue === "function" && !shouldLearnValue(value)) continue;

      let label = "";
      if (input.id) {
        try {
          const byFor = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
          label = (byFor?.innerText || "").trim().replace(/\s+/g, " ");
        } catch {
          /* ignore */
        }
      }
      if (!label) {
        const block = input.closest(
          "[class*='question'], [class*='Question'], [class*='Field'], [class*='field'], [class*='ashby'], fieldset, label, li, section, form > div, form div",
        );
        if (block) {
          const clone = block.cloneNode(true);
          clone.querySelectorAll("textarea, input, button, select, [contenteditable]").forEach((n) => n.remove());
          label = (clone.innerText || "").trim().replace(/\s+/g, " ");
        }
      }
      if (!label) {
        let prev = input.previousElementSibling;
        for (let i = 0; i < 5 && prev; i++, prev = prev.previousElementSibling) {
          const t = (prev.innerText || "").trim().replace(/\s+/g, " ");
          if (t.length >= 6 && t.length < 300) {
            label = t;
            break;
          }
        }
      }
      if (!label) label = (input.getAttribute("aria-label") || input.getAttribute("placeholder") || "").trim();
      if (/^cards?\s*\[/i.test(label) || /\[[0-9a-f-]{8,}\]/i.test(label)) label = "";
      if (label) {
        label = label.split(/\n/)[0].slice(0, 240);
        if (value.length > 20 && label.includes(value.slice(0, 20))) {
          label = label.slice(0, label.indexOf(value.slice(0, 20))).trim();
        }
      }
      if (!label || label.length < 4) label = `question_${idx + 1}`;
      // Skip Type here placeholders used as labels
      if (/^type here/i.test(label)) label = `question_${idx + 1}`;
      entries.push({ label, value });
      idx += 1;
    }
    return entries;
  }

  function readDraftBuffer() {
    try {
      const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function writeDraftBuffer(company, entries) {
    if (!entries?.length) return;
    try {
      const prev = readDraftBuffer() || { entries: [] };
      const byQ = Object.create(null);
      for (const e of Array.isArray(prev.entries) ? prev.entries : []) {
        if (e?.label && e?.value) byQ[String(e.label).toLowerCase()] = e;
      }
      for (const e of entries) {
        if (e?.label && e?.value) byQ[String(e.label).toLowerCase()] = e;
      }
      const companyKey =
        typeof companyKeyFromName === "function" ? companyKeyFromName(company || "") : "";
      sessionStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({
          company: company || prev.company || "",
          companyKey: companyKey || prev.companyKey || "",
          entries: Object.values(byQ),
          updatedAt: Date.now(),
        }),
      );
    } catch {
      /* ignore quota */
    }
  }

  function bufferAnswersFromPage(companyHint) {
    let company = companyHint || "";
    try {
      if (!company && typeof readJobCtx === "function") {
        company = readJobCtx("applytrack:job:latest")?.company || "";
      }
    } catch {
      /* ignore */
    }
    const entries = scrapeAnswerEntries();
    if (entries.length) writeDraftBuffer(company, entries);
    return entries;
  }

  /** Login / SSO / auth wizards — never learn or warn here. */
  function looksLikeAuthPage() {
    try {
      const path = location.pathname.toLowerCase();
      const href = location.href.toLowerCase();
      if (
        /\/(login|log-in|signin|sign-in|signup|sign-up|register|auth|sso|oauth|create-?account|forgot-?password|reset-?password)(\/|$|\?)/i.test(
          path,
        )
      ) {
        return true;
      }
      if (/[?&](login|signin|sign_in|auth)=/i.test(href)) return true;
      // Password form with no long-answer fields = credentials step, not application Q&A
      const hasPassword = Boolean(document.querySelector('input[type="password"]'));
      const hasAppText = Boolean(document.querySelector("textarea, [contenteditable='true']"));
      if (hasPassword && !hasAppText) return true;
    } catch {
      /* ignore */
    }
    return false;
  }

  function draftEntryCount() {
    const draft = readDraftBuffer();
    return Array.isArray(draft?.entries) ? draft.entries.length : 0;
  }

  async function flushDraftToLearned(extraEntries, companyHint) {
    if (typeof mergeLearnedAnswers !== "function") return 0;
    // Harden: orphaned content scripts can have runtime.id but a missing storage.local.
    let storageLocal;
    try {
      if (!chrome?.runtime?.id) return 0;
      storageLocal = chrome?.storage?.local;
    } catch {
      return 0;
    }
    if (typeof storageLocal?.get !== "function" || typeof storageLocal?.set !== "function") {
      return 0;
    }

    const live = Array.isArray(extraEntries) ? extraEntries : scrapeAnswerEntries();
    const draft = readDraftBuffer();
    const merged = Object.create(null);
    for (const e of Array.isArray(draft?.entries) ? draft.entries : []) {
      if (e?.label && e?.value) merged[String(e.label).toLowerCase()] = e;
    }
    for (const e of live) {
      if (e?.label && e?.value) merged[String(e.label).toLowerCase()] = e;
    }
    const entries = Object.values(merged);
    if (!entries.length) return 0;

    let company = companyHint || draft?.company || "";
    try {
      if (!company && typeof readJobCtx === "function") {
        company = readJobCtx("applytrack:job:latest")?.company || "";
      }
    } catch {
      /* ignore */
    }
    const companyKey =
      (typeof companyKeyFromName === "function" ? companyKeyFromName(company) : "") ||
      draft?.companyKey ||
      "";

    let learnedAnswers;
    try {
      const got = await storageLocal.get("learnedAnswers");
      learnedAnswers = got?.learnedAnswers;
    } catch {
      return 0;
    }
    const { store, learnedCount } = mergeLearnedAnswers(
      {
        byQuestion: learnedAnswers?.byQuestion || {},
        byCompany: learnedAnswers?.byCompany || {},
      },
      { companyKey, entries },
    );
    try {
      await storageLocal.set({ learnedAnswers: store });
    } catch {
      return 0;
    }
    console.info("[ApplyTrack] flushed", learnedCount, "answers for", companyKey || "(global)");
    return learnedCount;
  }

  function supported() {
    try {
      return typeof isSupportedJobPage === "function" && isSupportedJobPage();
    } catch {
      return false;
    }
  }

  function maybeSupportedSoon() {
    try {
      return typeof mightBecomeJobPage === "function" && mightBecomeJobPage();
    } catch {
      return false;
    }
  }

  function hasUi() {
    return Boolean(document.getElementById("applytrack-host"));
  }

  function markBooted() {
    window.__applytrackBooted = true;
  }

  function clearBootedIfNoUi() {
    if (!hasUi()) {
      uiStarted = false;
      try {
        delete window.__applytrackBooted;
      } catch {
        window.__applytrackBooted = false;
      }
    }
  }

  // Allow re-entry if a previous boot never mounted UI (unsupported ATS at first load,
  // extension updated, or "Show on this tab" re-injects).
  if (window.__applytrackBooted && hasUi() && typeof window.__applytrackOpen === "function") {
    return;
  }
  if (window.__applytrackBooted && !hasUi()) {
    clearBootedIfNoUi();
  }

  function start() {
    // Don't mount UI on error documents even if host looks like an ATS
    if (!supported()) return;
    markBooted();
    try {
      if (isTop && (!uiStarted || !hasUi())) {
        uiStarted = true;
        if (!hasUi()) startUi();
      }
      if (!autoStarted) {
        autoStarted = true;
        startAutoApply();
      }
    } catch (err) {
      uiStarted = false;
      clearBootedIfNoUi();
      console.warn("[ApplyTrack] start failed", err);
    }
  }

  if (!supported()) {
    if (maybeSupportedSoon()) {
      markBooted();
      const wait = setInterval(() => {
        if (supported()) {
          clearInterval(wait);
          start();
        }
      }, 800);
      setTimeout(() => {
        clearInterval(wait);
        clearBootedIfNoUi();
      }, 12000);
    }
  } else {
    start();
  }

  // Self-heal: SPA navigations / failed boots / extension reloads that left no pill
  if (isTop) {
    let lastHealHref = location.href;
    setInterval(() => {
      if (!supported()) return;
      if (hasUi()) {
        lastHealHref = location.href;
        return;
      }
      // Job page with no UI — remount (common after extension reload without tab refresh)
      if (location.href !== lastHealHref || !window.__applytrackBooted) {
        lastHealHref = location.href;
      }
      clearBootedIfNoUi();
      start();
    }, 1500);
  }

  function startUi() {
    if (document.getElementById("applytrack-host")) return;

    const STATUS = {
      saved: "Wishlist",
      applied: "Sent",
      oa: "Assessment",
      interview: "Interviewing",
      offer: "Offer",
      rejected: "Closed",
    };

    let open = false;
    let parsed = null;
    let found = false;
    let stale = false;
    let application = null;
    let error = null;
    let busy = false;
    let filling = false;
    let fillError = null;
    let filledMatches = [];
    let filledLearnedCount = 0;
    let unmatchedFields = [];
    let autoNote = null;
    let scraped = [];
    let dead = false;

    const host = document.createElement("div");
    host.id = "applytrack-host";
    Object.assign(host.style, {
      all: "initial",
      display: "block",
      position: "fixed",
      zIndex: "2147483646",
      top: "0",
      left: "0",
      width: "0",
      height: "0",
      overflow: "visible",
      pointerEvents: "none",
    });
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif; }
        .tab {
          pointer-events: auto;
          position: fixed;
          left: 16px;
          /* Above typical cookie banners (bottom ~80–120px) */
          bottom: 140px;
          top: auto;
          z-index: 2147483647;
          border: none;
          border-radius: 999px;
          padding: 12px 16px;
          background: #0f766e;
          color: #fff;
          font-size: 13px;
          font-weight: 750;
          cursor: grab;
          user-select: none;
          touch-action: none;
          box-shadow: 0 8px 28px rgba(15,118,110,.45);
        }
        .tab:active { cursor: grabbing; }
        .tab.dragging { opacity: 0.92; cursor: grabbing; }
        .tab.applied { background: #166534; }
        .panel {
          pointer-events: auto;
          position: fixed;
          top: 0; left: 0;
          width: min(360px, 92vw);
          height: 100vh;
          background: #fff;
          color: #14201b;
          border-right: 1px solid #d7e0db;
          box-shadow: 12px 0 40px rgba(20,32,27,.14);
          transform: translateX(-105%);
          transition: transform .2s ease;
          display: flex;
          flex-direction: column;
          z-index: 2147483646;
        }
        .panel.open { transform: translateX(0); }
        .hdr {
          display: flex; justify-content: space-between; align-items: center;
          padding: 14px 16px; background: #f4f7f5; border-bottom: 1px solid #e5ece8;
        }
        .brand { font-weight: 800; color: #0f766e; font-size: 15px; }
        .x { border: none; background: transparent; font-size: 18px; cursor: pointer; color: #5b6b63; }
        .body { padding: 16px; overflow: auto; flex: 1; }
        .status {
          display: inline-flex; border-radius: 999px; padding: 4px 10px;
          font-size: 12px; font-weight: 700; margin-bottom: 12px; background: #e7eef0; color: #334155;
        }
        .status.applied { background: #dcfce7; color: #166534; }
        .status.error { background: #fee2e2; color: #991b1b; }
        .badge {
          display: inline-flex; border-radius: 999px; padding: 4px 10px; margin: -4px 0 12px 8px;
          font-size: 11px; font-weight: 700;
        }
        .badge.low { background: #fef3c7; color: #92400e; }
        h1 { font-size: 18px; margin: 0 0 6px; line-height: 1.25; }
        .co { font-size: 14px; color: #475569; margin: 0 0 12px; }
        .fields { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
        .fields label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; font-weight: 700; color: #475569; }
        .fields input, .fields textarea {
          border: 1px solid #cbd5e1; border-radius: 8px; padding: 9px 10px;
          font-size: 13px; font-weight: 600; color: #14201b; background: #fff;
          font-family: inherit; width: 100%; box-sizing: border-box;
        }
        .fields textarea { resize: vertical; min-height: 52px; line-height: 1.35; }
        .fields input:focus, .fields textarea:focus { outline: 2px solid #99f6e4; border-color: #0f766e; }
        .hint { margin-top: 12px; padding: 12px; border-radius: 10px; background: #ecfeff; color: #155e75; font-size: 12px; line-height: 1.45; }
        .hint.err { background: #fef2f2; color: #991b1b; }
        .actions { display: flex; flex-direction: column; gap: 8px; }
        button.act, a.act {
          display: block; width: 100%; text-align: center; border: none; border-radius: 8px;
          padding: 11px 14px; font-size: 14px; font-weight: 650; cursor: pointer; text-decoration: none;
        }
        .primary { background: #0f766e; color: #fff; }
        .dark { background: #0f172a; color: #fff; }
        .ghost { background: #f1f5f9; color: #0f766e; }
        .q { font-size: 11px; font-weight: 700; color: #475569; margin-bottom: 6px; }
        .fillsummary { display: flex; flex-direction: column; gap: 6px; margin: 4px 0 4px; }
        .filled-hint { font-size: 12px; color: #166534; background: #f0fdf4; border-radius: 8px; padding: 8px 10px; }
        .unmatched { border: 1px solid #fde68a; background: #fffbeb; border-radius: 10px; padding: 8px 10px; }
        .unmatched .q { color: #92400e; margin-bottom: 6px; }
        .ua { font-size: 12px; color: #78350f; padding: 3px 0; border-top: 1px dashed #fde68a; }
        .ua:first-of-type { border-top: none; }
      </style>
      <button class="tab" id="tab" type="button">ApplyTrack</button>
      <aside class="panel" id="panel">
        <header class="hdr">
          <div class="brand">ApplyTrack</div>
          <button class="x" id="close" type="button" title="Close">×</button>
        </header>
        <div class="body" id="body"></div>
      </aside>
    `;

    const tab = shadow.getElementById("tab");
    const panel = shadow.getElementById("panel");
    const body = shadow.getElementById("body");
    shadow.getElementById("close").onclick = () => setOpen(false);

    // Restore / drag the floating pill anywhere on screen
    function applyTabPos(pos) {
      if (!pos || typeof pos.left !== "number" || typeof pos.top !== "number") return;
      const maxL = Math.max(8, window.innerWidth - tab.offsetWidth - 8);
      const maxT = Math.max(8, window.innerHeight - tab.offsetHeight - 8);
      const left = Math.min(maxL, Math.max(8, pos.left));
      const top = Math.min(maxT, Math.max(8, pos.top));
      tab.style.left = `${left}px`;
      tab.style.top = `${top}px`;
      tab.style.bottom = "auto";
      tab.style.right = "auto";
    }

    try {
      chrome.storage.sync.get(["tabPos"], (cfg) => {
        if (!cfg.tabPos) return;
        // Wait a frame so offsetWidth is real (else clamp can push pill off-screen)
        requestAnimationFrame(() => applyTabPos(cfg.tabPos));
      });
    } catch {
      /* ignore */
    }

    let drag = null;
    tab.addEventListener("pointerdown", (e) => {
      if (e.button != null && e.button !== 0) return;
      drag = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origLeft: tab.getBoundingClientRect().left,
        origTop: tab.getBoundingClientRect().top,
        moved: false,
      };
      tab.setPointerCapture(e.pointerId);
      tab.classList.add("dragging");
      e.preventDefault();
    });
    tab.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) drag.moved = true;
      if (!drag.moved) return;
      applyTabPos({ left: drag.origLeft + dx, top: drag.origTop + dy });
    });
    tab.addEventListener("pointerup", (e) => {
      if (!drag || e.pointerId !== drag.pointerId) return;
      const wasDrag = drag.moved;
      const rect = tab.getBoundingClientRect();
      tab.classList.remove("dragging");
      try {
        tab.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (wasDrag) {
        const pos = { left: rect.left, top: rect.top };
        applyTabPos(pos);
        try {
          chrome.storage.sync.set({ tabPos: pos });
        } catch {
          /* ignore */
        }
      } else {
        setOpen(!open);
      }
      drag = null;
    });
    tab.addEventListener("pointercancel", () => {
      tab.classList.remove("dragging");
      drag = null;
    });
    window.addEventListener("resize", () => {
      const rect = tab.getBoundingClientRect();
      applyTabPos({ left: rect.left, top: rect.top });
    });

    function mount() {
      (document.body || document.documentElement).appendChild(host);
    }
    if (document.body) mount();
    else document.addEventListener("DOMContentLoaded", mount, { once: true });

    function alive() {
      try {
        return Boolean(chrome?.runtime?.id);
      } catch {
        return false;
      }
    }

    async function send(type, payload) {
      if (!alive()) {
        dead = true;
        return { ok: false, error: "reload_required" };
      }
      try {
        return await chrome.runtime.sendMessage({ type, payload });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/invalidated|port closed/i.test(msg)) dead = true;
        return { ok: false, error: msg };
      }
    }

    function setOpen(v) {
      open = v;
      panel.classList.toggle("open", v);
      if (v) {
        if (!parsed) parsed = parseJobPage();
        void refresh(true);
      }
    }

    function paintTab() {
      tab.classList.toggle("applied", found && !stale);
      if (dead) tab.textContent = "Reload tab";
      else if (found && stale) tab.textContent = "Re-apply?";
      else if (found) tab.textContent = STATUS[application?.status] || "Sent";
      else tab.textContent = "ApplyTrack";
    }

    function displayIdentity() {
      const src = parsed?.source;
      let role = parsed?.role || "Job posting";
      let company = parsed?.company || "Unknown company";
      const roleWeak =
        typeof isWeakRole === "function"
          ? isWeakRole(role, src)
          : !role || role === "Job posting" || role === "Unknown role";
      const companyWeak =
        typeof isWeakCompany === "function"
          ? isWeakCompany(company, src)
          : !company || company === "Unknown company" || company === "Unknown";
      // Applied / tracked: prefer solid DB fields over loading chrome still on the page
      if (found && application) {
        const appRole = (application.role || "").trim();
        const appCo = (application.company || "").trim();
        const appRoleOk =
          appRole &&
          (typeof isWeakRole === "function" ? !isWeakRole(appRole, src) : true) &&
          appRole !== "Unknown role";
        const appCoOk =
          appCo &&
          (typeof isWeakCompany === "function" ? !isWeakCompany(appCo, src) : true) &&
          appCo !== "Unknown";
        if (roleWeak && appRoleOk) role = appRole;
        if (companyWeak && appCoOk) company = appCo;
      }
      return { role, company, roleWeak: roleWeak && !(found && application?.role) };
    }

    function render() {
      paintTab();
      if (!open) return;
      const { role, company } = displayIdentity();
      let statusClass = "";
      let statusText = "Not tracked yet";
      if (dead || error === "reload_required") {
        statusClass = "error";
        statusText = "Reload this tab";
      } else if (error === "not_configured") {
        statusClass = "error";
        statusText = "Not configured";
      } else if (error) {
        statusClass = "error";
        statusText = "Error";
      } else if (found && stale) {
        statusText = "Sent before";
      } else if (found) {
        statusClass = "applied";
        statusText = STATUS[application?.status] || "Sent";
      }

      const canEdit = !found || stale;
      const weakTitle =
        typeof isWeakRole === "function"
          ? isWeakRole(role, parsed?.source)
          : !role || role === "Job posting";
      const reqId =
        parsed?.reqId ||
        (parsed?.jobKey && String(parsed.jobKey).match(/^(?:workday|taleo|dayforce):(.+)$/i)?.[1]) ||
        "";
      const showReqId = Boolean(reqId) || parsed?.source === "workday";
      const lowConfidence = canEdit && parsed?.captureConfidence === "low";

      let html = `
        <div class="status ${statusClass}">${escapeHtml(statusText)}</div>
        ${lowConfidence ? `<div class="badge low">Low confidence — edit if wrong</div>` : ""}
        ${
          canEdit
            ? `<div class="fields">
                <label>Role
                  <textarea id="role" rows="2" placeholder="e.g. Software Engineer" autocomplete="off">${escapeHtml(weakTitle ? "" : role)}</textarea>
                </label>
                <label>Company
                  <input id="company" type="text" value="${escapeHtml(
                    company === "Unknown company" || company === "Unknown" ? "" : company,
                  )}" placeholder="e.g. Acme Inc" autocomplete="off" />
                </label>
                ${
                  showReqId
                    ? `<label>Job ID
                        <input id="reqId" type="text" value="${escapeHtml(reqId)}" placeholder="e.g. R-108283" autocomplete="off" />
                      </label>`
                    : ""
                }
              </div>`
            : `<h1>${escapeHtml(role)}</h1><p class="co">${escapeHtml(company)}</p>${
                reqId ? `<p class="co">Job ID: ${escapeHtml(reqId)}</p>` : ""
              }`
        }
        ${autoNote ? `<p class="hint">${escapeHtml(autoNote)}</p>` : ""}
        <p class="hint">Answers you type are saved for this company when you Submit. Next visit → auto-fill.</p>
        <div class="actions">
          <button class="act ghost" id="refill" ${filling || busy ? "disabled" : ""}>
            ${filling ? "Filling…" : "Re-fill saved answers"}
          </button>
      `;

      if (fillError) html += `<p class="hint err">${escapeHtml(fillError)}</p>`;
      if (filledMatches.length || unmatchedFields.length) {
        html += `<div class="fillsummary">`;
        if (filledLearnedCount) {
          html += `<p class="filled-hint">Auto-filled ${filledLearnedCount} saved answer${filledLearnedCount === 1 ? "" : "s"} for this company.</p>`;
        }
        if (unmatchedFields.length) {
          html += `<div class="unmatched"><div class="q">New questions (type once — saved on Submit) (${unmatchedFields.length})</div>`;
          unmatchedFields.forEach((u) => {
            html += `<div class="ua">${escapeHtml(u.label)}</div>`;
          });
          html += `</div>`;
        }
        html += `</div>`;
      }

      if (dead || error === "reload_required") {
        html += `<p class="hint err">Extension reloaded — refresh this page (⌘R).</p>`;
      } else if (error === "not_configured") {
        html += `<p class="hint">Popup → set API base + token from the dashboard.</p>`;
      } else if (found && stale) {
        html += `<button class="act primary" id="newcycle">Start new application cycle</button>
          <a class="act ghost" href="https://applytrack-rust.vercel.app/dashboard" target="_blank">View previous →</a>`;
      } else if (found) {
        html += `<a class="act ghost" href="https://applytrack-rust.vercel.app/dashboard" target="_blank">Edit in job tracker →</a>`;
      } else {
        html += `<button class="act primary" id="mark">Mark Sent</button>
          <button class="act ghost" id="save">Save for later</button>
          <p class="hint">Captured details stay locked through Apply/Submit. Edit above only if capture missed.</p>`;
      }
      if (error && error !== "not_configured" && error !== "reload_required") {
        html += `<p class="hint err">${escapeHtml(error)}</p>`;
      }
      html += `</div>`;
      body.innerHTML = html;

      const syncManual = () => {
        const roleIn = body.querySelector("#role");
        const companyIn = body.querySelector("#company");
        const reqIn = body.querySelector("#reqId");
        if (!roleIn && !companyIn && !reqIn) return;
        if (typeof lockManualJob === "function") {
          parsed = lockManualJob(companyIn?.value, roleIn?.value, parsed || parseJobPage());
        } else if (parsed) {
          if (roleIn?.value.trim()) parsed.role = roleIn.value.trim();
          if (companyIn?.value.trim()) parsed.company = companyIn.value.trim();
        }
        if (parsed && reqIn) {
          const id = reqIn.value.trim().toUpperCase();
          parsed.reqId = id;
          if (id && parsed.source === "workday") {
            parsed.jobKey = `workday:${id.replace(/\s+/g, "")}`;
          }
        }
      };
      body.querySelector("#role")?.addEventListener("change", syncManual);
      body.querySelector("#company")?.addEventListener("change", syncManual);
      body.querySelector("#reqId")?.addEventListener("change", syncManual);
      body.querySelector("#refill")?.addEventListener("click", () => fillFromCompanyMemory());
      body.querySelector("#mark")?.addEventListener("click", () => save("applied"));
      body.querySelector("#save")?.addEventListener("click", () => save("saved"));
      body.querySelector("#newcycle")?.addEventListener("click", () =>
        save("applied", { newCycle: true }),
      );
    }

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function visible(node) {
      if (!(node instanceof HTMLElement)) return false;
      const st = getComputedStyle(node);
      if (st.display === "none" || st.visibility === "hidden") return false;
      const r = node.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }

    function isJunkLabel(t) {
      const s = String(t || "").trim();
      if (!s) return true;
      // Lever/Ashby internal names like cards[uuid][field0]
      if (/^cards?\s*\[/i.test(s) || /\[[0-9a-f-]{8,}\]/i.test(s)) return true;
      if (/^[a-z_]+\[\d+\]$/i.test(s)) return true;
      if (/^(field|input|question)[_-]?\d+$/i.test(s)) return true;
      return false;
    }

    function labelFor(input) {
      const clean = (raw) => {
        const t = String(raw || "")
          .replace(/\s+/g, " ")
          .replace(/\*$/, "")
          .trim();
        return isJunkLabel(t) ? "" : t;
      };

      if (input.id) {
        try {
          const byFor = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
          const t = clean(byFor?.innerText);
          if (t.length > 2) return t;
        } catch {
          /* ignore */
        }
      }
      const parentLabel = input.closest("label");
      if (parentLabel) {
        const clone = parentLabel.cloneNode(true);
        clone.querySelectorAll("input,textarea,select,button").forEach((n) => n.remove());
        const t = clean(clone.innerText);
        if (t.length > 2) return t;
      }

      const aria = clean(input.getAttribute("aria-label"));
      if (aria.length > 2) return aria;

      // Lever / custom boards: question text in nearby heading or application-question block
      const block = input.closest(
        "[class*='application-question'], [class*='ApplicationField'], [class*='question'], [data-qa*='question'], fieldset, .form-group, li, section",
      );
      if (block) {
        const heading = block.querySelector(
          "label, .application-label, [class*='label'], [class*='Label'], h3, h4, h5, legend, p, span",
        );
        const t = clean(heading?.innerText);
        if (t.length > 2 && t.length < 280) return t;
        // First non-input text node chunk
        const blockText = clean(
          Array.from(block.querySelectorAll("div,p,span,label"))
            .map((el) => el.innerText)
            .find((x) => x && x.trim().length > 12 && !isJunkLabel(x) && !x.includes(input.value || "xxx")),
        );
        if (blockText.length > 2 && blockText.length < 280) return blockText;
      }

      // Previous sibling text (common on Lever)
      let sib = input.previousElementSibling;
      for (let n = 0; n < 4 && sib; n++, sib = sib.previousElementSibling) {
        const t = clean(sib.innerText);
        if (t.length > 2 && t.length < 280) return t;
      }

      const ph = clean(input.getAttribute("placeholder"));
      if (ph.length > 2) return ph;

      // Never fall back to name=cards[uuid][fieldN]
      return "";
    }

    function fieldValue(el) {
      if (!el) return "";
      if (el.isContentEditable) return (el.innerText || el.textContent || "").trim();
      return String(el.value || "").trim();
    }

    function scrapeFields() {
      const nodes = [
        ...document.querySelectorAll("textarea"),
        ...document.querySelectorAll('input[type="text"]'),
        ...document.querySelectorAll("input:not([type])"),
        ...document.querySelectorAll("[contenteditable='true']"),
      ];
      const out = [];
      let i = 0;
      for (const input of nodes) {
        if (!visible(input) || input.disabled) continue;
        const label = labelFor(input);
        if (!label || label.length < 8) continue;
        const value = fieldValue(input);
        const isLong =
          input.tagName === "TEXTAREA" ||
          input.isContentEditable ||
          value.length >= 40 ||
          /why|describe|tell|experience|about|cover|motivat|interest|challenge|project|explain|visa|sponsor|authoriz|work\s*permit|relocat|remote|hybrid|onsite|salary|compensation|start\s*date|available\s*to\s*start|notice\s*period|\bai\b|\bllm\b|machine\s*learning|\btest(ing)?\b|playwright|cypress|\bqa\b|\baws\b|\bazure\b|\bgcp\b|cloud|microservice|startup|proud|accomplishment|additional|anything else|hear about/i.test(
            label,
          );
        if (!isLong) continue;
        const id = `q_${i++}`;
        out.push({ id, label, el: input, currentValue: value });
      }
      scraped = out;
      return out.map(({ id, label, currentValue }) => ({ id, label, currentValue }));
    }

    function fillField(id, answer) {
      const field = scraped.find((f) => f.id === id);
      if (!field) return;
      const input = field.el;
      input.focus();
      const proto = input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, "value");
      if (desc?.set) desc.set.call(input, answer);
      else input.value = answer;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    /**
     * "Remember answers I typed" — scrape currently-filled long-form fields and
     * persist any non-empty, non-contact-info values via chrome.storage.local
     * (see extension/learned-answers.js). Never blocks the caller on failure.
     */
    async function persistLearnedEntries(entries, companyName) {
      if (!entries?.length || typeof mergeLearnedAnswers !== "function") return 0;
      let storageLocal;
      try {
        if (!chrome?.runtime?.id) return 0;
        storageLocal = chrome?.storage?.local;
      } catch {
        return 0;
      }
      if (typeof storageLocal?.get !== "function" || typeof storageLocal?.set !== "function") {
        return 0;
      }
      const company = companyName || parsed?.company || "";
      const companyKey = typeof companyKeyFromName === "function" ? companyKeyFromName(company) : "";
      // Write chrome.storage.local directly — more reliable than messaging during navigation.
      let learnedAnswers;
      try {
        const got = await storageLocal.get("learnedAnswers");
        learnedAnswers = got?.learnedAnswers;
      } catch {
        return 0;
      }
      const { store, learnedCount } = mergeLearnedAnswers(
        {
          byQuestion: learnedAnswers?.byQuestion || {},
          byCompany: learnedAnswers?.byCompany || {},
        },
        { companyKey, entries },
      );
      try {
        await storageLocal.set({ learnedAnswers: store });
      } catch {
        return 0;
      }
      return learnedCount;
    }

    async function learnAnswersFromPage(companyName) {
      try {
        if (looksLikeAuthPage()) return 0;
        const entries = bufferAnswersFromPage(companyName || parsed?.company);
        if (!entries.length && !draftEntryCount()) return 0;
        return await flushDraftToLearned(entries, companyName || parsed?.company);
      } catch (err) {
        console.warn("[ApplyTrack] learnAnswersFromPage failed", err);
        return 0;
      }
    }

    // Buffer answers as the user types (sessionStorage) so Submit/thank-you still works.
    let learnDebounce = null;
    const scheduleBuffer = () => {
      if (learnDebounce) clearTimeout(learnDebounce);
      learnDebounce = setTimeout(() => {
        bufferAnswersFromPage(parsed?.company);
      }, 400);
    };
    document.addEventListener("input", scheduleBuffer, true);
    document.addEventListener("change", scheduleBuffer, true);

    async function refreshParsed() {
      let next = typeof parseJobPage === "function" ? parseJobPage() : parsed;
      if (typeof enrichGreenhouseFromApi === "function" && next?.source === "greenhouse") {
        next = await enrichGreenhouseFromApi(next);
      }
      if (typeof resolveJobPayload === "function") next = resolveJobPayload(next);
      return next;
    }

    async function refresh(forceRender) {
      parsed = await refreshParsed();
      error = null;
      const res = await send("LOOKUP", { ...parsed, url: location.href });
      if (!res?.ok) {
        error = res?.error || "lookup_failed";
        found = false;
        application = null;
      } else {
        found = Boolean(res.found);
        stale = Boolean(res.stale);
        application = res.application || null;
        // Backfill weak page/lock from a solid saved application (or vice versa)
        if (found && application) {
          const src = parsed?.source || application.source;
          const roleWeak =
            !parsed?.role ||
            (typeof isWeakRole === "function" && isWeakRole(parsed.role, src));
          const coWeak =
            !parsed?.company ||
            (typeof isWeakCompany === "function" && isWeakCompany(parsed.company, src));
          const appRoleOk =
            application.role &&
            !(typeof isWeakRole === "function" && isWeakRole(application.role, src));
          const appCoOk =
            application.company &&
            !(typeof isWeakCompany === "function" && isWeakCompany(application.company, src));
          if ((roleWeak && appRoleOk) || (coWeak && appCoOk)) {
            parsed = {
              ...parsed,
              role: roleWeak && appRoleOk ? application.role : parsed.role,
              company: coWeak && appCoOk ? application.company : parsed.company,
              jobKey: parsed?.jobKey || application.jobKey,
              source: parsed?.source || application.source,
            };
            if (typeof resolveJobPayload === "function") {
              parsed = resolveJobPayload(parsed);
            }
          }
        }
        if (found && !stale && parsed?.jobKey) {
          try {
            sessionStorage.setItem(`applytrack:autolog:${parsed.jobKey}`, "1");
          } catch {
            /* ignore */
          }
        }
      }
      paintTab();
      if (open || forceRender) render();
    }

    async function save(status, opts = {}) {
      parsed =
        typeof resolveJobPayload === "function"
          ? resolveJobPayload(parsed || parseJobPage())
          : parsed || parseJobPage();
      // Panel fields: only override when the user typed a real title.
      // Never let wizard chrome ("Manual Application") force-overwrite a solid lock.
      const roleIn = body.querySelector("#role");
      const companyIn = body.querySelector("#company");
      const reqIn = body.querySelector("#reqId");
      if (roleIn || companyIn) {
        if (typeof lockManualJob === "function") {
          parsed =
            lockManualJob(companyIn?.value, roleIn?.value, parsed) || parsed;
        } else {
          const typedRole = roleIn?.value.trim() || "";
          const typedCo = companyIn?.value.trim() || "";
          if (typedRole && !(typeof isWeakRole === "function" && isWeakRole(typedRole, parsed?.source))) {
            parsed.role = typedRole;
          }
          if (typedCo && !(typeof isWeakCompany === "function" && isWeakCompany(typedCo, parsed?.source))) {
            parsed.company = typedCo;
          }
        }
      }
      if (parsed && reqIn?.value.trim()) {
        const id = reqIn.value.trim().toUpperCase().replace(/\s+/g, "").replace(/^WORKDAY:/i, "");
        parsed.reqId = id;
        if (parsed.source === "workday" && id) parsed.jobKey = `workday:${id}`;
      }
      // Re-assert solid lock after panel merge
      if (typeof resolveJobPayload === "function") {
        parsed = resolveJobPayload(parsed);
      }
      // Oracle (and similar): never save profile pages without a real job id
      // unless the user typed a title manually.
      const manualOk =
        parsed?.manual &&
        typeof isWeakRole === "function" &&
        !isWeakRole(parsed.role, parsed?.source);
      if (parsed.source === "oracle" && !parsed.jobKey && !manualOk) {
        error = "Open the job page (…/job/####), or type the role/company above.";
        if (open) render();
        return;
      }
      if (typeof isWeakRole === "function" && isWeakRole(parsed.role, parsed?.source)) {
        error = "Enter the job title (and company) above, then try again.";
        setOpen(true);
        render();
        return;
      }
      busy = true;
      if (open) render();
      const res = await send("SAVE", {
        ...parsed,
        url: parsed.url || location.href,
        status,
        newCycle: Boolean(opts.newCycle),
        // Keep ATS source — never flip a locked Dayforce/etc. row to "manual"
        // unless there was never an ATS jobKey.
        ...(parsed.manual && (!parsed.jobKey || String(parsed.jobKey).startsWith("manual:"))
          ? { manual: true, source: "manual" }
          : {}),
      });
      busy = false;
      if (!res?.ok) {
        error = res?.error || "save_failed";
        if (open) render();
        return;
      }
      found = true;
      stale = false;
      application = res.application;
      error = null;
      try {
        if (parsed?.jobKey) sessionStorage.setItem(`applytrack:autolog:${parsed.jobKey}`, "1");
      } catch {
        /* ignore */
      }
      // Learn from whatever the user typed before this Mark Sent / Save for later.
      void learnAnswersFromPage(parsed?.company);
      if (opts.auto) {
        autoNote = "Logged as sent after the site confirmed your submission.";
        setOpen(true);
      } else {
        setOpen(true);
        render();
      }
      paintTab();
    }

    /** Fill only from answers saved for this company (and global fallbacks). No profile bank. */
    async function fillFromCompanyMemory() {
      filling = true;
      fillError = null;
      filledMatches = [];
      filledLearnedCount = 0;
      unmatchedFields = [];
      setOpen(true);
      render();
      const questions = scrapeFields();
      if (!questions.length) {
        filling = false;
        fillError = "No questions found yet — open the application form.";
        render();
        return;
      }
      const companyKey =
        typeof companyKeyFromName === "function" ? companyKeyFromName(parsed?.company || "") : "";
      const learnedRes = await send("LOOKUP_LEARNED", { questions, companyKey });
      filling = false;
      if (!learnedRes?.ok) {
        fillError = learnedRes?.error || "Could not load saved answers";
        unmatchedFields = questions;
        render();
        return;
      }
      const learnedMatches = learnedRes.answers || [];
      const filledIds = new Set(learnedMatches.map((m) => m.id));
      learnedMatches.forEach((m) => fillField(m.id, m.answer));
      filledLearnedCount = learnedMatches.length;
      filledMatches = learnedMatches;
      unmatchedFields = questions.filter((q) => !filledIds.has(q.id) && !q.currentValue);
      render();
    }

    // Expose for popup "Show on this tab"
    window.__applytrackOpen = () => setOpen(true);

    try {
      parsed = typeof parseJobPage === "function" ? parseJobPage() : null;
    } catch (err) {
      console.warn("[ApplyTrack] parseJobPage failed", err);
      parsed = {
        company: "",
        role: document.title || "Job posting",
        url: location.href,
        jobKey: null,
        source: "web",
      };
    }
    paintTab();
    void refresh(false);

    // Auto-fill from this company's saved answers when the application form opens.
    let autoFilledOnce = false;
    async function maybeAutoFillLearned() {
      if (autoFilledOnce) return;
      const onAppForm =
        /\/application\b|\/apply\b|oneclick|manualapplication|applicantflow/i.test(location.href) ||
        document.querySelectorAll("textarea").length >= 1;
      if (!onAppForm) return;
      const questions = scrapeFields();
      const empty = questions.filter((q) => !q.currentValue);
      if (empty.length < 1) return;
      autoFilledOnce = true;
      await fillFromCompanyMemory();
      if (filledMatches.length) {
        autoNote = `Auto-filled ${filledMatches.length} answer${filledMatches.length === 1 ? "" : "s"} from your past ${parsed?.company || "company"} applications.`;
        setOpen(true);
        render();
      }
    }
    setTimeout(() => void maybeAutoFillLearned(), 1200);
    setTimeout(() => void maybeAutoFillLearned(), 3500);

    // SPA boards often hydrate the title after first paint
    if (
      parsed?.source === "greenhouse" ||
      parsed?.source === "ashby" ||
      parsed?.source === "pinpoint" ||
      parsed?.source === "rippling" ||
      parsed?.source === "taleo" ||
      parsed?.source === "dayforce" ||
      parsed?.source === "paycom" ||
      parsed?.source === "teamtailor" ||
      parsed?.source === "smartrecruiters" ||
      parsed?.source === "successfactors" ||
      parsed?.source === "paylocity" ||
      parsed?.source === "ultipro" ||
      parsed?.source === "phenom" ||
      parsed?.source === "workday" ||
      parsed?.source === "salesforce" ||
      parsed?.source === "bamboohr" ||
      parsed?.source === "workable" ||
      parsed?.source === "adp" ||
      parsed?.source === "oracle" ||
      location.hostname.includes("greenhouse") ||
      location.hostname.includes("ashbyhq") ||
      location.hostname.includes("pinpointhq") ||
      location.hostname.includes("rippling") ||
      location.hostname.includes("taleo") ||
      location.hostname.includes("dayforce") ||
      location.hostname.includes("paycom") ||
      location.hostname.includes("teamtailor") ||
      location.hostname.includes("smartrecruiters") ||
      location.hostname.includes("successfactors") ||
      location.hostname.includes("paylocity") ||
      location.hostname.includes("ultipro") ||
      location.hostname.includes("phenom") ||
      location.hostname.includes("workday") ||
      location.hostname.includes("salesforce-sites") ||
      location.hostname.includes("bamboohr") ||
      location.hostname.includes("workable") ||
      location.hostname.includes("adp.com") ||
      location.hostname.includes("oraclecloud.com") ||
      new URLSearchParams(location.search).get("gh_jid")
    ) {
      setTimeout(() => {
        if (!dead) void refresh(false);
      }, 1500);
      setTimeout(() => {
        if (!dead) void refresh(false);
      }, 3500);
      // Custom-domain Greenhouse embeds can take longer than 3.5s
      if (parsed?.source === "greenhouse" || new URLSearchParams(location.search).get("gh_jid")) {
        setTimeout(() => {
          if (!dead) void refresh(false);
        }, 6000);
      }
    }

    let last = location.href;
    setInterval(() => {
      if (dead || !alive()) {
        dead = true;
        paintTab();
        return;
      }
      if (location.href !== last) {
        last = location.href;
        parsed = parseJobPage();
        if (open) void refresh(true);
        else void refresh(false);
      }
    }, 2000);
  }

  function startAutoApply() {
    let lastClick = 0;
    let pending = null; // { startedAt, href }
    let thankYouLogged = false;
    let watchTimer = null;

    function loggedKey(jobKey) {
      return `applytrack:autolog:${jobKey}`;
    }

    function alreadyLogged(jobKey) {
      if (!jobKey) return false;
      try {
        return sessionStorage.getItem(loggedKey(jobKey)) === "1";
      } catch {
        return false;
      }
    }

    function markLogged(jobKey) {
      if (!jobKey) return;
      try {
        sessionStorage.setItem(loggedKey(jobKey), "1");
      } catch {
        /* ignore */
      }
    }

    function clickText(el) {
      if (!(el instanceof HTMLElement)) return "";
      return `${el.innerText || ""} ${el.value || ""} ${el.getAttribute("aria-label") || ""} ${el.getAttribute("title") || ""}`
        .trim()
        .replace(/\s+/g, " ");
    }

    function pageText(limit = 4000) {
      return `${document.title} ${(document.body?.innerText || "").slice(0, limit)}`;
    }

    const SUCCESS_COPY =
      /thank you for apply(ing|ication)|thanks for apply(ing|ication)|thank you for (your )?(application|interest)|application (has been |was )?(successfully )?submitted|successfully (applied|submitted)|we have received your application|application received|application complete|your application was submitted|submitted successfully|thanks for applying|you(r application)? (has been|was) (successfully )?submitted|you('ve| have) successfully submitted|your application has been submitted/i;

    function confirmationChromeText() {
      const bits = [document.title];
      const nodes = document.querySelectorAll(
        "h1, h2, h3, [role='alert'], [role='status'], [data-ui*='success' i], [data-ui*='thank' i], [data-ui*='complete' i], [class*='success' i], [class*='thank' i], [class*='submitted' i]",
      );
      let n = 0;
      for (const el of nodes) {
        if (!(el instanceof HTMLElement)) continue;
        const t = (el.innerText || "").trim();
        if (!t || t.length > 400) continue;
        bits.push(t);
        if (++n >= 24) break;
      }
      return bits.join("\n");
    }

    function looksSuccessful() {
      const href = location.href.toLowerCase();
      const host = location.hostname.toLowerCase();
      // Greenhouse / Workday / common ATS confirmation URLs
      if (
        /\/confirmation\b|mode=submit_apply|application[_-]?submitted|thank[_-]?you|\/applicationcomplete|\/appsuccess|submitted=true|\/apply\/?.*(confirm|success|thank)|submittedapplication|applicationreceived/i.test(
          href,
        )
      ) {
        return true;
      }
      // Short confirmation chrome first (avoids missing banners below a long JD)
      if (SUCCESS_COPY.test(confirmationChromeText())) return true;

      const text = pageText();
      // Workday confirmation automation ids
      if (
        document.querySelector(
          '[data-automation-id="applyFlowSubmittedPage"], [data-automation-id="successfullyApplied"], [data-automation-id="submittedPage"]',
        )
      ) {
        return true;
      }
      // Workable thank-you often keeps the full JD in the DOM — success copy can sit past 4k
      if (host.includes("workable.com")) {
        if (
          document.querySelector(
            "[data-ui='application-complete'], [data-ui='thank-you'], [data-ui='application-submitted'], [class*='ApplicationSubmitted'], [class*='application-submitted']",
          )
        ) {
          return true;
        }
        if (SUCCESS_COPY.test(pageText(24000))) return true;
      }
      // Paylocity often shows a green check + short success copy
      if (
        document.querySelector(
          "[class*='success'] svg, .fa-check, [class*='checkmark'], [class*='CheckCircle'], img[alt*='success' i]",
        ) &&
        /associat|engineer|consultant|submitted|thank|application|success/i.test(text.slice(0, 800))
      ) {
        // Avoid matching JD pages that happen to have a check icon
        if (!document.querySelector("textarea, input[type='file'], #resume")) {
          return true;
        }
      }
      return SUCCESS_COPY.test(text);
    }

    function looksFailed() {
      const text = pageText();
      // Stay away from matching long JD text — prefer short error chrome
      const errNodes = document.querySelectorAll(
        "[aria-invalid='true'], .error, .field-error, .form-error, [class*='error-message'], [class*='ErrorMessage'], [role='alert']",
      );
      let visibleErr = 0;
      for (const n of errNodes) {
        if (!(n instanceof HTMLElement)) continue;
        const st = getComputedStyle(n);
        if (st.display === "none" || st.visibility === "hidden") continue;
        const t = (n.innerText || "").trim();
        if (t.length > 2 && t.length < 300) visibleErr += 1;
      }
      if (visibleErr >= 1) return true;
      if (
        /please (fix|correct|complete|enter|select|provide)|is required|required field|there (was|were|are) (an )?error|form has \d+ error|invalid (email|phone|entry)|submission failed|unable to submit|could not submit/i.test(
          text.slice(0, 1500),
        )
      ) {
        // Only if we still look like a form page
        if (document.querySelector("form, input[type='submit'], button[type='submit']")) {
          return true;
        }
      }
      return false;
    }

    /** Start application — cache only, never write Applied. */
    function isApplyStart(text) {
      const t = text.trim().replace(/\s+/g, " ");
      return /^(apply|apply now|apply for this job)$/i.test(t);
    }

    /** Final submit — watch for success before writing Applied. */
    function isFinalSubmit(text) {
      const t = text.trim().replace(/\s+/g, " ");
      if (!t || t.length > 100) return false;
      if (/submit(\s+my)?\s+application/i.test(t)) return true;
      if (/send(\s+my)?\s+application/i.test(t)) return true;
      // Workday / Workable / Ashby final CTAs
      if (/^(submit|submit your application)$/i.test(t)) return true;
      if (/^submit$/i.test(t)) return true;
      if (/ashbyhq\.com/i.test(location.hostname) && /\bsubmit\b/i.test(t)) return true;
      // Workable sometimes uses "Send application" variants already covered;
      // also "Apply" on the last step of a short form (host-gated).
      if (
        location.hostname.toLowerCase().includes("workable.com") &&
        /^(apply|submit application|send application)$/i.test(t)
      ) {
        return true;
      }
      return false;
    }

    function currentParsed() {
      if (typeof parseJobPage !== "function") return null;
      const raw = parseJobPage();
      if (typeof resolveJobPayload === "function") return resolveJobPayload(raw);
      if (typeof mergeRememberedJob === "function" && raw?.source) {
        return mergeRememberedJob(raw, raw.source);
      }
      return raw;
    }

    async function saveApplied(reason) {
      try {
        if (!chrome?.runtime?.id) return false;
        let parsed = currentParsed();
        // Workday / Workable thank-you pages sometimes drop ids or titles —
        // fall back to the locked listing captured on the first job page.
        if ((!parsed?.jobKey || (typeof isWeakRole === "function" && isWeakRole(parsed.role, parsed?.source))) &&
            typeof readJobCtx === "function") {
          const latest = readJobCtx("applytrack:job:latest");
          if (latest?.jobKey && !isWeakRole(latest.role, latest.source)) {
            parsed = {
              ...parsed,
              ...latest,
              jobKey: latest.jobKey,
              role: latest.role,
              company: latest.company || parsed?.company,
              url: latest.url || parsed?.url,
              source: latest.source || parsed?.source,
            };
          }
        }
        if (!parsed?.jobKey) return false;
        if (typeof isWeakRole === "function" && isWeakRole(parsed.role, parsed?.source)) return false;
        // Already handled this session — treat as done (don't retry forever)
        if (alreadyLogged(parsed.jobKey)) return true;

        const look = await chrome.runtime.sendMessage({
          type: "LOOKUP",
          payload: { ...parsed, url: parsed.url || location.href },
        });
        if (look?.ok && look.found && !look.stale) {
          markLogged(parsed.jobKey);
          return true;
        }

        const res = await chrome.runtime.sendMessage({
          type: "SAVE",
          payload: {
            ...parsed,
            url: parsed.url || location.href,
            status: "applied",
            newCycle: Boolean(look?.stale),
            notes: reason ? `Auto-logged (${reason})` : "",
          },
        });
        if (!res?.ok) return false;
        markLogged(parsed.jobKey);
        // Backup learn if fields still exist (usually empty after thank-you).
        void learnAnswersOnSubmit();
        if (isTop && typeof window.__applytrackOpen === "function") {
          window.__applytrackOpen();
        }
        return true;
      } catch {
        return false;
      }
    }

    function stopWatch() {
      pending = null;
      if (watchTimer) {
        clearInterval(watchTimer);
        watchTimer = null;
      }
    }

    function startWatch() {
      stopWatch();
      pending = { startedAt: Date.now(), href: location.href };
      watchTimer = setInterval(() => {
        if (!pending) return;
        const elapsed = Date.now() - pending.startedAt;

        if (looksFailed()) {
          stopWatch();
          return; // validation / site error — do not write to DB
        }
        if (looksSuccessful()) {
          stopWatch();
          void saveApplied("submit-success");
          return;
        }
        // Navigated away from the form URL with no errors → treat as success
        if (location.href !== pending.href && elapsed > 1200 && !looksFailed()) {
          if (looksSuccessful() || !document.querySelector("textarea, input[type='file']")) {
            stopWatch();
            void saveApplied("submit-navigated");
            return;
          }
        }
        // Timeout — no confirmation; leave DB untouched (user can Mark Applied)
        // Workday SPAs are slow to show the thank-you view
        const limit = location.hostname.includes("workday") ? 20000 : 12000;
        if (elapsed > limit) {
          stopWatch();
        }
      }, 400);
    }

    function findClickableInPath(e) {
      const path = typeof e.composedPath === "function" ? e.composedPath() : [e.target];
      for (const el of path) {
        if (!(el instanceof HTMLElement)) continue;
        if (el.id === "applytrack-host") return null;
        const root = el.getRootNode?.();
        if (root instanceof ShadowRoot && root.host?.id === "applytrack-host") return null;
        if (
          el.matches?.(
            "button, input[type='submit'], input[type='button'], a[role='button'], [type='submit'], a.button, [class*='submit']",
          )
        ) {
          return el;
        }
      }
      for (const el of path) {
        if (!(el instanceof HTMLElement)) continue;
        const t = clickText(el);
        if ((isFinalSubmit(t) || isApplyStart(t)) && t.length < 40) return el;
      }
      return null;
    }

    function onFinalSubmitGesture() {
      const now = Date.now();
      if (now - lastClick < 800) {
        void learnAnswersOnSubmit();
        return;
      }
      lastClick = now;
      currentParsed();
      // Capture answers NOW — Ashby often navigates and clears fields immediately.
      void learnAnswersOnSubmit();
      startWatch();
    }

    // pointerdown fires before React/Ashby clears the form (earlier than click).
    document.addEventListener(
      "pointerdown",
      (e) => {
        const node = findClickableInPath(e);
        if (!node) return;
        if (
          node.closest?.(
            "#onetrust-banner-sdk, #onetrust-pc-sdk, [id*='cookie'], [class*='cookie'], [id*='consent'], [class*='consent']",
          )
        ) {
          return;
        }
        const text = clickText(node);
        if (isApplyStart(text)) {
          currentParsed();
          return;
        }
        if (!isFinalSubmit(text)) return;
        onFinalSubmitGesture();
      },
      true,
    );

    document.addEventListener(
      "click",
      (e) => {
        const node = findClickableInPath(e);
        if (!node) return;
        if (
          node.closest?.(
            "#onetrust-banner-sdk, #onetrust-pc-sdk, [id*='cookie'], [class*='cookie'], [id*='consent'], [class*='consent']",
          )
        ) {
          return;
        }
        const text = clickText(node);
        if (isApplyStart(text)) {
          currentParsed();
          return;
        }
        if (!isFinalSubmit(text)) return;
        onFinalSubmitGesture();
      },
      true,
    );

    document.addEventListener(
      "submit",
      () => {
        onFinalSubmitGesture();
      },
      true,
    );

    let lastLearnAt = 0;
    /** Buffer live fields + flush draft → chrome.storage.local (survives Ashby thank-you wipe). */
    async function learnAnswersOnSubmit() {
      const now = Date.now();
      if (now - lastLearnAt < 800) return;
      lastLearnAt = now;
      try {
        // Login / SSO / empty wizards — silent no-op (no spam warnings).
        if (looksLikeAuthPage()) return;

        let company = "";
        try {
          if (typeof readJobCtx === "function") {
            company = readJobCtx("applytrack:job:latest")?.company || "";
          }
        } catch {
          /* ignore */
        }
        if (!company) company = currentParsed()?.company || "";

        const hadDraft = draftEntryCount() > 0;
        const live = bufferAnswersFromPage(company);
        if (!hadDraft && !live.length) return;

        const n = await flushDraftToLearned(live, company);
        if (!n && (hadDraft || live.length)) {
          // Had answers buffered/scraped but nothing persisted (filtered or storage unavailable).
          console.warn("[ApplyTrack] submit learn: no draft answers buffered yet");
        }
      } catch (err) {
        console.warn("[ApplyTrack] learnAnswersOnSubmit failed", err);
      }
    }

    // Keep buffering while typing (all frames that have the form).
    let autoBufferTimer = null;
    document.addEventListener(
      "input",
      () => {
        if (autoBufferTimer) clearTimeout(autoBufferTimer);
        autoBufferTimer = setTimeout(() => {
          let company = "";
          try {
            company = typeof readJobCtx === "function" ? readJobCtx("applytrack:job:latest")?.company || "" : "";
          } catch {
            /* ignore */
          }
          bufferAnswersFromPage(company);
        }, 300);
      },
      true,
    );

    // Confirmation page (e.g. landed here after Simplify submit / Workable thank-you)
    async function checkThankYou() {
      if (thankYouLogged) return;
      if (typeof isNoisePage === "function" && isNoisePage()) return;
      if (!looksSuccessful()) return;
      // Only latch after a successful save (or already tracked). SPA thank-you
      // can appear before jobKey/lock is ready — retry on the next interval.
      const ok = await saveApplied("thank-you");
      if (ok) {
        thankYouLogged = true;
        stopWatch();
      }
    }

    void checkThankYou();
    setInterval(() => {
      void checkThankYou();
    }, 2000);
  }
})();
