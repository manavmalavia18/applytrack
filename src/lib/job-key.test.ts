import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectSource, isJunkRole, cleanRoleTitle } from "./job-key.ts";

describe("detectSource", () => {
  it("keeps ATS hosts even when the first label is generic", () => {
    assert.equal(detectSource("https://jobs.ashbyhq.com/acme/uuid"), "ashby");
    assert.equal(detectSource("https://recruiting.paylocity.com/Recruiting/Jobs/Details/1"), "paylocity");
    assert.equal(detectSource("https://recruiting.ultipro.com/pow1009pows/JobBoard/x"), "ultipro");
    assert.equal(detectSource("https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/1"), "oracle");
    assert.equal(detectSource("https://www.esri.com/careers/1?gh_jid=5197137007"), "greenhouse");
    assert.equal(detectSource("https://career5.successfactors.eu/career?company=paccarinc"), "successfactors");
    assert.equal(detectSource("https://corporatejobs-alaskaair.icims.com/jobs/18929/x"), "icims");
  });

  it("does not use jobs/careers/recruiting as a source label", () => {
    assert.equal(detectSource("https://jobs.example.com/posting/1"), "web");
    assert.equal(detectSource("https://careers.oxfordeconomics.com/postings/1"), "web");
  });
});

describe("isJunkRole / cleanRoleTitle", () => {
  it("rejects chrome titles from the hosted capture audit", () => {
    assert.equal(isJunkRole("Already have an account?"), true);
    assert.equal(isJunkRole("Set your cookie preferences"), true);
    assert.equal(isJunkRole("iCIMS Careers Portal"), true);
    assert.equal(isJunkRole("Software Engineer"), false);
  });

  it("strips Job Application for prefixes", () => {
    assert.equal(
      cleanRoleTitle("Job Application for Software Engineer II"),
      "Software Engineer II",
    );
  });
});
