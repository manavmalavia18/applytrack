"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadPage, navigateTo } = require("./helpers/loadPage");

test("isApplicationWizardPage detects apply/wizard/thank-you surfaces per ATS", () => {
  const win = loadPage({ url: "https://example.com/" });
  const isWizard = win.isApplicationWizardPage;

  assert.equal(isWizard("https://jobs.lever.co/acme/123/apply", "lever"), true);
  assert.equal(isWizard("https://jobs.lever.co/acme/123", "lever"), false);
  assert.equal(
    isWizard("https://jobs.dayforcehcm.com/hightower/candidateportal/jobs/8627/apply/manualApplication", "dayforce"),
    true,
  );
  assert.equal(
    isWizard("https://www.smartrecruiters.com/oneclick-ui/company/AbbVie/publication/123", "smartrecruiters"),
    true,
  );
  assert.equal(isWizard("https://careers.roblox.com/jobs?gh_jid=1", "greenhouse"), false);
  assert.equal(
    isWizard("https://boards.greenhouse.io/acme/jobs/1/applicationsubmitted", "greenhouse"),
    true,
  );
  assert.equal(
    isWizard("https://example.com/careers/job", "web", "Thank you for applying! We'll be in touch."),
    true,
  );
});

test("Lever apply-wizard page keeps the session-locked identity instead of re-parsing chrome", () => {
  const listingUrl = "https://jobs.lever.co/atomcomputing/e6db0921-3a50-4c45-931a-deffbfa8d826";
  const win = loadPage({
    url: listingUrl,
    html: `<!doctype html><html><head><title>Atom Computing - Software Engineer</title></head>
      <body><div class="posting-headline"><h2>Software Engineer</h2></div></body></html>`,
  });

  const listingParsed = win.parseJobPage();
  assert.equal(listingParsed.company, "Atom Computing");
  assert.equal(listingParsed.role, "Software Engineer");
  assert.equal(listingParsed.captureConfidence, "medium"); // no JD captured yet

  // Navigate to the apply wizard — chrome ("Apply for this job", generic h1) must
  // never overwrite the already-locked role/company/jobKey.
  navigateTo(
    win,
    `${listingUrl}/apply`,
    `<!doctype html><html><head><title>Apply - Atom Computing</title></head>
      <body><h1>Apply for this job</h1></body></html>`,
  );

  const applyParsed = win.parseJobPage();
  assert.equal(applyParsed.company, "Atom Computing");
  assert.equal(applyParsed.role, "Software Engineer");
  assert.equal(applyParsed.jobKey, "lever:e6db0921-3a50-4c45-931a-deffbfa8d826");
  assert.equal(applyParsed.locked, true);
});

test("wizard page with a differing (but non-weak-looking) jobKey never displaces a solid lock", () => {
  const listingUrl = "https://jobs.lever.co/atomcomputing/e6db0921-3a50-4c45-931a-deffbfa8d826";
  const win = loadPage({
    url: listingUrl,
    html: `<!doctype html><html><head><title>Atom Computing - Software Engineer</title></head>
      <body><div class="posting-headline"><h2>Software Engineer</h2></div></body></html>`,
  });

  // Establish a solid session lock from the listing page first.
  const listingParsed = win.parseJobPage();
  assert.equal(win.isSolidLock(win.readJobCtx(`applytrack:job:${listingParsed.jobKey}`), "lever"), true);

  // Move to the apply wizard and simulate a fresh parse that produces a
  // *different* jobKey and a role ("Apply Now") that isn't caught by the
  // generic weak-role regex — this used to be trusted over the solid lock.
  win.__dom.reconfigure({ url: `${listingUrl}/apply` });
  const wizardFreshParse = {
    source: "lever",
    role: "Apply Now",
    company: "",
    url: `${listingUrl}/apply`,
    jobKey: "lever:some-other-id-from-the-wizard-step",
    jobDescription: "",
  };
  const merged = win.mergeRememberedJob(wizardFreshParse, "lever");

  assert.equal(merged.jobKey, listingParsed.jobKey, "jobKey must stay pinned to the solid lock");
  assert.equal(merged.role, "Software Engineer");
  assert.equal(merged.company, "Atom Computing");
  assert.equal(merged.locked, true);
});

test("Dayforce manualApplication wizard keeps Hightower locked instead of drifting to portal chrome", () => {
  const listingUrl = "https://jobs.dayforcehcm.com/hightower/candidateportal/jobs/8627";
  const win = loadPage({
    url: listingUrl,
    html: `<!doctype html><html><head><title>Field Service Technician</title></head>
      <body><h1>Field Service Technician</h1></body></html>`,
  });

  const listingParsed = win.parseJobPage();
  assert.equal(listingParsed.company, "Hightower");
  assert.equal(listingParsed.role, "Field Service Technician");

  navigateTo(
    win,
    `${listingUrl}/apply/manualApplication`,
    `<!doctype html><html><head><title>Manual Application</title></head>
      <body><h1>Manual Application</h1></body></html>`,
  );

  const wizardParsed = win.parseJobPage();
  assert.equal(wizardParsed.company, "Hightower");
  assert.equal(wizardParsed.role, "Field Service Technician");
  assert.equal(wizardParsed.jobKey, "dayforce:hightower:8627");
});
