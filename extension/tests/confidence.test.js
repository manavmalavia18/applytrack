"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadPage } = require("./helpers/loadPage");

test("captureConfidence: solid role + company + jobKey + JD => high", () => {
  const win = loadPage({
    url: "https://jobs.lever.co/atomcomputing/e6db0921-3a50-4c45-931a-deffbfa8d826",
    html: `<!doctype html><html><head><title>Atom Computing - Software Engineer</title></head>
      <body>
        <div class="posting-headline"><h2>Software Engineer</h2></div>
        <div data-qa="job-description">${"We build quantum computers. ".repeat(10)}</div>
      </body></html>`,
  });
  const parsed = win.parseJobPage();
  assert.equal(parsed.captureConfidence, "high");
});

test("captureConfidence: usable role/company but no JD/jobKey => medium", () => {
  const win = loadPage({
    url: "https://jobs.lever.co/atomcomputing/e6db0921-3a50-4c45-931a-deffbfa8d826",
    html: `<!doctype html><html><head><title>Atom Computing - Software Engineer</title></head>
      <body><div class="posting-headline"><h2>Software Engineer</h2></div></body></html>`,
  });
  const parsed = win.parseJobPage();
  assert.equal(parsed.captureConfidence, "medium");
});

test("captureConfidence: weak/duplicate company or role => low", () => {
  const win = loadPage({
    url: "https://www.smartrecruiters.com/oneclick-ui/company/AbbVie/publication/3743990014350476",
    html: `<!doctype html><html><head><title>Internet Explorer is no longer supported</title></head>
      <body><h1>Your browser is not supported. Please upgrade.</h1></body></html>`,
  });
  const parsed = win.parseJobPage();
  assert.equal(parsed.role, "Unknown role");
  assert.equal(parsed.captureConfidence, "low");
});

test("captureConfidence: apply-wizard page without a solid lock stays low", () => {
  const win = loadPage({
    url: "https://jobs.dayforcehcm.com/hightower/candidateportal/jobs/8627/apply/manualApplication",
    html: `<!doctype html><html><head><title>Manual Application</title></head>
      <body><h1>Manual Application</h1></body></html>`,
  });
  const parsed = win.parseJobPage();
  // No prior session lock exists yet, and the wizard's own title is junk.
  assert.equal(parsed.captureConfidence, "low");
});
