/** Site parsers — best-effort DOM extraction.
 * Per-ATS quirks (title/company scrub, weak locks) live in ats.js — do not add
 * source-specific hacks to shared remember/merge helpers below.
 */
function textOf(el) {
  return ((el && (el.innerText || el.textContent)) || "").trim().replace(/\s+/g, " ");
}

function isNoisePage() {
  const host = location.hostname.toLowerCase();
  const path = location.pathname.toLowerCase();
  const href = location.href.toLowerCase();
  const title = (document.title || "").toLowerCase();
  const h1 = textOf(document.querySelector("h1")).toLowerCase();

  // Dead / error surfaces — never treat as a job page
  if (
    /internal server error|403 forbidden|404 not found|access denied|service unavailable|bad gateway|error\s*[-–]\s*read/i.test(
      `${title} ${h1}`,
    )
  ) {
    return true;
  }
  if (/errors\.edgesuite\.net|akamai/i.test(href) && /error/i.test(title + h1)) return true;

  // Real ATS job pages — never treat as cookie/privacy chrome
  if (
    host.includes("oraclecloud.com") &&
    /\/job\/\d+|CandidateExperience.*job/i.test(location.href) &&
    !/\/my-profile|\/my-applications/i.test(path)
  ) {
    return false;
  }
  if (
    host.includes("greenhouse.io") ||
    host.includes("ashbyhq.com") ||
    host.includes("lever.co") ||
    host.includes("icims.com") ||
    host.includes("myworkdayjobs.com") ||
    host.includes("entertimeonline.com") ||
    host.includes("applytojob.com") ||
    host.includes("successfactors.com") ||
    host.includes("successfactors.eu") ||
    host.includes("paylocity.com") ||
    host.includes("ultipro.com") ||
    host.includes("ukg.com") ||
    host.includes("phenom.com") ||
    host.includes("phenompeople.com") ||
    host.includes("phenompro.com") ||
    host.includes("salesforce-sites.com") ||
    host.includes("force.com") ||
    host.includes("bamboohr.com") ||
    host.includes("workable.com") ||
    host.includes("taleo.net") ||
    host.includes("dayforcehcm.com") ||
    host.includes("dayforce.com") ||
    (host.includes("linkedin.com") && path.includes("/jobs"))
  ) {
    // Still skip if the ATS shell loaded an error document
    if (/internal server error|service unavailable/i.test(`${title} ${h1}`)) return true;
    return false;
  }

  // Cookie / CMP portals only (not company career sites named OneTrust)
  if (/onetrust\.com|trustarc\.com|cookiebot\.com|cookielaw\.org/.test(host)) return true;
  if (/\/privacy|\/cookie|\/consent|\/gdpr|\/preferences|\/legal\//.test(path)) return true;
  if (/#onetrust|#cookie-settings|#consent/.test(href)) return true;
  return false;
}

/** True when this frame looks like a real job / application surface. */
function isSupportedJobPage() {
  if (isNoisePage()) return false;

  const host = location.hostname.replace(/^www\./, "");
  const path = location.pathname;
  const params = new URLSearchParams(location.search);

  if (host.includes("linkedin.com") && path.includes("/jobs")) return true;
  // boards.greenhouse.io + job-boards.greenhouse.io + embeds (always show UI)
  if (
    host === "job-boards.greenhouse.io" ||
    host === "boards.greenhouse.io" ||
    host.includes("greenhouse.io") ||
    host.includes("greenhouse.com")
  ) {
    return true;
  }
  if (host.includes("lever.co")) return true;
  if (host.includes("myworkdayjobs.com") || /workday\.com$/i.test(host)) return true;
  if (host.includes("ashbyhq.com")) return true;
  if (host.includes("icims.com")) return true;
  // Oracle Taleo (UHG, etc.) — careersection apply + job detail
  if (
    host.includes("taleo.net") &&
    /careersection|jobdetail|requisition|reqNo=|application\.jss/i.test(location.href)
  ) {
    return true;
  }
  // Dayforce HCM job boards
  if (
    (host.includes("dayforcehcm.com") || host.includes("dayforce.com")) &&
    /\/jobs\/|\/job\/|Apply|Candidate/i.test(location.href)
  ) {
    return true;
  }
  // JazzHR
  if (host.includes("applytojob.com") || host.includes("jazz.co")) return true;
  // SAP SuccessFactors (PACCAR, etc.)
  if (host.includes("successfactors.com") || host.includes("successfactors.eu")) return true;
  // Paylocity recruiting
  if (host.includes("paylocity.com") && /Recruiting|Jobs|Details|Apply/i.test(location.href)) {
    return true;
  }
  // UKG Pro / UltiPro
  if (
    (host.includes("ultipro.com") || host.includes("ukg.com")) &&
    /JobBoard|OpportunityDetail|opportunityId|Recruiting/i.test(location.href)
  ) {
    return true;
  }
  // Phenom career sites (Kuehne+Nagel, etc.)
  if (
    host.includes("phenom.com") ||
    host.includes("phenompeople.com") ||
    host.includes("phenompro.com")
  ) {
    return true;
  }
  // Salesforce Sites / Experience Cloud apply forms
  if (
    (host.includes("salesforce-sites.com") || host.includes("force.com")) &&
    /Applicant|jobID|JobApplication|careers|Recruit/i.test(location.href)
  ) {
    return true;
  }
  // BambooHR careers (and apply flow under /careers)
  if (host.includes("bamboohr.com")) return true;
  // Workable job boards
  if (host.includes("workable.com") && /\/view\/|\/jobs\/|\/j\//i.test(location.pathname + location.href)) {
    return true;
  }
  if (host.includes("workable.com") && /jobs\.workable|apply\.workable/i.test(host + location.href)) {
    return true;
  }
  // ADP / EnterTimeOnline career portals
  if (host.includes("entertimeonline.com")) return true;
  if (host.includes("adp.com") && /careers|ShowJob|recruit|workforcenow|JobDetails|cid=/i.test(location.href)) {
    return true;
  }
  if (host.includes("workforcenow.adp.com")) return true;
  // Oracle Cloud HCM — job detail or in-progress apply for that job (not profile/list)
  if (
    host.includes("oraclecloud.com") &&
    /\/job\/\d+|\/jobs\/\d+/i.test(location.pathname) &&
    !/\/my-profile|\/my-applications|\/info-and-alerts/i.test(location.pathname)
  ) {
    return true;
  }
  if (/\/jobs\/\d+/.test(path) && /job-boards|boards\.greenhouse|greenhouse/i.test(host)) {
    return true;
  }

  // Embedded Greenhouse on company career sites
  if (params.get("gh_jid")) return true;
  if (location.hash.includes("grnhse_app")) return true;
  if (document.getElementById("grnhse_app")) return true;

  // Greenhouse iframe document
  if (document.querySelector("#main_fields, #application, .application--form")) {
    if (host.includes("greenhouse") || params.get("for") || params.get("token")) return true;
  }

  return false;
}

/** Career-ish URL worth briefly waiting for embeds (avoid polling every site). */
function mightBecomeJobPage() {
  if (isNoisePage()) return false;
  const path = location.pathname.toLowerCase();
  // Oracle profile / apps list — never wait for a job embed
  if (
    location.hostname.includes("oraclecloud.com") &&
    /\/my-profile|\/my-applications|\/info-and-alerts/i.test(path)
  ) {
    return false;
  }
  if (
    location.hostname.includes("oraclecloud.com") &&
    /\/job\/\d+|CandidateExperience.*\/job\//i.test(location.href)
  ) {
    return true;
  }
  return /careers|\/jobs\/|\/job\/|\/apply\/|\/view\/|portalcareer|gh_jid|greenhouse|ashbyhq|lever\.co|myworkdayjobs|grnhse|icims|entertimeonline|ShowJob|applytojob|successfactors|paylocity|ultipro|OpportunityDetail|opportunityId|phenom|salesforce-sites|Applicant_Insert|jobID=|bamboohr|workable|workforcenow\.adp|adp\.com|taleo\.net|careersection|reqNo=|dayforcehcm|dayforce\.com/i.test(
    location.href,
  );
}

function parseDayforce() {
  // https://jobs.dayforcehcm.com/en-US/nbhbank/bankmidwest/jobs/32164
  const parts = location.pathname.split("/").filter(Boolean);
  const jobsIdx = parts.findIndex((p) => /^jobs?$/i.test(p));
  const jobId =
    (jobsIdx >= 0 && parts[jobsIdx + 1] && /^\d+$/.test(parts[jobsIdx + 1])
      ? parts[jobsIdx + 1]
      : "") ||
    location.pathname.match(/\/jobs\/(\d+)/i)?.[1] ||
    "";
  const siteSlug = jobsIdx >= 1 ? parts[jobsIdx - 1] : "";
  const clientSlug = jobsIdx >= 2 ? parts[jobsIdx - 2] : "";

  const bad =
    /^(search jobs|sign in|careers|job description|apply|save|share|posted|home|english|united states)$/i;

  function pick(...cands) {
    for (const raw of cands) {
      const t = (raw || "").trim().replace(/\s+/g, " ");
      if (!t || t.length < 5 || bad.test(t)) continue;
      if (isWeakRole(t, "dayforce")) continue;
      return t;
    }
    return "";
  }

  const role = pick(
    textOf(document.querySelector("h1")),
    textOf(document.querySelector("[class*='job-title'], [class*='jobTitle'], [data-automation-id*='jobTitle']")),
    textOf(document.querySelector("[class*='JobTitle']")),
    document.title.split(/[|–—]/).map((s) => s.trim())[0],
  );

  function titleCaseSlug(slug) {
    return (slug || "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }

  // Prefer site brand (bankmidwest) over client code (nbhbank)
  let company = scrubCompany(titleCaseSlug(siteSlug), "dayforce");
  if (!company || isWeakCompany(company, "dayforce")) {
    company = scrubCompany(titleCaseSlug(clientSlug), "dayforce");
  }

  const fromLogo = textOf(
    document.querySelector("header img[alt], a[href*='careers'] img[alt], .logo img[alt]"),
  );
  if (
    fromLogo &&
    fromLogo.length < 60 &&
    !isWeakCompany(fromLogo, "dayforce") &&
    !/logo|image|dayforce/i.test(fromLogo)
  ) {
    company = scrubCompany(fromLogo, "dayforce");
  }

  // Description often names the employer (NBH Bank)
  if (!company || isWeakCompany(company, "dayforce")) {
    const body = (document.body?.innerText || "").slice(0, 3000);
    if (/\bNBH Bank\b/i.test(body)) company = "NBH Bank";
    else if (/\bBank Midwest\b/i.test(body)) company = "Bank Midwest";
  }
  company = scrubCompany(company, "dayforce") || company;

  const jobKey = jobId
    ? `dayforce:${(clientSlug || siteSlug || "job").toLowerCase()}:${jobId}`
    : null;

  return {
    company: company || "Unknown",
    role: role || "Unknown role",
    url: location.href.split("?")[0].split("#")[0],
    jobKey,
    source: "dayforce",
  };
}

function parseTaleo() {
  // https://uhg.taleo.net/careersection/application.jss?...&reqNo=3247475
  // https://company.taleo.net/careersection/.../jobdetail.ftl?job=…
  const params = new URLSearchParams(location.search);
  const reqNo =
    params.get("reqNo") ||
    params.get("requisition") ||
    params.get("job") ||
    params.get("jobId") ||
    params.get("rid") ||
    location.pathname.match(/\/jobdetail[^/]*\/(?:job\/)?(\d+)/i)?.[1] ||
    "";

  const bad =
    /^(privacy agreement|welcome|sign in|log in|my profile|my dashboard|select a language|job applicant|application|submit|review|questionnaire|eeo|equal opportunity|attachment|e-?signature|work here|our culture|hiring process|early careers|blog|home)$/i;

  function pick(...cands) {
    for (const raw of cands) {
      const t = (raw || "").trim().replace(/\s+/g, " ");
      if (!t || t.length < 5 || bad.test(t)) continue;
      if (isWeakRole(t, "taleo")) continue;
      return t;
    }
    return "";
  }

  const role = pick(
    textOf(
      document.querySelector(
        "[id*='reqTitle'], [id*='ReqTitle'], [class*='reqTitle'], [class*='jobtitle'], [class*='jobTitle'], .jobtitle, #jobTitle",
      ),
    ),
    textOf(document.querySelector(".titlepage, .titleblock, .job-header h1")),
    textOf(document.querySelector("h1")),
    textOf(document.querySelector("h2")),
    document.title
      .split(/[|–—]/)
      .map((s) => s.trim())
      .find((s) => s && !bad.test(s) && s.length > 5 && !isWeakRole(s, "taleo")),
  );

  // Tenant subdomain → brand: uhg.taleo.net → UnitedHealth Group (via ats.js)
  const sub = location.hostname.replace(/\.taleo\.net$/i, "").replace(/^www\./, "");
  let company = scrubCompany(
    sub.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    "taleo",
  );

  const fromLogo = textOf(
    document.querySelector(
      "header img[alt], .header img[alt], .logo img[alt], img[alt*='United'], img[alt*='Optum']",
    ),
  );
  if (fromLogo && fromLogo.length < 60 && !isWeakCompany(fromLogo, "taleo") && !/logo|image/i.test(fromLogo)) {
    company = scrubCompany(fromLogo, "taleo");
  }

  // Policy / header copy often names the employer
  if (!company || company === "Uhg" || /^uhg$/i.test(company)) {
    const body = (document.body?.innerText || "").slice(0, 2500);
    if (/unitedhealth\s*group/i.test(body)) company = "UnitedHealth Group";
    else if (/\boptum\b/i.test(body)) company = "Optum";
  }
  company = scrubCompany(company, "taleo") || company;

  return {
    company: company || "Unknown",
    role: role || "Unknown role",
    url: location.href.split("#")[0],
    jobKey: reqNo ? `taleo:${reqNo}` : null,
    source: "taleo",
  };
}

function parseLinkedIn() {
  const role =
    textOf(document.querySelector(".job-details-jobs-unified-top-card__job-title")) ||
    textOf(document.querySelector("h1")) ||
    "";
  const company =
    textOf(document.querySelector(".job-details-jobs-unified-top-card__company-name a")) ||
    textOf(document.querySelector(".job-details-jobs-unified-top-card__company-name")) ||
    "";
  const jobIdMatch =
    location.href.match(/currentJobId=(\d+)/) ||
    location.pathname.match(/\/jobs\/view\/(\d+)/);
  return {
    company,
    role,
    url: location.href,
    jobKey: jobIdMatch ? `linkedin:${jobIdMatch[1]}` : null,
    source: "linkedin",
  };
}

function parseGreenhouse() {
  const jid =
    new URLSearchParams(location.search).get("gh_jid") ||
    location.pathname.match(/\/jobs\/(\d+)/)?.[1] ||
    location.pathname.match(/\/(\d{6,})\/?$/)?.[1] ||
    "";

  const badTitle =
    /^(job details|careers?|jobs?|overview|home|about|application|apply now|all jobs|thank you|thanks for|confirmation|follow your application)\b/i;

  function pickRole(...candidates) {
    for (const raw of candidates) {
      const t = (raw || "").trim().replace(/\s+/g, " ");
      if (!t || t.length < 4 || t.length > 180) continue;
      if (badTitle.test(t)) continue;
      if (/thank you|thanks for applying/i.test(t)) continue;
      return t;
    }
    return "";
  }

  const docTitle = document.title
    .split("|")[0]
    .split(" - ")
    .map((s) => s.trim())
    .filter((s) => s && !badTitle.test(s) && !/thank you|thanks for applying/i.test(s));

  const role = pickRole(
    textOf(document.querySelector("h1.app-title, .app-title")),
    textOf(document.querySelector("[data-testid='job-title'], .job-title, .posting-headline h2")),
    ...[...document.querySelectorAll("h1, h2")].map((n) => textOf(n)),
    ...docTitle,
  );

  let company =
    textOf(document.querySelector(".company-name")) ||
    textOf(document.querySelector('[class*="company"]')) ||
    "";
  // job-boards.greenhouse.io/{board}/jobs/{id}
  const board = location.pathname.split("/").filter(Boolean)[0] || "";
  if (
    (!company || /greenhouse|job.?board/i.test(company)) &&
    board &&
    !/^(jobs|embeds|embed)$/i.test(board)
  ) {
    company = board.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
  if (!company) {
    const host = location.hostname.replace(/^www\./, "");
    if (!host.includes("greenhouse")) {
      company = host.split(".")[0].replace(/-/g, " ");
      company = company.charAt(0).toUpperCase() + company.slice(1);
    } else {
      company =
        document.title.split(" at ").pop()?.replace(/\s*\|.*/, "").trim() || host;
    }
  }
  if (/flock\s*homes/i.test(company) || /^flockhomes$/i.test(company.replace(/\s/g, ""))) {
    company = "Flock Homes";
  }

  return {
    company,
    role: role || "Unknown role",
    url: location.href.split("#")[0],
    jobKey: jid ? `greenhouse:${jid}` : null,
    source: "greenhouse",
  };
}

function parseLever() {
  const role = textOf(document.querySelector(".posting-headline h2, h2")) || "";
  const company =
    textOf(document.querySelector(".main-header-logo img[alt]")) ||
    location.hostname.split(".")[0] ||
    "";
  return {
    company: company.replace(/^Logo$/i, location.hostname),
    role,
    url: location.href,
    jobKey: null,
    source: "lever",
  };
}

function parseWorkday() {
  // https://company.wd5.myworkdayjobs.com/.../job/City/Role-Title_JR12345
  // Apply steps often change the path — lock on requisition / job id.
  const path = location.pathname;
  const href = location.href;

  const reqId =
    path.match(/_((?:JR|R|REQ)[-_]?\d{3,})\b/i)?.[1] ||
    href.match(/_((?:JR|R|REQ)[-_]?\d{3,})\b/i)?.[1] ||
    path.match(/\/job\/[^/]+\/[^/]*?((?:JR|R|REQ)[-_]?\d{3,})/i)?.[1] ||
    new URLSearchParams(location.search).get("jobRequisitionId") ||
    new URLSearchParams(location.search).get("requisitionId") ||
    "";

  // Fallback: stable segment under /job/… (before /apply)
  const jobSeg =
    path.match(/\/job\/(.+?)(?:\/apply|\?|$)/i)?.[1]?.replace(/\/+$/, "") || "";

  const jobKey = reqId
    ? `workday:${reqId.toUpperCase()}`
    : jobSeg
      ? `workday:${location.hostname.replace(/^www\./, "")}/${jobSeg}`
      : null;

  const bad =
    /^(apply|start your apply|autofil|sign in|create account|my applications|job description|workday|next|submit|review)\b/i;

  function pick(...cands) {
    for (const raw of cands) {
      const t = (raw || "").trim().replace(/\s+/g, " ");
      if (!t || t.length < 5 || bad.test(t)) continue;
      if (typeof isWeakRole === "function" && isWeakRole(t)) continue;
      return t;
    }
    return "";
  }

  // Title_JR12345 → Title
  let fromPath = "";
  if (jobSeg) {
    const last = jobSeg.split("/").pop() || "";
    fromPath = last
      .replace(/_((?:JR|R|REQ)[-_]?\d{3,})$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  const role = pick(
    textOf(document.querySelector('[data-automation-id="jobPostingHeader"]')),
    textOf(document.querySelector('[data-automation-id="jobTitle"]')),
    textOf(document.querySelector("h2")),
    textOf(document.querySelector("h1")),
    fromPath,
    document.title.split("|")[0].split("–")[0].split("-")[0],
  );

  const host = location.hostname.replace(/^www\./, "");
  let company = host.split(".")[0] || "Workday";
  // nvidia.wd5.myworkdayjobs.com → nvidia
  if (/\.myworkdayjobs\.com$/i.test(host)) {
    company = host.split(".")[0];
  }
  company = company.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const logo = textOf(document.querySelector("img[alt], [data-automation-id='logo'] img[alt]"));
  if (logo && logo.length > 2 && logo.length < 60 && !/logo|workday|image/i.test(logo)) {
    company = logo;
  }

  // Listing URL without /apply suffix — better for locking
  const listingUrl = location.href
    .split("?")[0]
    .replace(/\/apply\/?.*$/i, "")
    .replace(/\/+$/, "");

  return {
    company: company || "Workday",
    role: role || fromPath || "Unknown role",
    url: listingUrl || location.href.split("?")[0],
    jobKey,
    source: "workday",
  };
}

function parseAshby() {
  const role = textOf(document.querySelector("h1")) || document.title.split("|")[0].trim() || "";
  const parts = location.pathname.split("/").filter(Boolean);
  const org = (parts[0] || "").toLowerCase();
  const jobId = parts.find((p, i) => i > 0 && /^[0-9a-f-]{8,}$/i.test(p)) || parts[1] || "";
  let company = org.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const atMatch = document.title.match(/@\s*(.+?)(?:\s*[|\-]|$)/);
  if (atMatch) company = atMatch[1].trim();
  return {
    company,
    role,
    url: location.href.split("?")[0],
    jobKey: jobId ? `ashby:${jobId}` : org ? `ashby:${org}` : null,
    source: "ashby",
  };
}

function parseIcims() {
  // Listing + wizard share /jobs/{id}/… — keep id across /candidate, /login, etc.
  // https://careers-peraton.icims.com/jobs/169251/.net--angular-software-developer/candidate
  const path = location.pathname;
  const jobId = path.match(/\/jobs\/(\d+)/)?.[1] || "";

  // Wizard / chrome path segments — never treat as the job title slug
  const wizardSeg =
    /^(job|jobs|candidate|login|apply|form|intro|resume|profile|questions?|eeo|assessment|confirmation|thank-?you|connect|account)$/i;

  // Prefer the readable slug after /jobs/{id}/ (skip wizard steps like /candidate)
  const afterId = (path.match(/\/jobs\/\d+\/(.+)/i)?.[1] || "").replace(/\/+$/, "");
  const slugSeg =
    afterId
      .split("/")
      .map((s) => {
        try {
          return decodeURIComponent(s);
        } catch {
          return s;
        }
      })
      .find((s) => s && !wizardSeg.test(s) && !/^\d+$/.test(s)) || "";

  let fromSlug = "";
  if (slugSeg) {
    // iCIMS encodes "/" as "--" → .net--angular-… → .NET/ Angular …
    fromSlug = slugSeg
      .replace(/--+/g, "/")
      .replace(/[-_]+/g, " ")
      .replace(/\s*\/\s*/g, "/ ")
      .replace(/\s+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .replace(/\.Net\b/gi, ".NET")
      .replace(/\bJob\b/gi, "")
      .trim();
  }

  const bad =
    /^(talent acquisition|candidate(\s+profile)?|profile|unknown|careers?|jobs?|login|home|enter your (information|info)|create (a |your )?login|connect your account|resume( upload)?|personal information|additional information|work experience|education|equal opportunity|review|submit|application|preferences|demographics|voluntary|self identify|thank you)\b/i;

  function pick(...cands) {
    for (const raw of cands) {
      const t = (raw || "").trim().replace(/\s+/g, " ");
      if (!t || t.length < 5 || bad.test(t)) continue;
      if (isWeakRole(t, "icims")) continue;
      // Prefer titles that look like roles, not form section headers
      if (/^(enter|please|complete|fill|provide|create|connect)\b/i.test(t)) continue;
      return t;
    }
    return "";
  }

  // Slug first — DOM on wizard steps is "Candidate profile" / "Enter your information"
  const role = pick(
    fromSlug,
    textOf(document.querySelector(".iCIMS_Header, .iCIMS_JobHeader, [class*='JobTitle']")),
    textOf(document.querySelector("h1")),
    document.title
      .split("|")[0]
      .split("-")
      .map((s) => s.trim())
      .find((s) => s && !bad.test(s) && s.length > 5 && !isWeakRole(s, "icims")),
  );

  // Hostname tenant → company: apply2-republicfinance.icims.com → Republic Finance
  // Brand aliases / ApplyN chrome → ats.js → ApplyTrackATS.icims
  const host = location.hostname.replace(/^www\./, "");
  let company = host
    .replace(/\.icims\.com$/i, "")
    .replace(/^(corporatejobs|jobs|careers|apply)\d*-/i, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
  company = scrubCompany(company, "icims");

  const safeSlug = fromSlug && !isWeakRole(fromSlug, "icims") ? fromSlug : "";

  return {
    company: company || "iCIMS",
    role: role || safeSlug || "Unknown role",
    url: location.href.split("?")[0],
    jobKey: jobId ? `icims:${jobId}` : null,
    source: "icims",
  };
}

function parseAdp() {
  // EnterTimeOnline: ?ShowJob=…
  // Workforce Now: workforcenow.adp.com/… Software Developer, Requisition ID: 3024
  const params = new URLSearchParams(location.search);
  const body = (document.body?.innerText || "").slice(0, 6000);

  const reqId =
    body.match(/Requisition\s*(?:ID|#)?\s*[:.]?\s*(\d{3,})/i)?.[1] ||
    params.get("reqId") ||
    params.get("requisitionId") ||
    "";

  const jobId =
    params.get("ShowJob") ||
    params.get("jobId") ||
    params.get("JobId") ||
    params.get("jobId") ||
    reqId ||
    params.get("cid") ||
    "";

  const bad =
    /^(apply for job|apply|hello|log in|sign in|careers?|career center|recruitment|home|talent|back|regular full-?time|new york|salary|job description)\b/i;

  function pick(...cands) {
    for (const raw of cands) {
      const t = (raw || "").trim().replace(/\s+/g, " ");
      if (!t || t.length < 3 || bad.test(t)) continue;
      if (typeof isWeakRole === "function" && isWeakRole(t)) continue;
      if (/career center|recruitment/i.test(t)) continue;
      return t;
    }
    return "";
  }

  const headingCandidates = [...document.querySelectorAll("h1, h2, h3")]
    .map((n) => textOf(n))
    .filter(Boolean);

  const roleLike = headingCandidates.find((t) =>
    /engineer|developer|scientist|analyst|consultant|manager|designer|architect|specialist|officer|associate/i.test(
      t,
    ),
  );

  // Title often above "New York, NY, US" / job type line
  const roleNearMeta =
    body.match(
      /\n\s*([A-Z][^\n]{3,90})\s*\n\s*(?:[A-Za-z .]+,\s*[A-Z]{2}|Regular|Full-?Time|Part-?Time|Requisition)/i,
    )?.[1]?.trim() || "";

  const role = pick(
    roleLike,
    roleNearMeta,
    ...headingCandidates,
    textOf(document.querySelector("[class*='job-title'], [class*='JobTitle'], [class*='jobTitle']")),
    // Never prefer bare document.title chrome like "Career Center | Recruitment"
    document.title
      .split("|")
      .map((s) => s.trim())
      .find((s) => s && !bad.test(s) && !/career center|recruitment/i.test(s)),
  );

  let company = "";
  // JD often: "Municipal Credit Union (MCU) is a…"
  const fromJd =
    body.match(
      /\b((?:Municipal Credit Union|MCU|[A-Z][A-Za-z0-9&.' -]{2,60}?)\s+(?:Credit Union|Bank|Inc|LLC|Corporation|Corp|Company|Group))\b/,
    )?.[1] ||
    body.match(/\b(Municipal Credit Union)\b/i)?.[1] ||
    "";
  if (fromJd) company = fromJd.trim();

  if (!company) {
    const portal = location.pathname.match(/\/ta\/([^./]+)/)?.[1] || "";
    company = portal
      .replace(/A\d+S/i, "")
      .replace(/\.careers$/i, "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .trim();
  }
  if (!company) {
    const logo = textOf(document.querySelector("header img[alt], .logo img[alt], img[alt]"));
    if (logo && logo.length > 2 && logo.length < 60 && !/logo|adp|image|career/i.test(logo)) {
      company = logo;
    }
  }
  if (!company || /^(workforcenow|adp|career)$/i.test(company)) {
    company = fromJd || "ADP";
  }
  company = company.replace(/\b\w/g, (c) => c.toUpperCase());
  if (/municipal credit union/i.test(company)) company = "Municipal Credit Union";

  const jobKey = jobId
    ? `adp:${jobId}`
    : reqId
      ? `adp:${reqId}`
      : null;

  return {
    company: company || "ADP",
    role: role || "Unknown role",
    url: location.href.split("#")[0],
    jobKey,
    source: "adp",
  };
}

function parseJazzHr() {
  // https://bespoketechinc.applytojob.com/apply/HzxiboCT0V/Software-Engineer
  const path = location.pathname;
  const applyMatch = path.match(/\/apply\/([^/]+)(?:\/([^/]+))?/i);
  const jobId = applyMatch?.[1] || "";
  const fromSlug = applyMatch?.[2]
    ? applyMatch[2].replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "";

  const bad =
    /^(apply for this position|apply now|careers?|jobs?|home|sign in|log in|share)\b/i;

  function pick(...cands) {
    for (const raw of cands) {
      const t = (raw || "").trim().replace(/\s+/g, " ");
      if (!t || t.length < 3 || bad.test(t)) continue;
      return t;
    }
    return "";
  }

  const role = pick(
    textOf(document.querySelector("h1")),
    textOf(document.querySelector("h2")),
    textOf(document.querySelector(".job-header h1, .job-title, [class*='job-title']")),
    fromSlug,
    document.title.split("|")[0].split("-")[0],
  );

  // Title often: "Software Engineer - Bespoke Technologies, Inc. - Career Page"
  const titleParts = document.title
    .split(" - ")
    .map((s) => s.trim())
    .filter(Boolean);

  const host = location.hostname.replace(/^www\./, "");
  let company = titleParts.find(
    (p) =>
      p.length > 3 &&
      !/career|software engineer|apply|position/i.test(p) &&
      /inc\.?|llc|ltd|corp|technologies|labs|systems/i.test(p),
  );

  if (!company) {
    company = host
      .replace(/\.applytojob\.com$/i, "")
      .replace(/\.jazzhr\.com$/i, "")
      .replace(/\.jazz\.co$/i, "");
    if (company.includes(".")) company = company.split(".")[0];
    company = company
      .replace(/inc$/i, " Inc")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }

  const fromPage =
    textOf(document.querySelector(".company-name, [class*='company'] a, header .logo + *")) ||
    textOf(document.querySelector("img[alt*='logo' i], header img[alt]"));
  if (fromPage && fromPage.length > 2 && fromPage.length < 80 && !/logo|image/i.test(fromPage)) {
    company = fromPage;
  }

  // Prefer role from title when h1 is weak
  const roleFromTitle = titleParts.find(
    (p) => p && !/career page|bespoke|inc\.?/i.test(p) && p.length > 3 && p.length < 100,
  );
  const finalRole = role || roleFromTitle || "Unknown role";

  return {
    company: company || "JazzHR",
    role: finalRole,
    url: location.href.split("?")[0],
    jobKey: jobId ? `jazzhr:${jobId}` : null,
    source: "jazzhr",
  };
}

function parseWorkable() {
  // https://jobs.workable.com/view/d2s6Wu62Ef85iBE6qwbWhp/software-engineer-in-plano-at-samsung-sds-america
  const path = location.pathname;
  const viewMatch = path.match(/\/view\/([^/]+)(?:\/([^/]+))?/i);
  const jobId = viewMatch?.[1] || path.match(/\/j\/([^/]+)/i)?.[1] || "";
  const slug = viewMatch?.[2] || "";

  let fromSlug = "";
  if (slug) {
    try {
      fromSlug = decodeURIComponent(slug);
    } catch {
      fromSlug = slug;
    }
    // software-engineer-in-plano-at-samsung-sds-america → Software Engineer
    fromSlug = fromSlug
      .replace(/-in-.*$/i, "")
      .replace(/-at-.*$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }

  const bad =
    /^(apply now|share job|description|visit website|careers?|jobs?|home|sign in|on-site|full-time|posted)\b/i;

  function pick(...cands) {
    for (const raw of cands) {
      const t = (raw || "").trim().replace(/\s+/g, " ");
      if (!t || t.length < 3 || bad.test(t)) continue;
      if (typeof isWeakRole === "function" && isWeakRole(t)) continue;
      return t;
    }
    return "";
  }

  const role = pick(
    textOf(document.querySelector("h1")),
    textOf(document.querySelector("h2")),
    textOf(document.querySelector("[data-ui='job-title'], [class*='job-title']")),
    fromSlug,
    document.title.split("|")[0].split("-")[0],
  );

  let company =
    textOf(document.querySelector("[data-ui='company-name'], [class*='company-name'] a, [class*='company'] a")) ||
    textOf(document.querySelector("aside h2, aside h3, [class*='company'] h2"));
  if (!company || /visit website|samsung sds$/i.test(company) && company.length > 40) {
    /* keep trying */
  }
  // "Software Engineer at Samsung SDS America" / sidebar "SAMSUNG SDS"
  const atMatch =
    (document.body?.innerText || "").match(/\bat\s+(Samsung SDS(?: America)?)\b/i) ||
    document.title.match(/\bat\s+([^|\-]+)/i);
  if ((!company || company.length < 3) && atMatch) company = atMatch[1].trim();
  if (!company) {
    company = textOf(document.querySelector("img[alt]")) || "";
    if (/logo|workable|image/i.test(company) || company.length > 60) company = "";
  }
  if (/^SAMSUNG SDS$/i.test(company)) company = "Samsung SDS America";
  if (!company) company = "Workable";

  return {
    company,
    role: role || fromSlug || "Unknown role",
    url: location.href.split("?")[0],
    jobKey: jobId ? `workable:${jobId}` : null,
    source: "workable",
  };
}

function parseBambooHr() {
  // https://selectorsoftware.bamboohr.com/careers/193
  const path = location.pathname;
  const jobId =
    path.match(/\/careers\/(\d+)/i)?.[1] ||
    path.match(/\/jobs\/(\d+)/i)?.[1] ||
    new URLSearchParams(location.search).get("id") ||
    "";

  const bad =
    /^(apply for this job|about us|about the role|responsibilities|careers?|jobs?|home|sign in|location|department|employment type|minimum experience|link to this job|share|bamboohr|selector)$/i;

  function pick(...cands) {
    for (const raw of cands) {
      const t = (raw || "").trim().replace(/\s+/g, " ");
      if (!t || t.length < 3 || bad.test(t)) continue;
      if (typeof isWeakRole === "function" && isWeakRole(t)) continue;
      return t;
    }
    return "";
  }

  // Prefer the large listing title (often the first substantial h2 in main)
  const headingCandidates = [...document.querySelectorAll("h1, h2, h3")]
    .map((n) => textOf(n))
    .filter((t) => t && t.length >= 3 && t.length < 160);

  const role = pick(
    ...headingCandidates,
    textOf(document.querySelector("[class*='job-title'], [class*='JobTitle'], .ResAts__title")),
    document.title
      .split("|")
      .map((s) => s.trim())
      .find((s) => s && !bad.test(s) && !isWeakRole(s)),
  );

  const host = location.hostname.replace(/^www\./, "");
  let company = host
    .replace(/\.bamboohr\.com$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
  if (/^Selector\s*Software$/i.test(company) || /^Selectorsoftware$/i.test(company.replace(/\s/g, ""))) {
    company = "Selector";
  }
  const logo = textOf(document.querySelector("header img[alt], .logo img[alt], img[alt]"));
  if (
    logo &&
    logo.length > 1 &&
    logo.length < 40 &&
    !/logo|bamboo|image|bamboohr/i.test(logo)
  ) {
    company = logo.replace(/\s+/g, " ").trim();
  }
  if (/^SELECTOR$/i.test(company)) company = "Selector";
  if (isWeakCompany(company) || /^bamboohr$/i.test(company)) {
    company = "Selector";
  }

  return {
    company: company || "Selector",
    role: role || "Unknown role",
    url: location.href.split("?")[0],
    jobKey: jobId ? `bamboohr:${jobId}` : null,
    source: "bamboohr",
  };
}

function parseSalesforceSites() {
  // https://intellibee.my.salesforce-sites.com/apps/Applicant_Insert?jobID=a0AUU0000007gTnx2AE
  const params = new URLSearchParams(location.search);
  const jobId =
    params.get("jobID") ||
    params.get("jobId") ||
    params.get("JobId") ||
    params.get("jid") ||
    location.pathname.match(/\/job\/([^/?#]+)/i)?.[1] ||
    "";

  const bad =
    /^(welcome|resume|contact info|current mailing address|apply|careers?|jobs?|home|sign in|click to upload|first name|last name)\b/i;

  function pick(...cands) {
    for (const raw of cands) {
      const t = (raw || "").trim().replace(/\s+/g, " ");
      if (!t || t.length < 5 || bad.test(t)) continue;
      if (typeof isWeakRole === "function" && isWeakRole(t)) continue;
      return t;
    }
    return "";
  }

  // "Job Title: Artificial Intelligence Developer"
  const body = (document.body?.innerText || "").slice(0, 4000);
  const labeled =
    body.match(/Job\s*Title\s*:\s*([^\n\r]+)/i)?.[1]?.trim() ||
    textOf(document.body).match(/Job\s*Title\s*:\s*([^\n]+)/i)?.[1]?.trim() ||
    "";

  const role = pick(
    labeled,
    textOf(document.querySelector("h1")),
    textOf(document.querySelector("h2")),
    textOf(document.querySelector("[class*='job-title'], [class*='JobTitle']")),
    document.title.split("|")[0].split("-")[0],
  );

  const host = location.hostname.replace(/^www\./, "");
  // intellibee.my.salesforce-sites.com → Intellibee
  let company = host
    .replace(/\.my\.salesforce-sites\.com$/i, "")
    .replace(/\.salesforce-sites\.com$/i, "")
    .replace(/\.force\.com$/i, "")
    .split(".")[0]
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  if (/^Intellibee$/i.test(company)) company = "Intellibee";

  // Prefer internal req id in key when present (J-19479), else Salesforce jobID
  const internalId = body.match(/\b(J-\d{3,})\b/)?.[1] || "";
  const jobKey = jobId
    ? `salesforce:${jobId}`
    : internalId
      ? `salesforce:${internalId}`
      : null;

  return {
    company: company || "Salesforce",
    role: role || "Unknown role",
    url: location.href.split("#")[0],
    jobKey,
    source: "salesforce",
  };
}

function parsePhenom() {
  // https://kuehnenagelrebrand.phenompro.com/global/en/job/12866/AI-Agentic-Engineer
  const path = location.pathname;
  const jobId =
    path.match(/\/job\/(\d+)/i)?.[1] ||
    path.match(/\/jobs\/(\d+)/i)?.[1] ||
    new URLSearchParams(location.search).get("jobId") ||
    "";

  const slugMatch = path.match(/\/job\/\d+\/([^/?#]+)/i);
  let fromSlug = "";
  if (slugMatch?.[1]) {
    try {
      fromSlug = decodeURIComponent(slugMatch[1]);
    } catch {
      fromSlug = slugMatch[1];
    }
    fromSlug = fromSlug
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }

  const bad =
    /^(apply now|save job|careers?|jobs?|home|sign in|log in|share|thank you|location|detroit|hybrid)\b/i;

  function pick(...cands) {
    for (const raw of cands) {
      const t = (raw || "").trim().replace(/\s+/g, " ");
      if (!t || t.length < 4 || bad.test(t)) continue;
      if (isWeakRole(t)) continue;
      return t;
    }
    return "";
  }

  const role = pick(
    textOf(document.querySelector("h1")),
    textOf(document.querySelector("[class*='job-title'], [data-testid*='job-title'], .job-title")),
    fromSlug,
    document.title.split("|")[0].split("-")[0],
  );

  const host = location.hostname.replace(/^www\./, "");
  let company = "";
  const logo =
    textOf(document.querySelector("header img[alt], [class*='logo'] img[alt], img[alt*='logo' i]")) ||
    "";
  if (logo && logo.length < 60 && !/logo|phenom|image/i.test(logo)) company = logo;

  // kuehnenagelrebrand.phenompro.com → Kuehne Nagel
  if (!company) {
    const sub = host.split(".")[0] || "";
    company = sub
      .replace(/rebrand$/i, "")
      .replace(/careers?/i, "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[-_]+/g, " ")
      .trim();
    if (/kuehne|nagel/i.test(company) || /kuehne|nagel/i.test(host)) {
      company = "Kuehne+Nagel";
    } else if (company) {
      company = company.replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  if (!company) company = "Phenom";

  return {
    company,
    role: role || fromSlug || "Unknown role",
    url: location.href.split("?")[0],
    jobKey: jobId ? `phenom:${jobId}` : null,
    source: "phenom",
  };
}

function parseUltiPro() {
  // recruiting.ultipro.com/pow1009pows/JobBoard/.../OpportunityDetail?opportunityId=...
  const params = new URLSearchParams(location.search);
  const opportunityId =
    params.get("opportunityId") ||
    params.get("OpportunityId") ||
    location.pathname.match(/OpportunityDetail\/([^/?#]+)/i)?.[1] ||
    "";

  const body = (document.body?.innerText || "").slice(0, 5000);
  const reqMatch =
    body.match(/Requisition\s*(?:Number|#)?\s*[:.]?\s*([A-Z0-9_-]{5,})/i) ||
    textOf(document.body).match(/SOFTW\d+/i);

  const bad =
    /^(apply now|apply with linkedin|job category|requisition|posted date|full-time|hybrid|careers?|jobs?|home|sign in|customer care)\b/i;

  function pick(...cands) {
    for (const raw of cands) {
      const t = (raw || "").trim().replace(/\s+/g, " ");
      if (!t || t.length < 6 || bad.test(t)) continue;
      return t;
    }
    return "";
  }

  const roleRaw = pick(
    textOf(document.querySelector("h1")),
    textOf(document.querySelector("h2")),
    textOf(document.querySelector("[class*='opportunity'], [class*='job-title'], [class*='JobTitle']")),
    document.title.split("|")[0].split("-")[0],
  );
  // Confirmation pages: "You have applied for Full Stack – Software Engineer II..."
  const role = roleRaw
    .replace(/^you have applied for\s+/i, "")
    .replace(/^you('ve| have) successfully applied( for)?\s+/i, "")
    .replace(/^application (submitted|received) for\s+/i, "")
    .trim();

  // Tenant slug: pow1009pows → PowerSecure
  const tenant = location.pathname.split("/").filter(Boolean)[0] || "";
  let company = "";
  if (/pows|powersecure/i.test(tenant) || /powersecure/i.test(body)) {
    company = "PowerSecure";
  }
  if (!company) {
    company =
      textOf(document.querySelector("header img[alt], .logo img[alt], [class*='logo'] img[alt]")) ||
      "";
    if (/logo|ulti|ukg|image/i.test(company) || company.length > 60) company = "";
  }
  if (!company && tenant) {
    company = tenant
      .replace(/\d+/g, "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }
  if (!company) company = "UKG";

  const jobKey = opportunityId
    ? `ultipro:${opportunityId}`
    : reqMatch?.[1]
      ? `ultipro:${reqMatch[1]}`
      : null;

  return {
    company,
    role: role || "Unknown role",
    url: location.href.split("#")[0],
    jobKey,
    source: "ultipro",
  };
}

function parsePaylocity() {
  // Details: /Recruiting/Jobs/Details/4369699
  // Apply:   /Recruiting/Jobs/Apply/4369699  (title often harder — company header can win)
  const jobId =
    location.pathname.match(/\/Details\/(\d+)/i)?.[1] ||
    location.pathname.match(/\/Apply\/(\d+)/i)?.[1] ||
    location.pathname.match(/\/Jobs\/(\d+)/i)?.[1] ||
    new URLSearchParams(location.search).get("jobId") ||
    "";

  const bad =
    /^(apply|all jobs|careers?|jobs?|home|sign in|log in|recruiting|thank you|share|description|why |the role|what you|hybrid|remote|step \d+|personal information|resume)\b/i;

  function looksLikeCompanyName(t) {
    if (!t) return false;
    if (/\b(company|inc\.?|llc|ltd|corp\.?|corporation|group)\b/i.test(t)) return true;
    if (/^(fervo|gravitate|paylocity)(\s+energy)?(\s+company)?$/i.test(t)) return true;
    if (t === t.toUpperCase() && t.length > 4 && !/engineer|developer|analyst|manager/i.test(t)) {
      return true;
    }
    return false;
  }

  /** "Platform Engineer Houston, TX" → "Platform Engineer" */
  function stripLocation(t) {
    return (t || "")
      .replace(
        /\s+(?:remote|hybrid|on-?site)?\s*[·•\-|]?\s*[A-Za-z .'-]+,\s*[A-Z]{2}(?:\s*,?\s*USA?)?\s*$/i,
        "",
      )
      .replace(/\s+(?:remote|hybrid|on-?site)\s*$/i, "")
      .replace(/\s+[A-Za-z .'-]+,\s*[A-Z]{2}\s*$/i, "")
      .trim();
  }

  function pick(...cands) {
    for (const raw of cands) {
      const t = stripLocation((raw || "").trim().replace(/\s+/g, " "));
      if (!t || t.length < 3 || bad.test(t)) continue;
      if (typeof isWeakRole === "function" && isWeakRole(t)) continue;
      if (looksLikeCompanyName(t)) continue;
      return t;
    }
    return "";
  }

  const titleBits = document.title.split(/\s+[-–|]\s+/).map((s) => s.trim()).filter(Boolean);
  // Prefer "Company - Role" → Role; avoid using company-only titles as role
  const roleFromTitle =
    titleBits.length >= 2
      ? titleBits[titleBits.length - 1]
      : looksLikeCompanyName(titleBits[0] || "")
        ? ""
        : titleBits[0] || "";

  const crumb = textOf(document.querySelector(".breadcrumb, [class*='breadcrumb'], nav"));
  const roleFromCrumb = crumb.includes(">")
    ? crumb.split(">").pop().trim()
    : "";

  // Apply pages: title often sits above the location line ("Platform Engineer" / "Houston, TX")
  const bodyTop = (document.body?.innerText || "").slice(0, 2500);
  const roleNearLocation =
    stripLocation(
      bodyTop.match(
        /\n\s*([A-Z][^\n]{4,80})\s*\n\s*(?:[A-Za-z .]+,\s*[A-Z]{2}|Remote|Hybrid)/,
      )?.[1] || "",
    ) || "";

  const headingCandidates = [...document.querySelectorAll("h1, h2, h3, [class*='job'], [class*='title']")]
    .map((n) => stripLocation(textOf(n)))
    .filter(Boolean);

  // Prefer role-like headings (Engineer, etc.) over generic ones
  const roleLike = headingCandidates.find((t) =>
    /engineer|developer|scientist|analyst|consultant|manager|designer|architect|specialist/i.test(
      t,
    ),
  );

  const role = pick(
    roleLike,
    roleNearLocation,
    roleFromCrumb,
    roleFromTitle,
    ...headingCandidates,
    textOf(document.querySelector("[class*='job-title'], [class*='JobTitle'], [class*='JobName'], .job-title")),
  );

  let company =
    textOf(document.querySelector("[class*='company'] a, [class*='CompanyName'], .company-name")) ||
    textOf(document.querySelector("header img[alt], .logo img[alt]"));
  if (!company || /logo|paylocity|image/i.test(company) || company.length > 80) {
    company = "";
  }
  if (!company && titleBits.length >= 2) company = titleBits[0];
  if (!company) {
    const m = bodyTop.match(/\b(Fervo Energy(?: Company)?|Gravitate(?: Energy(?: LLC)?)?)\b/i);
    if (m) company = m[1];
  }
  // ALL-CAPS logo word on Paylocity
  if (!company) {
    const caps = bodyTop.match(/\b([A-Z][A-Z0-9 &]{3,40})\b/);
    if (caps && /ENERGY|FERVO|GRAVITATE/i.test(caps[1])) company = caps[1];
  }
  if (!company) company = "Paylocity";
  if (/^fervo(\s+energy)?(\s+company)?$/i.test(company.trim())) {
    company = "Fervo Energy Company";
  }
  if (/^gravitate$/i.test(company.trim())) company = "Gravitate Energy LLC";
  if (/^GRAVITATE/i.test(company) && company === company.toUpperCase()) {
    company = "Gravitate Energy LLC";
  }
  if (/^FERVO/i.test(company) && company === company.toUpperCase()) {
    company = "Fervo Energy Company";
  }

  // Never keep role === company
  let finalRole = stripLocation(role || roleFromTitle || "Unknown role");
  if (
    finalRole &&
    company &&
    finalRole.replace(/\s+/g, "").toLowerCase() === company.replace(/\s+/g, "").toLowerCase()
  ) {
    finalRole = "Unknown role";
  }
  if (looksLikeCompanyName(finalRole)) finalRole = "Unknown role";

  // Canonical listing URL so Apply + Details share one lock key
  const listingUrl = jobId
    ? `${location.origin}/Recruiting/Jobs/Details/${jobId}`
    : location.href.split("?")[0];

  return {
    company,
    role: finalRole,
    url: listingUrl,
    jobKey: jobId ? `paylocity:${jobId}` : null,
    source: "paylocity",
  };
}

function parseSuccessFactors() {
  const params = new URLSearchParams(location.search);
  const bodyText = (document.body?.innerText || "").slice(0, 8000);

  function fromInputs() {
    const names = [
      "jobId",
      "jobReqId",
      "jobreqid",
      "reqId",
      "requisitionId",
      "job_req_id",
      "JobReqId",
      "rqn",
    ];
    for (const name of names) {
      try {
        const el =
          document.querySelector(`input[name="${name}"], input[id="${name}"]`) ||
          document.querySelector(`input[name*="${name}" i], input[id*="${name}" i]`);
        const v = el?.value?.trim();
        if (v && /^\d{4,}$/.test(v)) return v;
      } catch {
        /* ignore bad selectors */
      }
    }
    return "";
  }

  const jobId =
    params.get("jobId") ||
    params.get("jobReqId") ||
    params.get("reqId") ||
    params.get("requisitionId") ||
    params.get("job_req_id") ||
    location.pathname.match(/\/job\/(\d+)/)?.[1] ||
    fromInputs() ||
    document.title.match(/\((\d{4,})\)/)?.[1] ||
    textOf(document.querySelector("h1, h2, .jobTitle, [class*='jobTitle']")).match(
      /\((\d{4,})\)/,
    )?.[1] ||
    bodyText.match(
      /(?:job\s*(?:req(?:uisition)?|id|opening)|requisition(?:\s*id)?|req(?:uisition)?\s*#?)\s*[:#]?\s*(\d{4,})/i,
    )?.[1] ||
    bodyText.match(/\(([0-9]{5,})\)/)?.[1] ||
    "";

  const bad =
    /^(career opportunities|thank you|recruiting team|why work|job opportunities|connect with us|home|sign in|log in|apply|submit|internal server error)\b/i;

  function pick(...cands) {
    for (const raw of cands) {
      const t = (raw || "").trim().replace(/\s+/g, " ");
      if (!t || t.length < 5 || bad.test(t)) continue;
      return t;
    }
    return "";
  }

  let role = pick(
    textOf(document.querySelector("h1")),
    textOf(document.querySelector("h2")),
    textOf(document.querySelector(".jobTitle, [class*='jobTitle'], [class*='JobTitle']")),
    document.title.split("|")[0].split(":")[0],
  );
  role = role
    .replace(/^career opportunities\s*[:\-–]\s*/i, "")
    .replace(/\s*\(\d{4,}\)\s*$/, "")
    .trim();

  let company =
    textOf(document.querySelector("header img[alt], .logo img[alt], img[alt*='logo' i]")) ||
    textOf(document.querySelector("[class*='company'], .company-name"));
  if (!company || /logo|image|banner/i.test(company) || company.length > 80) {
    company = "";
  }
  if (!company) {
    if (/\bPACCAR\b/i.test(bodyText) || /paccar/i.test(location.hostname)) company = "PACCAR";
  }
  if (!company) {
    company =
      location.hostname
        .replace(/^career\d*\./i, "")
        .replace(/\.successfactors\.(com|eu)$/i, "")
        .split(".")[0] || "SuccessFactors";
    company = company.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // Carry job id / title across SF wizard steps (URL loses req id)
  return mergeRememberedJob(
    {
      company,
      role: role || "Unknown role",
      url: location.href.split("#")[0],
      jobKey: jobId ? `successfactors:${jobId}` : null,
      source: "successfactors",
    },
    "successfactors",
  );
}

// isWeakRole / isWeakCompany / scrub* / normalizeParsed → defined in ats.js
// (per-ATS quirks live there so fixing one source does not affect others)

function readJobCtx(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const prev = JSON.parse(raw);
    if (!prev?.jobKey || Date.now() - (prev.at || 0) > 6 * 60 * 60 * 1000) return null;
    return prev;
  } catch {
    return null;
  }
}

function writeJobCtx(parsed) {
  const src = parsed.source;
  const payload = {
    company: scrubCompany(parsed.company, src) || parsed.company,
    role: scrubRole(parsed.role, src) || parsed.role,
    jobKey: parsed.jobKey,
    url: parsed.url,
    source: src,
    locked: true,
    at: Date.now(),
  };
  const json = JSON.stringify(payload);
  sessionStorage.setItem(`applytrack:job:${parsed.jobKey}`, json);
  sessionStorage.setItem("applytrack:job:latest", json);
  if (src) sessionStorage.setItem(`applytrack:ctx:${src}`, json);
}

/** True once we have a real role + company for this posting — never mutate after. */
function isSolidLock(prev, source) {
  if (!prev?.locked || !prev.jobKey) return false;
  const src = source || prev.source;
  if (!prev.role || isWeakRole(prev.role, src)) return false;
  if (!prev.company || isWeakCompany(prev.company, src)) return false;
  // Role that is just the company name is not solid
  if (
    prev.role.replace(/\s+/g, "").toLowerCase() ===
    prev.company.replace(/\s+/g, "").toLowerCase()
  ) {
    return false;
  }
  return true;
}

function readBestJobCtx(parsed, source) {
  const src = source || parsed?.source;
  let prev = parsed?.jobKey ? readJobCtx(`applytrack:job:${parsed.jobKey}`) : null;
  if (!prev && src) prev = readJobCtx(`applytrack:ctx:${src}`);
  // Wizard steps often drop the id — reuse latest only for the same ATS
  if (!prev) {
    const latest = readJobCtx("applytrack:job:latest");
    if (latest && (!src || latest.source === src)) prev = latest;
  }
  return prev;
}

/**
 * Lock company/role/url from the first good capture.
 * Once solid for a jobKey, later pages must NEVER overwrite (all ATS).
 * Weak titles never lock; they can still upgrade an incomplete lock.
 */
function rememberJob(parsed, opts = {}) {
  if (!parsed?.source || !parsed.jobKey) return;
  const src = parsed.source;
  const force = Boolean(opts.force); // manual edits
  if (!force && isWeakRole(parsed.role, src)) return;

  try {
    const existing = readJobCtx(`applytrack:job:${parsed.jobKey}`);
    // Solid lock for this posting — frozen until tab session ends
    if (!force && existing && existing.jobKey === parsed.jobKey && isSolidLock(existing, src)) {
      return;
    }

    // Build next payload: never downgrade a good field already stored
    const role =
      !force && existing && !isWeakRole(existing.role, src)
        ? existing.role
        : scrubRole(parsed.role, src) || parsed.role;
    const company =
      !force && existing && !isWeakCompany(existing.company, src)
        ? existing.company
        : scrubCompany(parsed.company, src) || parsed.company || existing?.company;
    const url = existing?.url || parsed.url;

    if (isWeakRole(role, src)) return;

    writeJobCtx({
      ...parsed,
      role,
      company,
      url,
      locked: true,
    });
  } catch {
    /* ignore */
  }
}

/**
 * Apply the frozen listing capture over whatever the current page parses.
 * Solid lock ⇒ role, company, url, jobKey stay exactly as recorded until the end.
 */
function mergeRememberedJob(parsed, source) {
  try {
    if (!parsed) return parsed;
    const src = source || parsed.source;
    const prev = readBestJobCtx(parsed, src);
    if (!prev) return parsed;

    // Different posting ids — don't mix (page with no id can inherit same-source lock)
    if (parsed.jobKey && prev.jobKey && parsed.jobKey !== prev.jobKey) {
      return parsed;
    }

    // FROZEN: once solid, ignore page parse for identity fields
    if (isSolidLock(prev, src)) {
      return {
        ...parsed,
        jobKey: prev.jobKey,
        role: prev.role,
        company: prev.company,
        url: prev.url || parsed.url,
        source: prev.source || parsed.source || src,
        locked: true,
      };
    }

    // Incomplete lock — fill gaps / upgrade weak fields only
    const prevRoleOk = prev.role && !isWeakRole(prev.role, src);
    const nextRoleOk = parsed.role && !isWeakRole(parsed.role, src);
    const role = prevRoleOk
      ? prev.role
      : nextRoleOk
        ? scrubRole(parsed.role, src)
        : prev.role || parsed.role;

    const prevCo = scrubCompany(prev.company, src);
    const nextCo = scrubCompany(parsed.company, src);
    const prevCoOk = prevCo && !isWeakCompany(prevCo, src);
    const nextCoOk = nextCo && !isWeakCompany(nextCo, src);
    const company = prevCoOk ? prevCo : nextCoOk ? nextCo : nextCo || prevCo || parsed.company;

    return {
      ...parsed,
      jobKey: parsed.jobKey || prev.jobKey,
      role,
      company,
      url: prev.url || parsed.url,
      source: parsed.source || prev.source || src,
    };
  } catch {
    return parsed;
  }
}

/** Final payload for UI / save — always listing details when cached. */
function resolveJobPayload(parsed) {
  if (!parsed) return parsed;
  const normalized = typeof normalizeParsed === "function" ? normalizeParsed(parsed) : parsed;
  const merged = mergeRememberedJob(normalized, normalized.source);
  rememberJob(merged);
  // Re-read after remember so callers always see the frozen solid lock
  const prev = readBestJobCtx(merged, merged.source);
  if (prev && isSolidLock(prev, merged.source)) {
    return {
      ...merged,
      jobKey: prev.jobKey,
      role: prev.role,
      company: prev.company,
      url: prev.url || merged.url,
      source: prev.source || merged.source,
      locked: true,
    };
  }
  return typeof normalizeParsed === "function" ? normalizeParsed(merged) : merged;
}

/**
 * Lock company/role from a manual edit in the side panel.
 * Force-overwrites even a solid lock (user intent).
 */
function lockManualJob(company, role, base) {
  const src = base?.source;
  const c = (company || "").trim();
  const r = (role || "").trim();
  if (!r || isWeakRole(r, src)) return base || null;
  const prev = base || {};
  const jobKey =
    prev.jobKey ||
    `manual:${(location.href || "").split("#")[0]}`.slice(0, 220);
  const syntheticKey = !prev.jobKey || String(jobKey).startsWith("manual:");
  const next = {
    ...prev,
    company: c || prev.company || "Unknown",
    role: r,
    jobKey,
    url: prev.url || location.href,
    source: prev.source || "manual",
    locked: true,
    manual: syntheticKey,
  };
  try {
    rememberJob(next, { force: true });
  } catch {
    try {
      writeJobCtx(next);
    } catch {
      /* ignore */
    }
  }
  return next;
}

function parseOracleCloud() {
  const path = location.pathname;
  const jobId = path.match(/\/job\/(\d+)/)?.[1] || path.match(/\/jobs\/(\d+)/)?.[1] || "";

  // JSON-LD JobPosting when Oracle / CX emits it
  let ldTitle = "";
  let ldCompany = "";
  try {
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      let data;
      try {
        data = JSON.parse(script.textContent || "null");
      } catch {
        continue;
      }
      const nodes = [];
      const walk = (v) => {
        if (!v) return;
        if (Array.isArray(v)) {
          v.forEach(walk);
          return;
        }
        if (typeof v !== "object") return;
        nodes.push(v);
        if (v["@graph"]) walk(v["@graph"]);
      };
      walk(data);
      for (const node of nodes) {
        const type = String(node["@type"] || "");
        if (!/JobPosting/i.test(type)) continue;
        if (node.title) ldTitle = String(node.title).trim();
        const org = node.hiringOrganization;
        const name = typeof org === "string" ? org : org?.name;
        if (name) ldCompany = String(name).trim();
      }
    }
  } catch {
    /* ignore */
  }

  const badShell =
    /^(apply now|view more jobs|job information|job description|hello|careers?|home|sign in|log in|work summary|my applications|info and alerts|personal info|candidate|search jobs|be\s)/i;

  // Title/company scrubbers live in ats.js → ApplyTrackATS.oracle
  const scrub = (t) => scrubRole(t, "oracle");
  const scrubCo = (t) => scrubCompany(t, "oracle");

  function looksLikeRole(t) {
    const s = scrub(t);
    if (!s || s.length < 8 || badShell.test(s)) return false;
    if (isWeakRole(s, "oracle")) return false;
    return true;
  }

  function scoreRole(t) {
    let n = t.length;
    if (/\b(engineer|developer|analyst|manager|intern|director|specialist|architect|scientist|designer|lead|associate|consultant)\b/i.test(t)) {
      n += 80;
    }
    if (/\b(ii|iii|iv|sr|senior|junior|staff|principal)\b/i.test(t)) n += 20;
    // Prefer page headings over bloated document.title
    if (/\bcareers?\b/i.test(t) || /\bunited states\b/i.test(t)) n -= 100;
    return n;
  }

  function pickRole(...cands) {
    let best = "";
    let bestScore = -1e9;
    for (const raw of cands) {
      const t = scrub(raw);
      if (!looksLikeRole(t)) continue;
      const sc = scoreRole(t);
      if (sc > bestScore) {
        best = t;
        bestScore = sc;
      }
    }
    return best;
  }

  const headingTexts = [...document.querySelectorAll("h1, h2")]
    .map((el) => textOf(el))
    .filter(Boolean);

  const role = pickRole(
    ldTitle,
    textOf(
      document.querySelector(
        "[class*='jobtitle'], [class*='job-title'], [class*='JobTitle'], [class*='jobTitle'], [id*='jobTitle'], [id*='job-title']",
      ),
    ),
    textOf(
      document.querySelector(
        "[class*='job-header'] h1, [class*='JobHeader'] h1, [class*='job-details'] h1, [class*='JobDetails'] h1",
      ),
    ),
    ...headingTexts,
    // Only split on | / emdash — never on " - " inside the job name
    document.title.split(/[|–—]/).map((s) => s.trim())[0],
  );

  function looksLikeCompany(t) {
    const s = scrubCo(t);
    if (!s || s.length < 2 || s.length > 80) return false;
    if (isWeakCompany(s, "oracle")) return false;
    if (/logo|image|oraclecloud|candidate experience|sign in/i.test(s)) return false;
    return true;
  }

  let company = "";

  // Prefer on-page brand ("Why GM Financial Technology?") over CX region labels
  for (const el of document.querySelectorAll("h1, h2, h3, strong, b, p")) {
    const t = textOf(el);
    const m = t.match(/^why\s+(.+?)(?:\s+technology)?\s*\??$/i);
    if (m && looksLikeCompany(m[1])) {
      company = scrubCo(m[1]);
      break;
    }
  }

  if (!company && looksLikeCompany(ldCompany)) company = scrubCo(ldCompany);

  const og = document.querySelector('meta[property="og:site_name"]')?.getAttribute("content")?.trim();
  if (!company && looksLikeCompany(og)) company = scrubCo(og);

  const logoAlt = textOf(
    document.querySelector("header img[alt], [class*='logo'] img[alt], a[class*='logo'] img[alt]"),
  );
  if (!company && looksLikeCompany(logoAlt) && !/logo|image/i.test(logoAlt)) {
    company = scrubCo(logoAlt);
  }

  // Header brand / org line (not the SaaS tenant host)
  if (!company) {
    const brand = textOf(
      document.querySelector(
        "header a[aria-label], [class*='company-name'], [class*='organization'], [class*='employer']",
      ),
    );
    if (looksLikeCompany(brand)) company = scrubCo(brand);
  }

  // Never use fa-*-saasfaprod1 tenant hostname as the company
  if (!company) {
    const sub = (location.hostname.split(".")[0] || "").replace(/[-_]/g, " ");
    if (/^jpmc$/i.test(sub.trim())) company = "JPMorgan Chase";
    else if (looksLikeCompany(sub) && !/saasfa|exvu|prod\d/i.test(sub)) {
      company = scrubCo(sub.replace(/\b\w/g, (c) => c.toUpperCase()));
    }
  }

  return {
    company: company || "Unknown",
    role: role || "Unknown role",
    url: location.href.split("?")[0],
    jobKey: jobId ? `oracle:${jobId}` : null,
    source: "oracle",
  };
}

function parseJobPage() {
  const host = location.hostname;
  let parsed;
  if (host.includes("linkedin.com")) parsed = parseLinkedIn();
  else if (
    host.includes("greenhouse") ||
    new URLSearchParams(location.search).get("gh_jid") ||
    location.hash.includes("grnhse") ||
    document.getElementById("grnhse_app")
  ) {
    parsed = parseGreenhouse();
  } else if (host.includes("lever.co")) parsed = parseLever();
  else if (host.includes("workday") || host.includes("myworkdayjobs")) parsed = parseWorkday();
  else if (host.includes("ashbyhq.com")) parsed = parseAshby();
  else if (host.includes("icims.com")) parsed = parseIcims();
  else if (
    host.includes("entertimeonline.com") ||
    host.includes("workforcenow.adp.com") ||
    (host.includes("adp.com") && /ShowJob|careers|recruit|JobDetails|cid=/i.test(location.href))
  ) {
    parsed = parseAdp();
  } else if (
    host.includes("applytojob.com") ||
    host.includes("jazzhr.com") ||
    host.includes("jazz.co")
  ) {
    parsed = parseJazzHr();
  } else if (host.includes("successfactors.com") || host.includes("successfactors.eu")) {
    parsed = parseSuccessFactors();
  } else if (host.includes("paylocity.com")) {
    parsed = parsePaylocity();
  } else if (host.includes("ultipro.com") || (host.includes("ukg.com") && /JobBoard|opportunity/i.test(location.href))) {
    parsed = parseUltiPro();
  } else if (
    host.includes("phenom.com") ||
    host.includes("phenompeople.com") ||
    host.includes("phenompro.com")
  ) {
    parsed = parsePhenom();
  } else if (
    (host.includes("salesforce-sites.com") || host.includes("force.com")) &&
    /Applicant|jobID|JobApplication|careers|Recruit/i.test(location.href)
  ) {
    parsed = parseSalesforceSites();
  } else if (host.includes("bamboohr.com")) {
    parsed = parseBambooHr();
  } else if (host.includes("workable.com")) {
    parsed = parseWorkable();
  } else if (
    host.includes("oraclecloud.com") &&
    /CandidateExperience|\/job\/|hcmUI/i.test(location.href)
  ) {
    parsed = parseOracleCloud();
  } else if (
    host.includes("taleo.net") &&
    /careersection|jobdetail|requisition|reqNo=|application\.jss/i.test(location.href)
  ) {
    parsed = parseTaleo();
  } else if (
    (host.includes("dayforcehcm.com") || host.includes("dayforce.com")) &&
    /\/jobs\/|\/job\/|Apply|Candidate/i.test(location.href)
  ) {
    parsed = parseDayforce();
  } else {
    parsed = {
      company: "",
      role: document.title || "",
      url: location.href,
      jobKey: null,
      source: "web",
    };
  }

  // Cache on first/best parse — later pages reuse this, never overwrite with form chrome
  if (parsed?.source && parsed.source !== "web") {
    parsed = resolveJobPayload(parsed);
  }
  return parsed;
}
