(function () {
  "use strict";

  // UI only on the top frame — iframes still get click-to-log below.
  const isTop = window === window.top;
  let uiStarted = false;
  let autoStarted = false;

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
      saved: "Saved",
      applied: "Applied",
      oa: "OA",
      interview: "Interview",
      offer: "Offer",
      rejected: "Rejected",
    };

    let open = false;
    let parsed = null;
    let found = false;
    let stale = false;
    let application = null;
    let error = null;
    let busy = false;
    let drafting = false;
    let drafts = [];
    let draftError = null;
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
        .drafts { display: flex; flex-direction: column; gap: 10px; max-height: 40vh; overflow: auto; }
        .card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; background: #f8fafc; }
        .q { font-size: 11px; font-weight: 700; color: #475569; margin-bottom: 6px; }
        .a { font-size: 12px; white-space: pre-wrap; margin-bottom: 8px; }
        .ins { border: 1px solid #cbd5e1; background: #fff; color: #0f766e; border-radius: 6px; padding: 6px 10px; font-size: 12px; cursor: pointer; width: auto; }
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
      else if (found) tab.textContent = STATUS[application?.status] || "Applied";
      else tab.textContent = "ApplyTrack";
    }

    function render() {
      paintTab();
      if (!open) return;
      const role = parsed?.role || "Job posting";
      const company = parsed?.company || "Unknown company";
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
        statusText = "Applied before";
      } else if (found) {
        statusClass = "applied";
        statusText = STATUS[application?.status] || "Applied";
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

      let html = `
        <div class="status ${statusClass}">${escapeHtml(statusText)}</div>
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
        <div class="actions">
          <button class="act dark" id="draft" ${drafting || busy ? "disabled" : ""}>
            ${drafting ? "Drafting…" : "Draft form answers with AI"}
          </button>
      `;

      if (draftError) html += `<p class="hint err">${escapeHtml(draftError)}</p>`;
      if (drafts.length) {
        html += `<button class="act ghost" id="fillall">Insert all (${drafts.length})</button><div class="drafts">`;
        drafts.forEach((d, i) => {
          html += `<div class="card"><div class="q">${escapeHtml(d.label)}</div><div class="a">${escapeHtml(d.answer)}</div>
            <button class="ins" data-i="${i}">Insert</button></div>`;
        });
        html += `</div>`;
      }

      if (dead || error === "reload_required") {
        html += `<p class="hint err">Extension reloaded — refresh this page (⌘R).</p>`;
      } else if (error === "not_configured") {
        html += `<p class="hint">Popup → set API base + token. Dashboard → paste resume.</p>`;
      } else if (found && stale) {
        html += `<button class="act primary" id="newcycle">Start new application cycle</button>
          <a class="act ghost" href="https://applytrack-rust.vercel.app/dashboard" target="_blank">View previous →</a>`;
      } else if (found) {
        html += `<a class="act ghost" href="https://applytrack-rust.vercel.app/dashboard" target="_blank">Edit in job tracker →</a>`;
      } else {
        html += `<button class="act primary" id="mark">Mark Applied</button>
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
      body.querySelector("#draft")?.addEventListener("click", draftAnswers);
      body.querySelector("#mark")?.addEventListener("click", () => save("applied"));
      body.querySelector("#save")?.addEventListener("click", () => save("saved"));
      body.querySelector("#newcycle")?.addEventListener("click", () =>
        save("applied", { newCycle: true }),
      );
      body.querySelector("#fillall")?.addEventListener("click", () => {
        drafts.forEach((d) => fillField(d.id, d.answer));
      });
      body.querySelectorAll(".ins").forEach((btn) => {
        btn.addEventListener("click", () => {
          const d = drafts[Number(btn.getAttribute("data-i"))];
          if (d) fillField(d.id, d.answer);
        });
      });
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

    function labelFor(input) {
      if (input.id) {
        try {
          const byFor = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
          if (byFor) return byFor.innerText.trim().replace(/\s+/g, " ");
        } catch {
          /* ignore */
        }
      }
      const parentLabel = input.closest("label");
      if (parentLabel) {
        const t = parentLabel.innerText.trim().replace(/\s+/g, " ");
        if (t.length > 2) return t;
      }
      return (input.getAttribute("aria-label") || input.getAttribute("placeholder") || input.name || "").trim();
    }

    function scrapeFields() {
      const nodes = [
        ...document.querySelectorAll("textarea"),
        ...document.querySelectorAll('input[type="text"]'),
        ...document.querySelectorAll("input:not([type])"),
      ];
      const out = [];
      let i = 0;
      for (const input of nodes) {
        if (!visible(input) || input.disabled) continue;
        const label = labelFor(input);
        if (!label || label.length < 12) continue;
        const isLong =
          input.tagName === "TEXTAREA" ||
          /why|describe|tell|experience|about|cover|motivat|interest|challenge|project|explain/i.test(
            label,
          );
        if (!isLong) continue;
        const id = `q_${i++}`;
        out.push({ id, label, el: input, currentValue: input.value || "" });
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

    async function refresh(forceRender) {
      parsed = typeof resolveJobPayload === "function"
        ? resolveJobPayload(parseJobPage())
        : parseJobPage();
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
      if (opts.auto) {
        autoNote = "Logged Applied after the site confirmed your submission.";
        setOpen(true);
      } else {
        setOpen(true);
        render();
      }
      paintTab();
    }

    async function draftAnswers() {
      drafting = true;
      draftError = null;
      drafts = [];
      setOpen(true);
      render();
      const questions = scrapeFields();
      if (!questions.length) {
        drafting = false;
        draftError = "No long-form questions found. Open the application form, then try again.";
        render();
        return;
      }
      const res = await send("DRAFT_ANSWERS", {
        questions,
        company: parsed?.company || "",
        role: parsed?.role || "",
      });
      drafting = false;
      if (!res?.ok) {
        draftError = res?.error || "Draft failed";
        render();
        return;
      }
      const byId = Object.fromEntries((res.answers || []).map((a) => [a.id, a.answer]));
      drafts = scraped
        .map((f) => ({ id: f.id, label: f.label, answer: byId[f.id] || "" }))
        .filter((d) => d.answer);
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
    // SPA boards often hydrate the title after first paint
    if (
      parsed?.source === "greenhouse" ||
      parsed?.source === "taleo" ||
      parsed?.source === "dayforce" ||
      parsed?.source === "paycom" ||
      parsed?.source === "successfactors" ||
      parsed?.source === "paylocity" ||
      parsed?.source === "ultipro" ||
      parsed?.source === "phenom" ||
      parsed?.source === "workday" ||
      parsed?.source === "salesforce" ||
      parsed?.source === "bamboohr" ||
      parsed?.source === "workable" ||
      parsed?.source === "adp" ||
      location.hostname.includes("greenhouse") ||
      location.hostname.includes("taleo") ||
      location.hostname.includes("dayforce") ||
      location.hostname.includes("paycom") ||
      location.hostname.includes("successfactors") ||
      location.hostname.includes("paylocity") ||
      location.hostname.includes("ultipro") ||
      location.hostname.includes("phenom") ||
      location.hostname.includes("workday") ||
      location.hostname.includes("salesforce-sites") ||
      location.hostname.includes("bamboohr") ||
      location.hostname.includes("workable") ||
      location.hostname.includes("adp.com")
    ) {
      setTimeout(() => {
        if (!dead) {
          parsed = parseJobPage();
          void refresh(false);
        }
      }, 1500);
      setTimeout(() => {
        if (!dead) {
          parsed = parseJobPage();
          void refresh(false);
        }
      }, 3500);
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

    function pageText() {
      return `${document.title} ${(document.body?.innerText || "").slice(0, 4000)}`;
    }

    function looksSuccessful() {
      const href = location.href.toLowerCase();
      // Greenhouse / Workday / common ATS confirmation URLs
      if (
        /\/confirmation\b|mode=submit_apply|application[_-]?submitted|thank[_-]?you|\/applicationcomplete|\/appsuccess|submitted=true|\/apply\/?.*(confirm|success|thank)|submittedapplication|applicationreceived/i.test(
          href,
        )
      ) {
        return true;
      }
      const text = pageText();
      // Workday confirmation automation ids
      if (
        document.querySelector(
          '[data-automation-id="applyFlowSubmittedPage"], [data-automation-id="successfullyApplied"], [data-automation-id="submittedPage"]',
        )
      ) {
        return true;
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
      return /thank you for apply(ing|ication)|thanks for apply(ing|ication)|thank you for (your )?(application|interest)|application (has been |was )?(successfully )?submitted|successfully (applied|submitted)|we have received your application|application received|application complete|your application was submitted|submitted successfully|thanks for applying|you(r application)? (has been|was) (successfully )?submitted|you('ve| have) successfully submitted/i.test(
        text,
      );
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
      if (!t || t.length > 80) return false;
      if (/^(submit application|send application|submit my application)$/i.test(t)) return true;
      if (/submit(\s+my)?\s+application/i.test(t)) return true;
      // Workday final CTA
      if (/^(submit|submit your application)$/i.test(t)) return true;
      if (/^submit$/i.test(t)) return true;
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
        // Workday thank-you pages sometimes drop the requisition from the URL —
        // fall back to the locked listing captured on the first job page.
        if ((!parsed?.jobKey || (typeof isWeakRole === "function" && isWeakRole(parsed.role))) &&
            typeof readJobCtx === "function") {
          const latest = readJobCtx("applytrack:job:latest");
          if (latest?.jobKey && !isWeakRole(latest.role)) {
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
        if (typeof isWeakRole === "function" && isWeakRole(parsed.role)) return false;
        if (alreadyLogged(parsed.jobKey)) return false;

        const look = await chrome.runtime.sendMessage({
          type: "LOOKUP",
          payload: { ...parsed, url: parsed.url || location.href },
        });
        if (look?.ok && look.found && !look.stale) {
          markLogged(parsed.jobKey);
          return false;
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
        const now = Date.now();
        if (now - lastClick < 1500) return;

        if (isApplyStart(text)) {
          lastClick = now;
          // Warm cache only — opening the form is not "Applied"
          currentParsed();
          return;
        }

        if (!isFinalSubmit(text)) return;
        lastClick = now;
        currentParsed();
        startWatch();
      },
      true,
    );

    document.addEventListener(
      "submit",
      () => {
        const now = Date.now();
        if (now - lastClick < 1500) return;
        lastClick = now;
        currentParsed();
        startWatch();
      },
      true,
    );

    // Confirmation page (e.g. landed here after Simplify submit)
    function checkThankYou() {
      if (thankYouLogged) return;
      if (typeof isNoisePage === "function" && isNoisePage()) return;
      if (!looksSuccessful()) return;
      thankYouLogged = true;
      stopWatch();
      void saveApplied("thank-you");
    }

    checkThankYou();
    setInterval(checkThankYou, 2000);
  }
})();
