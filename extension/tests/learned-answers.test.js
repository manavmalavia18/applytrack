"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeQuestion,
  companyKeyFromName,
  looksLikeContactInfo,
  isSimplifyOwnedQuestion,
  shouldLearnValue,
  isImportantLearnedEntry,
  companyAnswerCount,
  questionKind,
  normalizeDateInputValue,
  mergeLearnedAnswers,
  lookupLearnedAnswers,
} = require("../learned-answers");

test("normalizeQuestion: lowercases, strips light punctuation, collapses whitespace", () => {
  assert.equal(normalizeQuestion("Why MintMCP?"), "why mintmcp");
  assert.equal(normalizeQuestion("  Work   Authorization  Status? "), "work authorization status");
  assert.equal(normalizeQuestion("What's your salary expectation?"), "whats your salary expectation");
});

test("companyKeyFromName: scrubs suffixes/punctuation to a stable slug", () => {
  assert.equal(companyKeyFromName("MintMCP"), "mintmcp");
  assert.equal(companyKeyFromName("MintMCP, Inc."), "mintmcp");
  assert.equal(companyKeyFromName("Atom Computing Corp"), "atomcomputing");
  assert.equal(companyKeyFromName(""), "");
});

test("isSimplifyOwnedQuestion: skips identity/resume that Simplify fills", () => {
  assert.equal(isSimplifyOwnedQuestion("First name"), true);
  assert.equal(isSimplifyOwnedQuestion("Email"), true);
  assert.equal(isSimplifyOwnedQuestion("Phone number"), true);
  assert.equal(isSimplifyOwnedQuestion("Resume"), true);
  assert.equal(isSimplifyOwnedQuestion("LinkedIn"), true);
  assert.equal(isSimplifyOwnedQuestion("Why do you want to work here?"), false);
  assert.equal(isSimplifyOwnedQuestion("Cover Letter"), false);
  assert.equal(isSimplifyOwnedQuestion("Are you authorized to work in the US?"), false);
});

test("looksLikeContactInfo: flags whole-value emails/phones only", () => {
  assert.equal(looksLikeContactInfo("jane@example.com"), true);
  assert.equal(looksLikeContactInfo("(415) 555-0100"), true);
  assert.equal(looksLikeContactInfo("4155550100"), true);
  assert.equal(looksLikeContactInfo("I built a tool called jane@example.com once."), false);
  assert.equal(looksLikeContactInfo("Yes, I am authorized to work in the US."), false);
});

test("shouldLearnValue: skips empty and contact-info-only values", () => {
  assert.equal(shouldLearnValue(""), false);
  assert.equal(shouldLearnValue("   "), false);
  assert.equal(shouldLearnValue("jane@example.com"), false);
  assert.equal(shouldLearnValue("I love building reliable software."), true);
});

test("mergeLearnedAnswers: stores globally and per-company, skips junk", () => {
  const { store, learnedCount } = mergeLearnedAnswers(
    { byQuestion: {}, byCompany: {} },
    {
      companyKey: "mintmcp",
      entries: [
        { label: "Why MintMCP?", value: "Because your infra tooling is excellent." },
        { label: "Work authorization status", value: "Yes, authorized to work in the US." },
        { label: "Email", value: "jane@example.com" },
        { label: "Short", value: "hi" },
        { label: "Blank answer field", value: "   " },
      ],
    },
  );
  assert.equal(learnedCount, 2);
  assert.equal(store.byCompany.mintmcp["why mintmcp"].answer, "Because your infra tooling is excellent.");
  // Company-specific "why us?" is NOT copied into the global map.
  assert.equal(store.byQuestion["why mintmcp"], undefined);
  assert.equal(store.byQuestion["work authorization status"].answer, "Yes, authorized to work in the US.");
  assert.ok(store.byCompany.mintmcp["work authorization status"]);
});

