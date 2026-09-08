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
const LEARNED_MAX_PER_COMPANY = 80;
const LEARNED_MIN_QUESTION_LEN = 6;
const LEARNED_LONG_ANSWER_LEN = 40;

/** Kinds that belong to one employer only — never reused on a different company. */
const COMPANY_SPECIFIC_KINDS = new Set(["whyCompany", "whyRole", "coverLetter", "proudWork"]);

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

/**
 * Name / email / resume / LinkedIn — Simplify already fills these.
 * ApplyTrack should only fill leftover screening and "why" questions.
 */
function isSimplifyOwnedQuestion(label) {
  const s = String(label || "").trim();
  if (!s) return true;
  if (
    /^(first name|last name|full name|preferred name|legal name|email|e-?mail address|phone|mobile|password|address( line)?\s*1?|city|zip|postal|country|state|province|date of birth)$/i.test(
      s,
    )
  ) {
    return true;
  }
  if (/\b(phone number|mobile number|email address)\b/i.test(s) && s.length < 48) return true;
  if (/^(linkedin|github|portfolio|website|personal website|homepage)(\s+(url|profile|link))?$/i.test(s)) {
    return true;
  }
  if (/\b(resume|curriculum vitae|\bcv\b)\b/i.test(s) && !/cover letter/i.test(s)) return true;
  return false;
}

/** Values worth persisting: non-empty free text that isn't just contact info. */
function shouldLearnValue(value) {
  const v = String(value || "").trim();
  if (!v) return false;
  if (looksLikeContactInfo(v)) return false;
  return true;
}

/** Screening / long-form answers worth keeping. Skip name/email chrome and one-word junk. */
function isImportantLearnedEntry(label, value) {
  const v = String(value || "").trim();
  if (!shouldLearnValue(v)) return false;
  const kind = questionKind(label);
  if (kind) return true;
  if (v.length >= LEARNED_LONG_ANSWER_LEN) return true;
  return false;
}

