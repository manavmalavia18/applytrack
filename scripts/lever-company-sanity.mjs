#!/usr/bin/env node
/**
 * Tiny sanity check for Lever path-slug → company + weak-company upgrade rules.
 * Run: node scripts/lever-company-sanity.mjs
 */

function titleCaseSlug(slug) {
  return (slug || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function scrubCompanyLever(t) {
  let c = (t || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s+logo$/i, "")
    .trim();
  const compact = c.replace(/\s/g, "");
  if (/^atomcomputing$/i.test(compact) || /^atom\s*computing$/i.test(c)) {
    return "Atom Computing";
  }
  return c;
}

function isWeakCompanyLever(t) {
  const s = (t || "").trim();
  if (/^(jobs|lever|www)$/i.test(s)) return true;
  if (
    /\b(engineer|developer|scientist|analyst|manager|designer|architect|specialist|director|intern|coordinator|consultant|officer|associate|recruiter)\b/i.test(
      s,
    )
  ) {
    return true;
  }
  return false;
}

function labelsMatch(a, b) {
  const x = (a || "").replace(/\s+/g, "").toLowerCase();
  const y = (b || "").replace(/\s+/g, "").toLowerCase();
  return Boolean(x && y && x === y);
}

function isUsableCompany(company, role, source) {
  const c = (company || "").trim();
  if (!c || (source === "lever" ? isWeakCompanyLever(c) : false)) return false;
  if (role && labelsMatch(c, role)) return false;
  return true;
}

function companyFromPath(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  const reservedSeg = /^(jobs|apply|postings?|lever)$/i;
  const companySlug =
    parts[0] && !reservedSeg.test(parts[0]) && !/^[0-9a-f-]{8,}$/i.test(parts[0])
      ? parts[0]
      : "";
  return scrubCompanyLever(titleCaseSlug(companySlug));
}

const path =
  "/atomcomputing/e6db0921-3a50-4c45-931a-deffbfa8d826/apply";
const role = "Software Engineer";
const fromSlug = companyFromPath(path);
const logo = scrubCompanyLever("Atom Computing logo");

const lockedBad = { company: "Software Engineer", role, locked: true };
const parsedGood = { company: logo || fromSlug, role, source: "lever" };

const prevCoOk = isUsableCompany(lockedBad.company, role, "lever");
const nextCoOk = isUsableCompany(parsedGood.company, role, "lever");
const mergedCompany = prevCoOk
  ? lockedBad.company
  : nextCoOk
    ? parsedGood.company
    : parsedGood.company;

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    failed++;
  } else {
    console.log("ok:", msg);
  }
}

assert(fromSlug === "Atom Computing", `slug → Atom Computing (got ${JSON.stringify(fromSlug)})`);
assert(logo === "Atom Computing", `logo alt strip → Atom Computing (got ${JSON.stringify(logo)})`);
assert(isWeakCompanyLever("jobs"), `jobs is weak company`);
assert(isWeakCompanyLever("Software Engineer"), `role-shaped company is weak`);
assert(!isUsableCompany("Software Engineer", role, "lever"), `company===role not usable`);
assert(!prevCoOk && nextCoOk && mergedCompany === "Atom Computing", `lock upgrades to Atom Computing`);

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll Lever company sanity checks passed.");
console.log({ path, role, company: mergedCompany });