test("mergeLearnedAnswers: caps global and per-company maps, evicting oldest first", () => {
  let store = { byQuestion: {}, byCompany: {} };
  for (let i = 0; i < 5; i++) {
    const merged = mergeLearnedAnswers(store, {
      companyKey: "acme",
      entries: [
        {
          label: `Question number ${i} about your background`,
          value: `This is a sufficiently long screening answer number ${i} for the form.`,
        },
      ],
      maxGlobal: 3,
      maxPerCompany: 2,
    });
    store = merged.store;
  }
  assert.equal(Object.keys(store.byQuestion).length, 3);
  assert.equal(Object.keys(store.byCompany.acme).length, 2);
  assert.ok(store.byQuestion["question number 4 about your background"]);
  assert.ok(store.byCompany.acme["question number 4 about your background"]);
  assert.ok(!store.byQuestion["question number 0 about your background"]);
});

test("lookupLearnedAnswers: prefers company-scoped match over global", () => {
  const store = {
    byQuestion: {
      "why mintmcp": { answer: "GLOBAL answer", updatedAt: 1 },
      "work authorization status": { answer: "Yes, authorized.", updatedAt: 1 },
    },
    byCompany: {
      mintmcp: {
        "why mintmcp": { answer: "COMPANY-SPECIFIC answer", updatedAt: 2 },
      },
    },
  };
  const matches = lookupLearnedAnswers(store, {
    companyKey: "mintmcp",
    questions: [
      { id: "q1", label: "Why MintMCP?" },
      { id: "q2", label: "Work authorization status" },
      { id: "q3", label: "Unrelated question that was never learned" },
    ],
  });
  const byId = Object.fromEntries(matches.map((m) => [m.id, m]));
  assert.equal(byId.q1.answer, "COMPANY-SPECIFIC answer");
  assert.equal(byId.q1.scope, "company");
  assert.equal(byId.q2.answer, "Yes, authorized.");
  assert.equal(byId.q2.scope, "global");
  assert.equal(byId.q3, undefined);
});

test("lookupLearnedAnswers: falls back to global when no company match exists", () => {
  const store = {
    byQuestion: { "work authorization status": { answer: "Yes, authorized.", updatedAt: 1 } },
    byCompany: {},
  };
  const matches = lookupLearnedAnswers(store, {
    companyKey: "somecompany",
    questions: [{ id: "q1", label: "Work Authorization Status?" }],
  });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].scope, "global");
});

test("lookupLearnedAnswers: fuzzy-matches similar questions within the same company", () => {
  const store = {
    byQuestion: {},
    byCompany: {
      cogentsecurity: {
        "why cogent": { answer: "Because of the security product.", updatedAt: 1 },
      },
    },
  };
  const matches = lookupLearnedAnswers(store, {
    companyKey: "cogentsecurity",
    questions: [{ id: "q1", label: "Why do you want to work at Cogent Security?" }],
  });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].answer, "Because of the security product.");
  assert.equal(matches[0].scope, "company");
});

test("questionKind: maps ATS wording to a stable kind", () => {
  assert.equal(questionKind("Are you legally authorized to work in the United States?"), "workAuth");
  assert.equal(questionKind("Work authorization status"), "workAuth");
  assert.equal(questionKind("Will you now or in the future require visa sponsorship?"), "sponsorship");
  assert.equal(questionKind("Why do you want to work at Cogent Security?"), "whyCompany");
  assert.equal(questionKind("LinkedIn profile URL"), "linkedin");
});

test("lookupLearnedAnswers: global kind-match for work auth across ATS wording", () => {
  const store = {
    byQuestion: {
      "work authorization status": { answer: "Yes, authorized on STEM OPT.", updatedAt: 1 },
    },
    byCompany: {},
  };
  const matches = lookupLearnedAnswers(store, {
    companyKey: "cloudflare",
    questions: [{ id: "q1", label: "Are you legally authorized to work in the United States?" }],
  });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].answer, "Yes, authorized on STEM OPT.");
  assert.equal(matches[0].scope, "global");
});

test("lookupLearnedAnswers: does not reuse why-company answers globally", () => {
  const store = {
    byQuestion: {
      "why mintmcp": { answer: "Because MintMCP infra is excellent.", updatedAt: 1 },
    },
    byCompany: {},
  };
  const matches = lookupLearnedAnswers(store, {
    companyKey: "cloudflare",
    questions: [{ id: "q1", label: "Why do you want to work at Cloudflare?" }],
  });
  assert.equal(matches.length, 0);
});