function companyAnswerCount(store, companyKey) {
  const key = String(companyKey || "").trim();
  if (!key) return 0;
  const map = store?.byCompany?.[key];
  if (!map || typeof map !== "object") return 0;
  return Object.values(map).filter((hit) => hit?.answer).length;
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
    if (!isImportantLearnedEntry(entry?.label, entry?.value)) continue;
    const answer = String(entry.value).trim();
    const kind = questionKind(entry.label);
    const companyOnly = COMPANY_SPECIFIC_KINDS.has(kind);

    // "Why Cloudflare?" stays on Cloudflare's shelf — never used for Google.
    if (companyOnly && !companyKey) continue;

    if (!companyOnly) {
      byQuestion[nq] = { answer, updatedAt: now, company: companyKey || undefined };
    }
    if (companyKey) {
      byCompany[companyKey] = { ...(byCompany[companyKey] || {}) };
      byCompany[companyKey][nq] = { answer, updatedAt: now, kind: kind || undefined };
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
  const [small, large] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  let inter = 0;
  for (const w of small) if (large.has(w)) inter += 1;
  // Prefer "all significant words of the shorter question appear in the longer"
  const coverage = inter / small.size;
  const jaccard = inter / (wa.size + wb.size - inter);
  return Math.max(coverage, jaccard);
}

/**
 * Canonical kind for a question label. Used so "Are you authorized to work in
 * the US?" matches a stored "Work authorization status" across ATS wording.
 * Company-specific kinds (whyCompany / whyRole) must not reuse globally.
 */
const QUESTION_KIND_RULES = [
  { kind: "sponsorship", re: /\bsponsor(ship|ed|ing)?\b/i },
  {
    kind: "workAuth",
    re: /(authoriz\w*\s*to\s*work|work\s*authoriz|work\s*permit|\bvisa\b|\bopt\b|\bh-?1b\b|\bcpt\b|legally\s*(authorized|eligible)|employment\s*eligib)/i,
  },
  {
    kind: "salary",
    re: /(salary|compensation|expected\s*(pay|salary)|pay\s*range|desired\s*(salary|compensation)|expect\s*to\s*make)/i,
  },
  {
    // Availability / earliest start — not education "Start date month/year"
    // and not relocation "date available to relocate".
    kind: "startDate",
    re: /(available\s*(to\s*start|start\s*date)|what\s*date\s*(are\s*you\s*)?available|date\s*(are\s*you\s*)?available\s*to\s*start|when\s*can\s*you\s*start|notice\s*period|earliest\s*(start|availability)|(?<!end\s)start\s*date(?!\s*(month|year)))/i,
  },
  {
    kind: "location",
    re: /(relocat|willing\s*to\s*(move|relocate)|open\s*to\s*relocation|remote\s*work|onsite|hybrid|time\s*zone|where\s*(are\s*you\s*)?(currently\s*)?(based|located))/i,
  },
  {
    kind: "coverLetter",
    re: /(cover\s*letter|additional information|anything else we should know|anything else you.?d like us to know)/i,
  },
  { kind: "linkedin", re: /\blinkedin\b/i },
  { kind: "github", re: /\bgithub\b/i },
  { kind: "portfolio", re: /\b(portfolio|personal\s*site|website\s*url)\b/i },
  {
    kind: "aiExperience",
    re: /(\bai\b|\bllm\b|machine\s*learning|generative\s*ai|artificial\s*intelligence)/i,
  },
  { kind: "testing", re: /(\btest(ing)?\b|playwright|cypress|selenium|\bqa\b)/i },
  { kind: "cloud", re: /(\baws\b|\bazure\b|\bgcp\b|google\s*cloud|amazon\s*web\s*services)/i },
  { kind: "startupExperience", re: /(startup|early-stage|fast-paced)/i },
  {
    kind: "proudWork",
    re: /(proud|accomplishment|greatest\s*achievement|biggest\s*challenge|not\s*on\s*(your\s*)?resume)/i,
  },
  {
    kind: "whyLooking",
    re: /(why\s*(are\s*you\s*)?leaving|looking\s*for\s*(a\s*)?new|reason\s*for\s*leaving)/i,
  },
  {
    kind: "whyRole",
    re: /(why.*(this|the)\s*(role|position|job)|what\s*interests\s*you\s*(about|in)\s*this\s*(role|position))/i,
  },
  {
    kind: "whyCompany",
    re: /(why.*(this\s*company|working\s*(here|at)|join(ing)?\s*(us|the\s*team)|work\s*(here|for\s*us))|why\s+\w+)/i,
  },
];

/** Kinds safe to reuse from global memory on a different company's form. */
const UNIVERSAL_QUESTION_KINDS = new Set([
  "sponsorship",
  "workAuth",
  "salary",
  "startDate",
  "location",
  "linkedin",
  "github",
  "portfolio",
]);

function questionKind(label) {
  const q = String(label || "");
  if (!q.trim()) return "";
  for (const rule of QUESTION_KIND_RULES) {
    if (rule.re.test(q)) return rule.kind;
  }
  return "";
}

/**
 * Normalize free-text for HTML date-like inputs (`date`, `datetime-local`,
 * `month`, `time`, `week`). Returns the formatted value, or "" when the string
 * is not a date (locations, prose, year-only, etc.) so callers can skip the
 * assignment. Never returns the original string unless it already matches the
 * required format for `inputType`.
 */
function normalizeDateInputValue(value, inputType) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const type = String(inputType || "date").toLowerCase();

  // Availability prose / locations / free text — never assign to date inputs.
  if (
    /^(immediately|asap|as\s*soon\s*as\s*possible|tbd|n\/?a|none|available\s*now)$/i.test(raw) ||
    /[a-zA-Z]{3,}/.test(raw)
  ) {
    return "";
  }

  const isValidYmd = (y, m, d) => {
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  };

  const toYmd = (y, m, d) =>
    `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const toYm = (y, m) => {
    if (m < 1 || m > 12 || y < 1000 || y > 9999) return "";
    return `${y}-${String(m).padStart(2, "0")}`;
  };

  if (type === "time") {
    const tm = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!tm) return "";
    const hh = Number(tm[1]);
    const mm = Number(tm[2]);
    const ss = tm[3] != null ? Number(tm[3]) : null;
    if (hh > 23 || mm > 59 || (ss != null && ss > 59)) return "";
    const base = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    return ss != null ? `${base}:${String(ss).padStart(2, "0")}` : base;
  }

  if (type === "week") {
    return /^\d{4}-W\d{2}$/i.test(raw) ? raw.toUpperCase() : "";
  }

  // Month-year: 2023-09, 09/2023, 9/2023 — only valid for type=month.
  const isoMonth = raw.match(/^(\d{4})-(\d{1,2})$/);
  const usMonth = raw.match(/^(\d{1,2})[/\-.](\d{4})$/);
  if (type === "month") {
    if (isoMonth) return toYm(Number(isoMonth[1]), Number(isoMonth[2]));
    if (usMonth) return toYm(Number(usMonth[2]), Number(usMonth[1]));
  } else if (isoMonth || usMonth) {
    // Reject month-year for type=date / datetime-local (would invent a day).
    return "";
  }

  // Year-only (e.g. "2026") — never invent month/day for type=date.
  if (/^\d{4}$/.test(raw)) return "";

  // ISO date (optionally with time) — require full yyyy-MM-dd
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::\d{2})?)?$/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (!isValidYmd(y, m, d)) return "";
    const ymd = toYmd(y, m, d);
    if (type === "date") return ymd;
    if (type === "month") return ymd.slice(0, 7);
    if (type === "datetime-local") {
      const hh = iso[4] != null ? iso[4] : "00";
      const mi = iso[5] != null ? iso[5] : "00";
      return `${ymd}T${hh}:${mi}`;
    }
    return "";
  }

  // US-style M/D/YYYY, MM/DD/YYYY (also -, .)
  const us = raw.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (us) {
    const m = Number(us[1]);
    const d = Number(us[2]);
    const y = Number(us[3]);
    if (!isValidYmd(y, m, d)) return "";
    const ymd = toYmd(y, m, d);
    if (type === "date") return ymd;
    if (type === "month") return ymd.slice(0, 7);
    if (type === "datetime-local") return `${ymd}T00:00`;
    return "";
  }

  return "";
}

function bestFuzzyHit(map, nq, minScore, targetKind) {
  if (!map || !nq) return null;
  let best = null;
  let bestScore = 0;
  for (const [key, hit] of Object.entries(map)) {
    if (!hit?.answer) continue;
    const hitKind = hit.kind || questionKind(key);
    // Avoid location answers landing on start-date fields (and vice versa).
    if (targetKind && hitKind && targetKind !== hitKind) continue;
    let score = questionSimilarity(nq, key);
    if (nq.includes(key) || key.includes(nq)) score = Math.max(score, 0.7);
    if (score > bestScore) {
      bestScore = score;
      best = hit;
    }
  }
  return best && bestScore >= minScore ? best : null;
}

function bestKindHit(map, kind) {
  if (!map || !kind) return null;
  let best = null;
  for (const [key, hit] of Object.entries(map)) {
    if (!hit?.answer) continue;
    if (questionKind(key) === kind || hit.kind === kind) {
      if (!best || (hit.updatedAt || 0) > (best.updatedAt || 0)) best = hit;
    }
  }
  return best;
}

/** Why / cover letter / "tell us" — the long text boxes Ashby fills from company memory. */
function isLongFormQuestion(label) {
  const k = questionKind(label);
  if (COMPANY_SPECIFIC_KINDS.has(k) || k === "whyLooking") return true;
  return /cover\s*letter|additional|anything else|tell us|describe|why |about (yourself|you)|motivat|interested in/i.test(
    String(label || ""),
  );
}

/**
 * Best long narrative saved for this company (why-us first, then cover letter,
 * then the longest remaining screening answer).
 */
function bestCompanyNarrative(companyMap) {
  if (!companyMap) return null;
  let why = null;
  let cover = null;
  let longest = null;
  for (const [key, hit] of Object.entries(companyMap)) {
    const answer = hit?.answer;
    if (!answer || String(answer).trim().length < 24) continue;
    const kind = hit.kind || questionKind(key);
    if (UNIVERSAL_QUESTION_KINDS.has(kind)) continue;
    if (kind === "whyCompany" || kind === "whyRole") {
      if (!why || (hit.updatedAt || 0) > (why.updatedAt || 0)) why = hit;
      continue;
    }
    if (kind === "coverLetter") {
      if (!cover || (hit.updatedAt || 0) > (cover.updatedAt || 0)) cover = hit;
      continue;
    }
    if (!longest || String(answer).length > String(longest.answer).length) longest = hit;
  }
  return why || cover || longest;
}

/**
 * Look up learned answers. Prefer same-company exact match, then fuzzy / kind
 * within that company, then global exact, then kind/fuzzy for universal
 * questions (work auth, visa, salary — never "why this company").
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
    const kind = questionKind(q.label);

    if (companyMap?.[nq]?.answer) {
      matches.push({ id: q.id, label: q.label, answer: companyMap[nq].answer, source: "learned", scope: "company" });
      continue;
    }

    const companyFuzzy = bestFuzzyHit(companyMap, nq, 0.4, kind);
    if (companyFuzzy) {
      matches.push({ id: q.id, label: q.label, answer: companyFuzzy.answer, source: "learned", scope: "company" });
      continue;
    }

    const companyKind = kind ? bestKindHit(companyMap, kind) : null;
    if (companyKind) {
      matches.push({ id: q.id, label: q.label, answer: companyKind.answer, source: "learned", scope: "company" });
      continue;
    }

    // Same company, different wording: intern "Why Cloudflare?" → next job's
    // "Cover Letter" / "Why this role?" textarea (Ashby-style company memory).
    if (isLongFormQuestion(q.label)) {
      const narrative = bestCompanyNarrative(companyMap);
      if (narrative?.answer) {
        matches.push({ id: q.id, label: q.label, answer: narrative.answer, source: "learned", scope: "company" });
        continue;
      }
    }

    const globalHit = byQuestion[nq];
    if (globalHit?.answer) {
      matches.push({ id: q.id, label: q.label, answer: globalHit.answer, source: "learned", scope: "global" });
      continue;
    }

    if (kind && UNIVERSAL_QUESTION_KINDS.has(kind)) {
      const globalKind = bestKindHit(byQuestion, kind);
      if (globalKind) {
        matches.push({ id: q.id, label: q.label, answer: globalKind.answer, source: "learned", scope: "global" });
        continue;
      }
      const globalFuzzy = bestFuzzyHit(byQuestion, nq, 0.5, kind);
      if (globalFuzzy) {
        matches.push({ id: q.id, label: q.label, answer: globalFuzzy.answer, source: "learned", scope: "global" });
      }
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
  isSimplifyOwnedQuestion,
  shouldLearnValue,
  isImportantLearnedEntry,
  companyAnswerCount,
  questionKind,
  isLongFormQuestion,
  normalizeDateInputValue,
  mergeLearnedAnswers,
  lookupLearnedAnswers,
};

// Node test runner only — content scripts / service worker keep the plain
// top-level function declarations as shared globals (same pattern as ats.js).
if (typeof module !== "undefined" && module.exports) {
  module.exports = learnedAnswersApi;
}
