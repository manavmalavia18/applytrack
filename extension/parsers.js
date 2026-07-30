/** Site parsers — best-effort DOM extraction. */
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
  // boards.greenhouse.io + job-boards.greenhouse.io + embeds
  if (host.includes("greenhouse.io") || host.includes("greenhouse.com")) return true;
  if (host.includes("lever.co")) return true;
  if (host.includes("myworkdayjobs.com") || /workday\.com$/i.test(host)) return true;
  if (host.includes("ashbyhq.com")) return true;
  if (host.includes("icims.com")) return true;
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
  return /careers|\/jobs\/|\/job\/|\/apply\/|\/view\/|portalcareer|gh_jid|greenhouse|ashbyhq|lever\.co|myworkdayjobs|grnhse|icims|entertimeonline|ShowJob|applytojob|successfactors|paylocity|ultipro|OpportunityDetail|opportunityId|phenom|salesforce-sites|Applicant_Insert|jobID=|bamboohr|workable|workforcenow\.adp|adp\.com/i.test(
    location.href,
  );
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
      if (typeof isWeakRole === "function" && isWeakRole(t)) continue;
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
      .find((s) => s && !bad.test(s) && s.length > 5 && !(typeof isWeakRole === "function" && isWeakRole(s))),
  );

  // Prefer readable company from hostname: careers-peraton.icims.com → Peraton
  const host = location.hostname.replace(/^www\./, "");
  let company = host
    .replace(/\.icims\.com$/i, "")
    .replace(/^(corporatejobs-|jobs-|careers-|apply-)/i, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
  if (/^Alaskaair$/i.test(company)) company = "Alaska Airlines";
  if (/publicis\s*groupe/i.test(company) || /^publicisgroupe$/i.test(company.replace(/\s/g, ""))) {
    company = "Publicis Groupe";
  }

  const safeSlug = fromSlug && !(typeof isWeakRole === "function" && isWeakRole(fromSlug)) ? fromSlug : "";

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

/** True when text is form/confirmation chrome — never use as the job title. */
function isWeakRole(role) {
  const t = (role || "").trim();
  if (!t || t === "Unknown role") return true;
  // ATS / vendor chrome mistaken for a title
  if (
    /^(bamboohr|greenhouse|lever|ashby|workday|icims|oracle|successfactors|paylocity|ultipro|ukg|phenom|workable|salesforce|simplify|applytrack|selector software|career center|recruitment)$/i.test(
      t,
    )
  ) {
    return true;
  }
  // iCIMS / generic apply-wizard step headings
  return /^(you have applied for|thank you|thanks for applying|enter your (information|info)|create (a |your )?login|connect your account|sign in|log in|login|resume( upload)?|personal information|additional information|work experience|education|equal opportunity|review|application( form)?|my profile|work summary|demographics|preferences|candidate(\s+profile)?|profile|follow your application|careers?|jobs?|career center)\b/i.test(
    t,
  );
}

function isWeakCompany(company) {
  const t = (company || "").trim();
  if (!t || t.length < 2) return true;
  return /^(unknown|greenhouse|ashby|lever|workday|icims|oracle|successfactors|paylocity|ultipro|ukg|web|career)\b/i.test(
    t,
  );
}

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
  const payload = {
    company: parsed.company,
    role: parsed.role,
    jobKey: parsed.jobKey,
    url: parsed.url,
    source: parsed.source,
    locked: true,
    at: Date.now(),
  };
  const json = JSON.stringify(payload);
  sessionStorage.setItem(`applytrack:job:${parsed.jobKey}`, json);
  sessionStorage.setItem("applytrack:job:latest", json);
  if (parsed.source) sessionStorage.setItem(`applytrack:ctx:${parsed.source}`, json);
}

/**
 * Lock company/role from the first good listing page.
 * Later wizard/confirmation pages must NOT overwrite that.
 * Weak/ATS-brand titles never lock and can be upgraded when a real title appears.
 */
function rememberJob(parsed) {
  if (!parsed?.source || !parsed.jobKey) return;
  // Never lock wizard chrome ("Candidate profile", "Enter your information", …)
  if (isWeakRole(parsed.role)) return;
  try {
    const existing =
      readJobCtx(`applytrack:job:${parsed.jobKey}`) ||
      readJobCtx(`applytrack:ctx:${parsed.source}`);
    // Already locked with a real title for this posting — keep it
    if (
      existing?.locked &&
      existing.jobKey === parsed.jobKey &&
      !isWeakRole(existing.role)
    ) {
      return;
    }
    // Same jobKey already has a stronger real title — don't downgrade
    if (
      existing?.jobKey === parsed.jobKey &&
      !isWeakRole(existing.role) &&
      existing.role &&
      existing.role !== parsed.role
    ) {
      return;
    }
    writeJobCtx(parsed);
  } catch {
    /* ignore */
  }
}