test("isImportantLearnedEntry: keeps screening answers, drops junk", () => {
  assert.equal(isImportantLearnedEntry("Why Cloudflare?", "I like the edge network and production ownership."), true);
  assert.equal(isImportantLearnedEntry("Work authorization status", "Yes"), true);
  assert.equal(isImportantLearnedEntry("Random field", "hi"), false);
  assert.equal(isImportantLearnedEntry("Email", "jane@example.com"), false);
});

test("mergeLearnedAnswers: why-company is company-shelf only", () => {
  const { store, learnedCount } = mergeLearnedAnswers(
    { byQuestion: {}, byCompany: {} },
    {
      companyKey: "cloudflare",
      entries: [{ label: "Why do you want to work at Cloudflare?", value: "Because of the edge platform." }],
    },
  );
  assert.equal(learnedCount, 1);
  assert.ok(store.byCompany.cloudflare);
  assert.equal(store.byQuestion["why do you want to work at cloudflare"], undefined);
  assert.equal(companyAnswerCount(store, "cloudflare"), 1);
  assert.equal(companyAnswerCount(store, "mintmcp"), 0);
});

test("lookupLearnedAnswers: company why-text fills cover letter / other long fields", () => {
  const store = {
    byQuestion: {},
    byCompany: {
      cloudflare: {
        "why are you interested in cloudflares software engineering internship": {
          answer: "TEST-CF-WHY-2026 I want to build on the edge.",
          updatedAt: 2,
        },
      },
    },
  };
  const matches = lookupLearnedAnswers(store, {
    companyKey: "cloudflare",
    questions: [
      { id: "q1", label: "Cover Letter" },
      { id: "q2", label: "Why do you want to work at Cloudflare?" },
    ],
  });
  const byId = Object.fromEntries(matches.map((m) => [m.id, m]));
  assert.equal(byId.q1.answer, "TEST-CF-WHY-2026 I want to build on the edge.");
  assert.equal(byId.q1.scope, "company");
  assert.equal(byId.q2.answer, "TEST-CF-WHY-2026 I want to build on the edge.");
});

test("mergeLearnedAnswers: skips why-company when there is no company key", () => {
  const { learnedCount, store } = mergeLearnedAnswers(
    { byQuestion: {}, byCompany: {} },
    {
      companyKey: "",
      entries: [{ label: "Why this company?", value: "Because the product is excellent." }],
    },
  );
  assert.equal(learnedCount, 0);
  assert.deepEqual(store.byCompany, {});
});

test("normalizeDateInputValue: converts US dates and rejects non-dates", () => {
  assert.equal(normalizeDateInputValue("08/27/2026", "date"), "2026-08-27");
  assert.equal(normalizeDateInputValue("8/27/2026", "date"), "2026-08-27");
  assert.equal(normalizeDateInputValue("2026-08-27", "date"), "2026-08-27");
  assert.equal(normalizeDateInputValue("08/27/2026", "datetime-local"), "2026-08-27T00:00");
  assert.equal(normalizeDateInputValue("New York City, New York, United States", "date"), "");
  assert.equal(normalizeDateInputValue("as soon as possible", "date"), "");
  assert.equal(normalizeDateInputValue("13/40/2026", "date"), "");
  assert.equal(normalizeDateInputValue("09:30", "time"), "09:30");
});

test("lookupLearnedAnswers: does not fuzzy-match location answers onto start-date questions", () => {
  const store = {
    byQuestion: {},
    byCompany: {
      paylocity: {
        "where are you currently located": {
          answer: "New York City, New York, United States",
          updatedAt: 2,
          kind: "location",
        },
        "earliest date available to relocate": {
          answer: "New York City, New York, United States",
          updatedAt: 1,
          kind: "location",
        },
      },
    },
  };
  const matches = lookupLearnedAnswers(store, {
    companyKey: "paylocity",
    questions: [{ id: "q1", label: "Available start date" }],
  });
  assert.equal(matches.length, 0);
});

