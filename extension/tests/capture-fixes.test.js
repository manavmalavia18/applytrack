"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadPage } = require("./helpers/loadPage");

test("1 Rippling: __NEXT_DATA__ description.role + description.company become the JD", () => {
  const win = loadPage({
    url: "https://ats.rippling.com/en-GB/joinroot/jobs/8ccff655-f4f0-4efb-aec4-79f64b1e708f",
    html: `<!doctype html><html><head><title>Software Engineer II</title></head>
      <body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
        props: {
          pageProps: {
            apiData: {
              jobPost: {
                name: "Software Engineer II",
                companyName: "Root Insurance",
                description: {
                  role: "<p>Own backend services, message queues, and production on-call for the quoting platform.</p>",
                  company: "<p>Root Insurance builds car insurance products used by drivers across the United States.</p>",
                },
              },
            },
          },
        },
      })}</script></body></html>`,
  });
  const parsed = win.parseJobPage();
  assert.equal(parsed.source, "rippling");
  assert.equal(parsed.company, "Root Insurance");
  assert.equal(parsed.role, "Software Engineer II");
  assert.match(parsed.jobDescription, /message queues/);
  assert.match(parsed.jobDescription, /Root Insurance builds car insurance/);
  assert.equal(parsed.captureConfidence, "high");
});

test("2 Greenhouse: boards API fills JD when title/company are already solid", async () => {
  const win = loadPage({
    url: "https://job-boards.greenhouse.io/cloudflare/jobs/8088751",
    html: `<!doctype html><html><head><title>Software Engineer | Cloudflare</title></head>
      <body><h1>Software Engineer</h1></body></html>`,
    fetchImpl: async (url) => {
      assert.match(String(url), /boards-api\.greenhouse\.io\/v1\/boards\/cloudflare\/jobs\/8088751/);
      return {
        ok: true,
        json: async () => ({
          title: "Software Engineer",
          company_name: "Cloudflare",
          content:
            "<p>Build and operate globally distributed systems at Cloudflare. You will own APIs, reliability, and production monitoring.</p>",
        }),
      };
    },
  });

  const initial = win.parseJobPage();
  assert.equal(initial.role, "Software Engineer");
  assert.equal(initial.company, "Cloudflare");
  assert.ok(!win.isDecentJobDescription(initial.jobDescription));

  const enriched = await win.enrichGreenhouseFromApi(initial);
  assert.match(enriched.jobDescription, /globally distributed systems/);
  assert.equal(enriched.role, "Software Engineer");
  assert.equal(enriched.company, "Cloudflare");
});

test("2 Greenhouse: skip API fetch when role, company, and JD are already solid", async () => {
  const win = loadPage({
    url: "https://careers.roblox.com/jobs?gh_jid=6234567",
    html: `<!doctype html><html><head><title>Software Engineer, User Frameworks | Roblox</title></head>
      <body>
        <h1 class="app-title">Software Engineer, User Frameworks</h1>
        <div id="job-description">${"We build immersive experiences for millions of players. ".repeat(4)}</div>
      </body></html>`,
    fetchImpl: async () => {
      throw new Error("should not fetch when the DOM parse already has a JD");
    },
  });

  const parsed = win.parseJobPage();
  assert.ok(win.isDecentJobDescription(parsed.jobDescription));
  const result = await win.enrichGreenhouseFromApi(parsed);
  assert.equal(result.role, "Software Engineer, User Frameworks");
  assert.equal(result.company, "Roblox");
});

test("2 Greenhouse: scrub 'Job Application for' prefix", () => {
  const win = loadPage({
    url: "https://job-boards.greenhouse.io/embed/job_app?for=aurorainnovation&token=8627496002",
    html: `<!doctype html><html><head><title>Job Application for Software Engineer II, Vehicle Platform</title></head>
      <body><h1>Job Application for Software Engineer II, Vehicle Platform</h1></body></html>`,
  });
  const parsed = win.parseJobPage();
  assert.equal(parsed.role, "Software Engineer II, Vehicle Platform");
});

test("3 SuccessFactors: careers hub without jobReqId stays Unknown role", () => {
  const win = loadPage({
    url: "https://career8.successfactors.com/careers?company=Grainger",
    html: `<!doctype html><html><head><title>Careers</title></head>
      <body>
        <h1>Already have an account?</h1>
        <div class="company-name">About Us Inclusion, Opportunity</div>
      </body></html>`,
  });
  const parsed = win.parseJobPage();
  assert.equal(parsed.role, "Unknown role");
  assert.equal(parsed.company, "Grainger");
  assert.equal(parsed.jobKey, null);
  assert.equal(parsed.captureConfidence, "low");
});

test("4 Weak titles: cookie banner, iCIMS portal, unsupported browser, resume upload", () => {
  const win = loadPage({ url: "https://example.com/" });
  assert.equal(win.isWeakRole("Set your cookie preferences", "adp"), true);
  assert.equal(win.isWeakRole("iCIMS Careers Portal", "icims"), true);
  assert.equal(win.isWeakRole("Your browser is unsupported", "icims"), true);
  assert.equal(win.isWeakRole("B Careers", "icims"), true);
  assert.equal(win.isWeakRole("Position Description", "taleo"), true);
  assert.equal(win.isWeakRole("Upload Your Resume", "taleo"), true);
  assert.equal(win.isWeakRole("Already have an account?", "successfactors"), true);
  assert.equal(win.isWeakRole("Software Engineer II", "greenhouse"), false);
  assert.equal(win.isWeakCompany("Firefox", "ultipro"), true);
  assert.equal(win.isWeakCompany("OneStream", "ultipro"), false);
  assert.equal(
    win.isWeakRole("PayIt Careers | Make Government Work Better | See Openings", "greenhouse"),
    true,
  );
  assert.equal(win.isWeakRole("PayIt Careers", "greenhouse"), true);
  assert.equal(win.isWeakRole("Associate Software Engineer", "greenhouse"), false);
  assert.equal(win.isWeakRole("Software Engineer | Backend", "greenhouse"), false);
});