/**
 * Prefer the locked listing capture over whatever the current page parses.
 */
function mergeRememberedJob(parsed, source) {
  try {
    let prev = parsed?.jobKey ? readJobCtx(`applytrack:job:${parsed.jobKey}`) : null;
    if (!prev && source) prev = readJobCtx(`applytrack:ctx:${source}`);
    // Confirmation pages sometimes lose the id — use latest only if same source
    if (!prev) {
      const latest = readJobCtx("applytrack:job:latest");
      if (latest && (!source || latest.source === source || !parsed?.jobKey)) prev = latest;
    }
    if (!prev) return parsed;

    // Different posting — don't mix
    if (parsed?.jobKey && prev.jobKey && parsed.jobKey !== prev.jobKey) {
      return parsed;
    }

    const useLocked = Boolean(prev.locked && !isWeakRole(prev.role));
    // Don't keep a lock where role is just the company name
    const lockedIsCompany =
      prev.role &&
      prev.company &&
      prev.role.replace(/\s+/g, "").toLowerCase() === prev.company.replace(/\s+/g, "").toLowerCase();
    const keepLock = useLocked && !lockedIsCompany;
    // Wizard steps parse form headings — always prefer a good prior title for this jobKey
    const preferPrevRole =
      keepLock ||
      (Boolean(prev.role) &&
        !isWeakRole(prev.role) &&
        !lockedIsCompany &&
        (isWeakRole(parsed.role) || !parsed.role));
    return {
      ...parsed,
      jobKey: parsed.jobKey || prev.jobKey,
      role: preferPrevRole ? prev.role : parsed.role,
      company: keepLock || isWeakCompany(parsed.company)
        ? prev.company || parsed.company
        : parsed.company,
      // Keep the original listing URL from first capture
      url: prev.url || parsed.url,
      source: parsed.source || prev.source || source,
    };
  } catch {
    return parsed;
  }
}

/** Final payload for UI / save — always listing details when cached. */
function resolveJobPayload(parsed) {
  if (!parsed) return parsed;
  const merged = mergeRememberedJob(parsed, parsed.source);
  rememberJob(merged);
  return merged;
}

/**
 * Lock company/role from a manual edit in the side panel.
 * Works even when the ATS parse is weak / missing a jobKey.
 */
function lockManualJob(company, role, base) {
  const c = (company || "").trim();
  const r = (role || "").trim();
  if (!r || isWeakRole(r)) return base || null;
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
    // Only mark as dashboard-style manual when there was no real ATS id
    manual: syntheticKey,
  };
  try {
    writeJobCtx(next);
  } catch {
    /* ignore */
  }
  return next;
}

function parseOracleCloud() {
  const path = location.pathname;
  const jobId = path.match(/\/job\/(\d+)/)?.[1] || path.match(/\/jobs\/(\d+)/)?.[1] || "";

  const bad =
    /^(apply now|view more jobs|job information|hello|careers?|home|sign in|log in|work summary|my applications|info and alerts|personal info|manav|candidate)\b/i;
  function pick(...cands) {
    for (const raw of cands) {
      const t = (raw || "").trim().replace(/\s+/g, " ");
      if (!t || t.length < 8 || bad.test(t)) continue;
      // Prefer titles that look like roles (often contain Engineer/Developer/etc. or are long)
      return t;
    }
    return "";
  }

  const role = pick(
    textOf(document.querySelector("h1")),
    textOf(document.querySelector("[class*='job-title'], [class*='JobTitle'], .job-header h1")),
    // Job info section sometimes has title nearby
    textOf(document.querySelector("[class*='job-details'] h1, [class*='JobDetails'] h1")),
    document.title
      .split("|")
      .map((s) => s.trim())
      .find((s) => s && !bad.test(s) && s.length > 8),
  );

  const sub = location.hostname.split(".")[0] || "";
  let company = sub.replace(/\.fa$/i, "").toUpperCase();
  if (company === "JPMC") company = "JPMorgan Chase";
  const fromLogo = textOf(document.querySelector("header img[alt], [class*='logo'] img[alt]"));
  if (fromLogo && fromLogo.length < 60 && !/logo|image/i.test(fromLogo)) company = fromLogo;

  return {
    company: company || "Oracle Career",
    role: role || "Unknown role",
    url: location.href.split("?")[0],
    // Require numeric job id — avoid logging profile pages as applications
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
