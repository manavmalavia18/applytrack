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

/**
 * Look up learned answers for currently-unmatched questions.
 * Exact normalized-question match only (no fuzzy/keyword matching) — company
 * scope wins over global so e.g. "Why MintMCP?" stays company-specific while
 * "Work authorization" is reused everywhere.
 * @param {{byQuestion?: object, byCompany?: object}} store
 * @param {{questions: {id: string, label: string}[], companyKey?: string}} opts
 * @returns {{id: string, label: string, answer: string, source: "learned", scope: "company"|"global"}[]}
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
    const companyHit = companyMap?.[nq];
    if (companyHit?.answer) {
      matches.push({ id: q.id, label: q.label, answer: companyHit.answer, source: "learned", scope: "company" });
      continue;
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
