"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeQuestion,
  companyKeyFromName,
  looksLikeContactInfo,
  shouldLearnValue,
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
  assert.equal(store.byQuestion["why mintmcp"].answer, "Because your infra tooling is excellent.");
  assert.equal(store.byQuestion["work authorization status"].answer, "Yes, authorized to work in the US.");
  assert.equal(store.byCompany.mintmcp["why mintmcp"].answer, "Because your infra tooling is excellent.");
  // Global (non-company-specific) question also mirrored under byCompany for that company.
  assert.ok(store.byCompany.mintmcp["work authorization status"]);
});

test("mergeLearnedAnswers: caps global and per-company maps, evicting oldest first", () => {
  let store = { byQuestion: {}, byCompany: {} };
  for (let i = 0; i < 5; i++) {
    const merged = mergeLearnedAnswers(store, {
      companyKey: "acme",
      entries: [{ label: `Question number ${i}`, value: `Answer ${i}` }],
      maxGlobal: 3,
      maxPerCompany: 2,
    });
    store = merged.store;
  }
  assert.equal(Object.keys(store.byQuestion).length, 3);
  assert.equal(Object.keys(store.byCompany.acme).length, 2);
  // Most recent entries survive; earliest ones evicted.
  assert.ok(store.byQuestion["question number 4"]);
  assert.ok(store.byCompany.acme["question number 4"]);
  assert.ok(!store.byQuestion["question number 0"]);
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
