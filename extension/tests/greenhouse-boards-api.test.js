"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadPage } = require("./helpers/loadPage");

// Custom Greenhouse embeds (careers.laika.com?gh_jid=...) often paint "Loading job
// details" in the parent frame before the cross-origin iframe hydrates. When the DOM
// parse is weak, enrichGreenhouseFromApi should backfill role/company from the public
// boards-api.greenhouse.io endpoint.
test("enrichGreenhouseFromApi backfills weak custom-domain parses from the boards API", async () => {
  const win = loadPage({
    url: "https://careers.laika.com/jobs?gh_jid=5555555",
    html: `<!doctype html><html><head><title>Loading job details...</title></head>
      <body><h1>Loading job details...</h1></body></html>`,
    fetchImpl: async (url) => {
      assert.match(String(url), /boards-api\.greenhouse\.io\/v1\/boards\/laika\/jobs\/5555555/);
      return {
        ok: true,
        json: async () => ({
          title: "Stop Motion Animator",
          company_name: "LAIKA",
        }),
      };
    },
  });

  const initial = win.parseJobPage();
  assert.equal(initial.role, "Unknown role");

  const enriched = await win.enrichGreenhouseFromApi(initial);
  assert.equal(enriched.role, "Stop Motion Animator");
  assert.equal(enriched.company, "LAIKA");
  assert.equal(enriched.jobKey, "greenhouse:5555555");
});

test("enrichGreenhouseFromApi is a no-op once the DOM parse is already solid", async () => {
  const win = loadPage({
    url: "https://careers.roblox.com/jobs?gh_jid=6234567",
    html: `<!doctype html><html><head><title>Software Engineer, User Frameworks | Roblox</title></head>
      <body>
        <h1 class="app-title">Software Engineer, User Frameworks</h1>
        <div id="job-description">${"We build immersive experiences for millions of players worldwide. ".repeat(3)}</div>
      </body></html>`,
    fetchImpl: async () => {
      throw new Error("should not fetch when the DOM parse is already solid");
    },
  });

  const parsed = win.parseJobPage();
  const result = await win.enrichGreenhouseFromApi(parsed);
  assert.equal(result.role, "Software Engineer, User Frameworks");
  assert.equal(result.company, "Roblox");
});

test("enrichGreenhouseFromApi: payitgov.com host guesses board token payit", async () => {
  const tried = [];
  const win = loadPage({
    url: "https://payitgov.com/careers/?gh_jid=7975853003",
    html: `<!doctype html><html><head>
      <title>PayIt Careers | Make Government Work Better | See Openings</title>
      <meta property="og:site_name" content="PayIt" />
    </head>
    <body><h1>Current Openings</h1></body></html>`,
    fetchImpl: async (url) => {
      tried.push(String(url));
      if (String(url).includes("/boards/payit/jobs/7975853003")) {
        return {
          ok: true,
          json: async () => ({
            title: "Associate Software Engineer",
            company_name: "PayIt",
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    },
  });

  const initial = win.parseJobPage();
  assert.equal(initial.source, "greenhouse");
  assert.equal(initial.jobKey, "greenhouse:7975853003");
  assert.equal(win.isWeakRole(initial.role, "greenhouse"), true);
  assert.ok(win.greenhouseBoardTokenGuesses(initial).includes("payit"));

  const enriched = await win.enrichGreenhouseFromApi(initial);
  assert.equal(enriched.role, "Associate Software Engineer");
  assert.equal(enriched.company, "PayIt");
  assert.ok(tried.some((u) => u.includes("/boards/payit/jobs/7975853003")));
});
