"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const EXT_DIR = path.join(__dirname, "..", "..");
const ATS_SRC = fs.readFileSync(path.join(EXT_DIR, "ats.js"), "utf8");
const PARSERS_SRC = fs.readFileSync(path.join(EXT_DIR, "parsers.js"), "utf8");

/**
 * Boot a jsdom "page" and evaluate ats.js + parsers.js into its window — the
 * same shared-global-scope model Chrome uses for content_scripts, so parse*()
 * / lock / merge helpers all resolve exactly like they do in the extension.
 *
 * @param {object} opts
 * @param {string} opts.url - full URL the fixture page is "loaded" at
 * @param {string} [opts.html] - full HTML document string
 * @param {Function} [opts.fetchImpl] - optional fetch stub (board-API tests)
 * @returns {import("jsdom").DOMWindow}
 */
function loadPage({ url, html, fetchImpl } = {}) {
  const dom = new JSDOM(html || "<!doctype html><html><head></head><body></body></html>", {
    url,
    runScripts: "dangerously",
    pretendToBeVisual: true,
  });
  const win = dom.window;
  win.fetch =
    fetchImpl ||
    (() => Promise.reject(new Error("fetch not mocked for this fixture")));
  win.eval(ATS_SRC);
  win.eval(PARSERS_SRC);
  win.__dom = dom;
  return win;
}

/** Move an already-booted page to a new same-origin URL, keeping sessionStorage
 * intact (simulates SPA / multi-step navigation within one tab session). */
function navigateTo(win, url, html) {
  win.__dom.reconfigure({ url });
  if (html) {
    win.document.open();
    win.document.write(html);
    win.document.close();
  }
  return win;
}

module.exports = { loadPage, navigateTo };
