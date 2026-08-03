/**
 * "Remember answers I typed" — shared, no-AI helpers for learning + reusing
 * free-text answers the user has typed on application forms before.
 *
 * Loaded three ways, all sharing this one implementation:
 *   - content script global scope (manifest content_scripts "js" array)
 *   - background service worker global scope (importScripts)
 *   - Node test runner (require) — see the module.exports guard at the bottom
 *
 * Storage shape (chrome.storage.local, key "learnedAnswers"):
 *   {
 *     byQuestion: { [normalizedQuestion]: { answer, updatedAt, company? } },
 *     byCompany: { [companyKey]: { [normalizedQuestion]: { answer, updatedAt } } }
 *   }
 */

const LEARNED_MAX_GLOBAL = 200;
const LEARNED_MAX_PER_COMPANY = 50;
const LEARNED_MIN_QUESTION_LEN = 6;

/** lowercase, collapse whitespace, strip light punctuation — stable dedupe key */
function normalizeQuestion(label) {
  return String(label || "")
    .toLowerCase()
    .replace(/[?!.,:;"'`()[\]{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** lowercase scrubbed company name → storage key, e.g. "MintMCP, Inc." → "mintmcp" */
function companyKeyFromName(name) {
  let s = String(name || "")
    .toLowerCase()
    .replace(/[.,]/g, " ");
  s = s.replace(/\b(inc|llc|ltd|corp|corporation|co|company|group|holdings|technologies|technology|labs)\b/g, " ");
  return s.replace(/[^a-z0-9]+/g, "");
}

/** True only when the *whole* value is an email address or a phone number. */
function looksLikeContactInfo(value) {
  const v = String(value || "").trim();
  if (!v) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return true;
  const digits = v.replace(/\D/g, "");
  if (/^[+()\-.\s\d]{7,25}$/.test(v) && digits.length >= 7) return true;
  return false;
}

/** Values worth persisting: non-empty free text that isn't just contact info. */
function shouldLearnValue(value) {
  const v = String(value || "").trim();
  if (!v) return false;
  if (looksLikeContactInfo(v)) return false;
  return true;
}

/** Evict least-recently-updated entries once a map exceeds `max` keys (mutates + returns). */
function pruneToCap(map, max) {
  const keys = Object.keys(map);
  if (keys.length <= max) return map;
  const sorted = keys.sort((a, b) => (map[a]?.updatedAt || 0) - (map[b]?.updatedAt || 0));
  for (const key of sorted.slice(0, keys.length - max)) delete map[key];
  return map;
}

/**
 * Merge newly-scraped page answers into the persisted store.
 * @param {{byQuestion?: object, byCompany?: object}} store
 * @param {{companyKey?: string, entries: {label: string, value: string}[], maxGlobal?: number, maxPerCompany?: number}} opts
 * @returns {{store: object, learnedCount: number}}
 */
function mergeLearnedAnswers(store, opts) {
  const byQuestion = { ...(store?.byQuestion || {}) };
  const byCompany = { ...(store?.byCompany || {}) };
  const companyKey = (opts?.companyKey || "").trim();
  const entries = Array.isArray(opts?.entries) ? opts.entries : [];
  const maxGlobal = opts?.maxGlobal || LEARNED_MAX_GLOBAL;
  const maxPerCompany = opts?.maxPerCompany || LEARNED_MAX_PER_COMPANY;

  let learnedCount = 0;
  const now = Date.now();
  for (const entry of entries) {
    const nq = normalizeQuestion(entry?.label);
    if (nq.length < LEARNED_MIN_QUESTION_LEN) continue;
    if (!shouldLearnValue(entry?.value)) continue;
    const answer = String(entry.value).trim();

    byQuestion[nq] = { answer, updatedAt: now, company: companyKey || undefined };
    if (companyKey) {
      byCompany[companyKey] = { ...(byCompany[companyKey] || {}) };
      byCompany[companyKey][nq] = { answer, updatedAt: now };
    }
    learnedCount += 1;
  }

  pruneToCap(byQuestion, maxGlobal);
  if (companyKey && byCompany[companyKey]) pruneToCap(byCompany[companyKey], maxPerCompany);

  return { store: { byQuestion, byCompany }, learnedCount };
}

/** Word overlap score 0–1 for fuzzy match within the same company. */
function questionSimilarity(a, b) {
  const wa = new Set(String(a || "").split(" ").filter((w) => w.length > 2));
  const wb = new Set(String(b || "").split(" ").filter((w) => w.length > 2));
  if (!wa.size || !wb.size) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter += 1;
  return inter / Math.max(wa.size, wb.size);
}

/**
 * Look up learned answers. Prefer same-company exact match, then fuzzy within
 * that company (so "Why Cogent?" ≈ "Why do you want to join Cogent?"), then
 * global exact match for universal questions (work auth, etc.).
 */
function lookupLearnedAnswers(store, opts) {
  const byQuestion = store?.byQuestion || {};
  const byCompany = store?.byCompany || {};
  const companyKey = (opts?.companyKey || "").trim();
  const questions = Array.isArray(opts?.questions) ? opts.questions : [];
  const companyMap = companyKey ? byCompany[companyKey] : null;

  const matches = [];
  for (const q of questions) {
    const nq = normalizeQuestion(q?.label);
    if (!nq) continue;

    if (companyMap?.[nq]?.answer) {
      matches.push({ id: q.id, label: q.label, answer: companyMap[nq].answer, source: "learned", scope: "company" });
      continue;
    }

    // Fuzzy within same company — pick best overlap ≥ 0.45
    if (companyMap) {
      let best = null;
      let bestScore = 0;
      for (const [key, hit] of Object.entries(companyMap)) {
        if (!hit?.answer) continue;
        let score = questionSimilarity(nq, key);
        if (nq.includes(key) || key.includes(nq)) score = Math.max(score, 0.7);
        if (score > bestScore) {
          bestScore = score;
          best = hit;
        }
      }
      if (best && bestScore >= 0.45) {
        matches.push({ id: q.id, label: q.label, answer: best.answer, source: "learned", scope: "company" });
        continue;
      }
    }

    const globalHit = byQuestion[nq];
    if (globalHit?.answer) {
      matches.push({ id: q.id, label: q.label, answer: globalHit.answer, source: "learned", scope: "global" });
    }
  }
  return matches;
}

const learnedAnswersApi = {
  LEARNED_MAX_GLOBAL,
  LEARNED_MAX_PER_COMPANY,
  normalizeQuestion,
  companyKeyFromName,
  looksLikeContactInfo,
  shouldLearnValue,
  mergeLearnedAnswers,
  lookupLearnedAnswers,
};

// Node test runner only — content scripts / service worker keep the plain
// top-level function declarations as shared globals (same pattern as ats.js).
if (typeof module !== "undefined" && module.exports) {
  module.exports = learnedAnswersApi;
}
