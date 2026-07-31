"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadPage } = require("./helpers/loadPage");

const FIXTURES_DIR = path.join(__dirname, "..", "fixtures");

const fixtureFiles = fs
  .readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith(".fixture.js"))
  .sort();

assert.ok(fixtureFiles.length > 0, "expected at least one fixture in extension/fixtures/");

for (const file of fixtureFiles) {
  // eslint-disable-next-line global-require, import/no-dynamic-require
  const fixture = require(path.join(FIXTURES_DIR, file));

  test(`parser fixture: ${fixture.name}`, () => {
    const win = loadPage({ url: fixture.url, html: fixture.html });
    const parsed = win.parseJobPage();

    for (const key of ["company", "role", "source", "jobKey", "captureConfidence"]) {
      if (fixture.expected[key] === undefined) continue;
      assert.equal(
        parsed[key],
        fixture.expected[key],
        `${fixture.name}: expected ${key} to equal ${JSON.stringify(fixture.expected[key])}, got ${JSON.stringify(parsed[key])}`,
      );
    }
  });
}
