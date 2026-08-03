/** Site parsers — best-effort DOM extraction.
 * Per-ATS quirks (title/company scrub, weak locks) live in ats.js — do not add
 * source-specific hacks to shared remember/merge helpers below.
 */
function textOf(el) {
  return ((el && (el.innerText || el.textContent)) || "").trim().replace(/\s+/g, " ");
}

/** Shared JD extractor — best-effort, works across ATS without per-source hacks. */
const MAX_JD_CHARS = 20000;
const JD_MIN_CHARS = 80;
const JD_COOKIE_BANNER_RE =
  /^(we use cookies|this (site|website) uses cookies|by clicking accept|by continuing to (use|browse)|manage (your )?cookie preferences|accept all cookies|cookie policy|privacy preference center|your privacy (choices|matters))/i;

function normalizeJdText(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Turn a JSON-LD `description` HTML string into readable plain text. */
function jdHtmlToText(html) {
  if (!html || typeof html !== "string") return "";
  let s = html
    .replace(/<\s*(br)\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, " ");
  try {
    const ta = document.createElement("textarea");
    ta.innerHTML = s;
    s = ta.value;
  } catch {
    /* ignore */
  }
  return s;
}

function isDecentJobDescription(text) {
  if (!text || typeof text !== "string") return false;
  const t = text.trim();
  if (t.length < JD_MIN_CHARS) return false;
  if (JD_COOKIE_BANNER_RE.test(t)) return false;
  return true;
}

/** Clone + detach-render a node so `.innerText` works without touching the live page. */
function jdTextFromElement(el) {
  if (!(el instanceof HTMLElement)) return "";
  let holder;
  try {
    const clone = el.cloneNode(true);
    clone
      .querySelectorAll(
        "script, style, noscript, template, svg, nav, header, footer, form, button, iframe, [class*='cookie' i], [id*='cookie' i], [class*='consent' i], [id*='onetrust' i], [aria-hidden='true']",
      )
      .forEach((n) => n.remove());
    holder = document.createElement("div");
    Object.assign(holder.style, {
      position: "fixed",
      top: "-99999px",
      left: "-99999px",
      width: "800px",
      visibility: "hidden",
      pointerEvents: "none",
    });
    holder.appendChild(clone);
    (document.body || document.documentElement).appendChild(holder);
    return normalizeJdText(holder.innerText || holder.textContent || "");
  } catch {
    return "";
  } finally {
    holder?.remove();
  }
}

/**
 * Shared JobPosting JSON-LD reader — title / company / description, first
 * non-empty value per field across every declared JobPosting node on the page.
 * Board-API / DOM fallbacks stay per-ATS in each parse* function below; this
 * only surfaces the raw structured-data values so callers can try it first.
 */
function parseJobPostingJsonLd() {
  const result = { title: "", company: "", description: "" };
  try {
    for (const el of document.querySelectorAll('script[type="application/ld+json"]')) {
      const raw = (el.textContent || "").trim();
      if (!raw) continue;
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        continue;
      }
      const stack = Array.isArray(data) ? [...data] : [data];
      while (stack.length) {
        const node = stack.pop();
        if (!node || typeof node !== "object") continue;
        if (Array.isArray(node["@graph"])) stack.push(...node["@graph"]);
        const type = node["@type"];
        const types = Array.isArray(type) ? type : [type];
        if (!types.some((t) => /jobposting/i.test(String(t || "")))) continue;
        if (!result.title && node.title) {
          result.title = String(node.title).trim();
        }
        if (!result.company) {
          const org = node.hiringOrganization;
          const name = typeof org === "string" ? org : org?.name;
          if (name) result.company = String(name).trim();
        }
        if (!result.description && node.description) {
          const text = normalizeJdText(jdHtmlToText(String(node.description)));
          if (isDecentJobDescription(text)) result.description = text;
        }
      }
    }
  } catch {
    /* ignore */
  }
  return result;
}

/** JSON-LD JobPosting.description — most reliable source when present (GH, Ashby, Workable…). */
function jdFromJsonLd() {
  return parseJobPostingJsonLd().description;
}

// Priority tiers: ATS-specific containers first, then common patterns, then generic content.
const JD_SELECTOR_TIERS = [
  [
    '[data-automation-id="jobPostingDescription"]', // Workday
    '[data-qa="job-description"]', // Lever
    "#content .content-holder", // Greenhouse custom embeds
    "#job-description",
    "#jobDescriptionText",
    ".job__description",
    "[data-ui='job-description']", // Workable
  ],
  [
    "[class*='job-description' i]",
    "[class*='jobdescription' i]",
    "[id*='job-description' i]",
    "[id*='jobdescription' i]",
    "[data-testid*='job-description' i]",
    "[data-testid*='jobdescription' i]",
    "[class*='posting-body' i]",
    "[class*='postingbody' i]",
    "[class*='description-content' i]",
  ],
  ["#content", "article", "main", "[role='main']"],
];

/** Best-effort JD extraction: JSON-LD first, then progressively looser DOM selectors. */
function extractJobDescription() {
  const fromJsonLd = jdFromJsonLd();
  if (fromJsonLd) return fromJsonLd.slice(0, MAX_JD_CHARS);

  for (const tier of JD_SELECTOR_TIERS) {
    let best = "";
    for (const sel of tier) {
      let nodes;
      try {
        nodes = document.querySelectorAll(sel);
      } catch {
        continue;
      }
      for (const node of nodes) {
        const text = jdTextFromElement(node);
        if (isDecentJobDescription(text) && text.length > best.length) best = text;
      }
    }
    if (best) return best.slice(0, MAX_JD_CHARS);
  }
  return "";
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
    host.includes("paycomonline.net") ||
    host.includes("teamtailor.com") ||
    host.includes("smartrecruiters.com") ||
    host.includes("pinpointhq.com") ||
    host.includes("rippling.com") ||
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
  // Dayforce HCM job boards + apply wizard
  if (host.includes("dayforcehcm.com") || host.includes("dayforce.com")) {
    return true;
  }
  // Paycom ATS portals
  if (host.includes("paycomonline.net") && /\/ats\/|\/portal\/|\/jobs\//i.test(location.href)) {
    return true;
  }
  // Teamtailor (custom career domains + *.teamtailor.com)
  if (isTeamtailorPage()) return true;
  // Pinpoint HQ
  if (isPinpointPage()) return true;
  // Rippling ATS job boards
  if (isRipplingPage()) return true;
  // SmartRecruiters
  if (host.includes("smartrecruiters.com")) return true;
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
  if (params.get("jobid") && /career|job-listing|\/jobs?\b/i.test(location.href)) return true;
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
  return /careers|\/jobs\/|\/job\/|\/apply\/|\/view\/|portalcareer|gh_jid|greenhouse|ashbyhq|lever\.co|myworkdayjobs|grnhse|icims|entertimeonline|ShowJob|applytojob|successfactors|paylocity|ultipro|OpportunityDetail|opportunityId|phenom|salesforce-sites|Applicant_Insert|jobID=|bamboohr|workable|workforcenow\.adp|adp\.com|taleo\.net|careersection|reqNo=|dayforcehcm|dayforce\.com|paycomonline|teamtailor|smartrecruiters|pinpointhq|rippling\.com|\/postings\//i.test(
    location.href,
  );
}

function isPinpointPage() {
  const host = location.hostname.replace(/^www\./, "");
  if (host.includes("pinpointhq.com")) return true;
  try {
    if (
      document.querySelector(
        'a[href*="pinpointhq"], link[href*="pinpointhq"], script[src*="pinpointhq"], meta[content*="pinpointhq"]',
      )
    ) {
      return /\/postings\//i.test(location.pathname);
    }
  } catch {
    /* ignore */
  }
  return false;
}

function isRipplingPage() {
  const host = location.hostname.replace(/^www\./, "");
  if (!host.includes("rippling.com")) return false;
  // ats.rippling.com/{locale?}/{board}/jobs/{uuid}
  if (/\/jobs\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(location.pathname)) {
    return true;
  }
  // Board listing / apply shells under ATS host
  if (/^ats(\.|$)/i.test(host) && /\/jobs(?:\/|$)/i.test(location.pathname)) return true;
  return false;
}

function parsePinpoint() {
  // https://desmos.pinpointhq.com/en/postings/{uuid}
  // https://desmos.pinpointhq.com/en/postings/{uuid}/applications/new
  const path = location.pathname;
  const uuid =
    path.match(
      /\/postings\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    )?.[1] || "";

  const bad =
    /^(apply now|department|employment type|location|workplace type|compensation|cookie|accept all|view all opportunities|register your interest|not quite right|careers?|jobs?|home)$/i;

  function pick(...cands) {
    for (const raw of cands) {
      const t = (raw || "").trim().replace(/\s+/g, " ");
      if (!t || t.length < 3 || t.length > 180) continue;
      if (bad.test(t)) continue;
      if (typeof isWeakRole === "function" && isWeakRole(t, "pinpoint")) continue;
      return t;
    }
    return "";
  }

  let role = "";
  let company = "";

  // JobPosting JSON-LD is authoritative when present
  try {
    for (const el of document.querySelectorAll('script[type="application/ld+json"]')) {
      const raw = (el.textContent || "").trim();
      if (!raw) continue;
      const data = JSON.parse(raw);
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const type = String(node["@type"] || "");
        if (!/jobposting/i.test(type)) continue;
        if (node.title) role = pick(node.title) || role;
        const org = node.hiringOrganization;
        const orgName = typeof org === "string" ? org : org?.name;
        if (orgName && !(typeof isWeakCompany === "function" && isWeakCompany(orgName, "pinpoint"))) {
          company = orgName;
        }
      }
    }
  } catch {
    /* ignore */
  }

  role = pick(
    role,
    textOf(document.querySelector("h1.external-panel__title, h1")),
    textOf(document.querySelector("[class*='job-title'], [class*='JobTitle'], .posting-headline")),
    document.querySelector('meta[property="og:title"]')?.getAttribute("content"),
    document.title.split("|")[0]?.split(" - ")[0],
  );

  if (!company) {
    const logo = textOf(
      document.querySelector(
        "header img[alt], .external-header img[alt], a[href='/'] img[alt], img[alt*='Home' i], img[alt]",
      ),
    );
    if (
      logo &&
      logo.length < 80 &&
      !/logo|pinpoint|image/i.test(logo) &&
      !(typeof isWeakCompany === "function" && isWeakCompany(logo, "pinpoint"))
    ) {
      company = logo;
    }
  }

  if (!company) {
    const ogDesc =
      document.querySelector('meta[property="og:description"]')?.getAttribute("content") || "";
    const fromOg = ogDesc.match(/\bat\s+(.+?)\s+in\s+/i)?.[1]?.trim();
    if (fromOg && !(typeof isWeakCompany === "function" && isWeakCompany(fromOg, "pinpoint"))) {
      company = fromOg;
    }
  }

  if (!company) {
    // "Software Engineer - Remote (USA) | Desmos Studio PBC Careers"
    const fromTitle = document.title.match(/\|\s*(.+?)\s+Careers?\s*$/i)?.[1]?.trim();
    if (fromTitle && !(typeof isWeakCompany === "function" && isWeakCompany(fromTitle, "pinpoint"))) {
      company = fromTitle;
    }
  }

  // Subdomain is a weak last resort (desmos → Desmos)
  if (!company || (typeof isWeakCompany === "function" && isWeakCompany(company, "pinpoint"))) {
    const host = location.hostname.replace(/^www\./, "");
    const sub = host.replace(/\.pinpointhq\.com$/i, "").split(".")[0];
    if (sub && !/^(app|www|jobs|careers)$/i.test(sub)) {
      company = sub.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }

  if (typeof scrubCompany === "function") {
    company = scrubCompany(company, "pinpoint") || company;
  }
  if (typeof scrubRole === "function") {
    role = scrubRole(role, "pinpoint") || role;
  }

  return {
    company: company || "Unknown",
    role: role || "Unknown role",
    url: location.href.split("?")[0].split("#")[0],
    jobKey: uuid ? `pinpoint:${uuid}` : null,
    source: "pinpoint",
  };
}

function parseRippling() {
  // https://ats.rippling.com/en-GB/joinroot/jobs/{uuid}
  // https://ats.rippling.com/joinroot/jobs/{uuid}
  const path = location.pathname;
  const uuid =
    path.match(
      /\/jobs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
    )?.[1] || "";

  const parts = path.split("/").filter(Boolean);
  const localeRe = /^[a-z]{2}(?:-[A-Z]{2})?$/;
  const reserved = /^(jobs|apply|application|careers?|home|ats|rippling)$/i;
  let boardSlug = "";
  for (let i = 0; i < parts.length; i++) {
    if (/^jobs$/i.test(parts[i])) {
      const prev = parts[i - 1] || "";
      if (prev && !localeRe.test(prev) && !reserved.test(prev) && !/^[0-9a-f-]{8,}$/i.test(prev)) {
        boardSlug = prev;
      } else if (i >= 2 && localeRe.test(prev)) {
        const maybe = parts[i - 2] || "";
        if (maybe && !reserved.test(maybe)) boardSlug = maybe;
      }
      break;
    }
  }

  const bad =
    /^(apply now|apply|department|engineering|location|employment type|compensation|cookie|accept all|careers?|jobs?|home|sign in|submit application|rippling|ats)$/i;

  function pick(...cands) {
    for (const raw of cands) {
      const t = (raw || "").trim().replace(/\s+/g, " ");
      if (!t || t.length < 3 || t.length > 180) continue;
      if (bad.test(t)) continue;
      if (typeof isWeakRole === "function" && isWeakRole(t, "rippling")) continue;
      return t;
    }
    return "";
  }

  function sameAs(a, b) {
    return (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();
  }

  function titleCaseSlug(slug) {
    return (slug || "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }

  function badCompany(c, roleName) {
    const t = (c || "").trim();
    if (!t) return true;
    if (typeof isWeakCompany === "function" && isWeakCompany(t, "rippling")) return true;
    if (/^(ats|rippling|www)$/i.test(t)) return true;
    if (roleName && sameAs(t, roleName)) return true;
    return false;
  }

  let role = "";
  let company = "";

  // __NEXT_DATA__ is authoritative on Rippling SSR boards
  try {
    const nextEl = document.getElementById("__NEXT_DATA__");
    const raw = (nextEl?.textContent || "").trim();
    if (raw) {
      const data = JSON.parse(raw);
      const api = data?.props?.pageProps?.apiData;
      const jobPost = api?.jobPost;
      const jobBoard = api?.jobBoard;
      if (jobPost?.name) role = pick(jobPost.name) || role;
      const co =
        jobPost?.companyName ||
        jobBoard?.companyName ||
        jobBoard?.title ||
        jobPost?.board?.companyName ||
        jobPost?.board?.title ||
        "";
      if (co && !badCompany(co, role)) company = co;
    }
  } catch {
    /* ignore */
  }

  // JobPosting JSON-LD when present
  if (!role || !company) {
    try {
      for (const el of document.querySelectorAll('script[type="application/ld+json"]')) {
        const raw = (el.textContent || "").trim();
        if (!raw) continue;
        const data = JSON.parse(raw);
        const nodes = Array.isArray(data) ? data : [data];
        for (const node of nodes) {
          if (!node || typeof node !== "object") continue;
          if (!/jobposting/i.test(String(node["@type"] || ""))) continue;
          if (node.title) role = pick(node.title) || role;
          const org = node.hiringOrganization;
          const orgName = typeof org === "string" ? org : org?.name;
          if (orgName && !badCompany(orgName, role)) company = orgName;
        }
      }
    } catch {
      /* ignore */
    }
  }

  const ogTitle =
    document.querySelector('meta[property="og:title"]')?.getAttribute("content") || "";
  const ogBits = ogTitle
    .split(/\s*[|–—]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);

  role = pick(
    role,
    textOf(document.querySelector("h1")),
    textOf(document.querySelector("[data-testid='job-title'], [class*='job-title'], [class*='JobTitle']")),
    ogBits[0],
    document.title.split(/\s*[|–—]\s*/)[0],
  );

  // Prefer brand signals — never hostname "ats" / og:site_name "Rippling Recruiting"
  if (badCompany(company, role)) {
    const logo = textOf(
      document.querySelector(
        "header img[alt], [data-testid='breadcrumb'] img[alt], a[href*='/jobs'] img[alt], img[alt]",
      ),
    );
    if (
      logo &&
      logo.length > 1 &&
      logo.length < 80 &&
      !/^logo$/i.test(logo) &&
      !/\.(jpe?g|png|gif|webp|svg)$/i.test(logo) &&
      !/rippling|image|icon/i.test(logo) &&
      !badCompany(logo, role)
    ) {
      company = logo;
    }
  }

  if (badCompany(company, role)) {
    // Breadcrumb / brand text near the top (often the company name)
    const crumb = textOf(document.querySelector("[data-testid='breadcrumb']"));
    const crumbBits = (crumb || "")
      .split(/\s*[>|/›»]\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const bit of crumbBits) {
      if (bit.length < 2 || bit.length > 60) continue;
      if (sameAs(bit, role) || bad.test(bit)) continue;
      if (!badCompany(bit, role)) {
        company = bit;
        break;
      }
    }
  }

  // og:title "Role | Company"
  if (badCompany(company, role) && ogBits.length >= 2) {
    const fromOg = ogBits[ogBits.length - 1];
    if (!badCompany(fromOg, role)) company = fromOg;
  }

  // Board slug is a weak last resort (joinroot → Joinroot) — prefer brand above
  const fromSlug = titleCaseSlug(boardSlug);
  if (badCompany(company, role) && fromSlug && !badCompany(fromSlug, role)) {
    company = fromSlug;
  }

  if (typeof scrubCompany === "function") {
    company = scrubCompany(company, "rippling") || company;
  }
  if (typeof scrubRole === "function") {
    role = scrubRole(role, "rippling") || role;
  }
  if (badCompany(company, role)) company = "";

  const listingUrl = location.href
    .split("?")[0]
    .split("#")[0]
    .replace(/\/apply\/?$/i, "")
    .replace(/\/application\/?$/i, "")
    .replace(/\/+$/, "");

  return {
    company: company || "Unknown",
    role: role || "Unknown role",
    url: listingUrl || location.href.split("?")[0],
    jobKey: uuid ? `rippling:${uuid}` : null,
    source: "rippling",
  };
}

function parseSmartRecruiters() {
  // Listing: https://jobs.smartrecruiters.com/AbbVie/3743990014350476-associate-software-engineer-i
  // Apply:   .../application · apply.smartrecruiters.com
  // Oneclick: .../oneclick-ui/company/AbbVie/publication/{id|uuid}
  //           .../oneclick-ui/company/AbbVie/job/{id}
  const path = location.pathname;
  const parts = path.split("/").filter(Boolean);
  const isOneclick = /\/oneclick-ui\//i.test(path) || /^oneclick(-ui)?$/i.test(parts[0] || "");

  // Prefer /oneclick-ui/company/{Company}/… then listing /{Company}/{id}-{slug}
  const oneclickCo = path.match(/\/oneclick-ui\/company\/([^/?#]+)/i)?.[1] || "";
  const companySlug =
    oneclickCo ||
    (parts[0] && !/^(jobs|application|oneclick(-ui)?|company|publication)$/i.test(parts[0])
      ? parts[0]
      : "");

  const idSeg =
    parts.find((p) => /^\d{6,}(?:-|$)/.test(p)) ||
    path.match(/\/(?:publication|job)\/(\d{6,})(?:\/|$)/i)?.[1] ||
    path.match(/\/(\d{10,})(?:-|\/|$)/)?.[1] ||
    "";
  const jobId = String(idSeg).match(/^(\d{6,})/)?.[1] || "";
  const slug = String(idSeg).includes("-")
    ? String(idSeg).replace(/^\d+-/, "")
    : path.match(/\/\d{6,}-([^/?#]+)/)?.[1] || "";

  const bad =
    /^(i'?m interested|refer a friend|company description|job description|about |other jobs|apply|share|salary|hybrid|full[- ]?time|workday global grade|see who|start application|oneclick)$/i;

  function pick(...cands) {
    for (const raw of cands) {
      const t = (raw || "").trim().replace(/\s+/g, " ");
      if (!t || t.length < 3 || bad.test(t)) continue;
      if (isWeakRole(t, "smartrecruiters")) continue;
      return t;
    }
    return "";
  }

  let fromSlug = "";
  if (slug) {
    fromSlug = slug
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }

  // Title is often "Role - Company"; split on separators, not in-word hyphens
  const titleBits = document.title
    .split(/\s*[|–—]\s*|\s+-\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const fromTitle = pick(...titleBits);

  // On oneclick/application wizards, page chrome (IE11 banner, form labels) is
  // unreliable — prefer slug/title, then DOM. Solid lock still wins in resolve.
  const role = isOneclick
    ? pick(
        fromSlug,
        fromTitle,
        textOf(document.querySelector("[class*='job-title'], [class*='jobTitle'], [itemprop='title']")),
        ...[...document.querySelectorAll("h1")].map((el) => textOf(el)),
      )
    : pick(
        textOf(document.querySelector("h1")),
        textOf(document.querySelector("[class*='job-title'], [class*='jobTitle'], [itemprop='title']")),
        fromSlug,
        fromTitle,
      );

  let company = scrubCompany(
    (companySlug || "").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    "smartrecruiters",
  );
  const logo = textOf(
    document.querySelector("header img[alt], [class*='logo'] img[alt], img[alt]"),
  );
  if (
    logo &&
    logo.length < 60 &&
    !/logo|smartrecruiters|image/i.test(logo) &&
    !isWeakCompany(logo, "smartrecruiters")
  ) {
    company = scrubCompany(logo, "smartrecruiters");
  }
  const og = document.querySelector('meta[property="og:site_name"]')?.getAttribute("content")?.trim();
  if ((!company || isWeakCompany(company, "smartrecruiters")) && og) {
    company = scrubCompany(og, "smartrecruiters");
  }
  company = scrubCompany(company, "smartrecruiters") || company;

  // Never surface a weak banner/label as the role — leave empty so solid lock wins
  const safeRole =
    role && !isWeakRole(role, "smartrecruiters")
      ? role
      : fromSlug && !isWeakRole(fromSlug, "smartrecruiters")
        ? fromSlug
        : "Unknown role";

  return {
    company: company || "Unknown",
    role: safeRole,
    url: location.href.split("?")[0].split("#")[0],
    jobKey: jobId ? `smartrecruiters:${jobId}` : null,
    reqId: jobId || "",
    source: "smartrecruiters",
  };
}

/** Teamtailor career sites (often on custom domains like careers.goloadup.com). */
function isTeamtailorPage() {
  const host = location.hostname.replace(/^www\./, "");
  const path = location.pathname;
  if (host.includes("teamtailor.com")) return /\/jobs\//i.test(path);
  if (!/\/jobs\/\d+/i.test(path)) return false;
  try {
    if (
      document.querySelector(
        'a[href*="teamtailor"], link[href*="teamtailor"], script[src*="teamtailor"], meta[content*="teamtailor"]',
      )
    ) {
      return true;
    }
    const html = (document.documentElement?.innerHTML || "").slice(0, 12000);
    if (/teamtailor/i.test(html)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function parseTeamtailor() {
  // https://careers.goloadup.com/jobs/672255-software-engineer
  // https://company.teamtailor.com/jobs/...
  const path = location.pathname;
  const jobId = path.match(/\/jobs\/(\d+)/)?.[1] || "";
  const slug = path.match(/\/jobs\/\d+-([^/?#]+)/)?.[1] || "";

  const bad =
    /^(apply now|who we are|about the role|what you|cookie|accept all|department|locations|our purpose|already working|skip to|join |this website uses cookies)/i;

  function pick(...cands) {
    for (const raw of cands) {
      const t = (raw || "").trim().replace(/\s+/g, " ");
      if (!t || t.length < 3 || bad.test(t)) continue;
      if (isWeakRole(t, "teamtailor")) continue;
      return t;
    }
    return "";
  }

  let fromSlug = "";
  if (slug) {
    fromSlug = slug
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }

  const role = pick(
    textOf(document.querySelector("h1")),
    textOf(document.querySelector("[class*='job-title'], [class*='JobTitle']")),
    fromSlug,
    document.title.split(/[|–—]/).map((s) => s.trim())[0],
  );

  let company = "";
  const og = document.querySelector('meta[property="og:site_name"]')?.getAttribute("content")?.trim();
  if (og && !isWeakCompany(og, "teamtailor")) company = scrubCompany(og, "teamtailor");

  // "Software Engineer - LoadUp Technologies"
  if (!company) {
    const fromTitle = document.title.match(/\s[-–—]\s+(.+)$/)?.[1]?.trim();
    if (fromTitle && !isWeakRole(fromTitle, "teamtailor")) {
      company = scrubCompany(fromTitle, "teamtailor");
    }
  }

  if (!company) {
    const host = location.hostname.replace(/^www\./, "");
    const brand = host
      .replace(/^careers\./i, "")
      .replace(/^jobs\./i, "")
      .replace(/\.teamtailor\.com$/i, "")
      .split(".")[0];
    company = scrubCompany(brand.replace(/[-_]+/g, " "), "teamtailor");
  }

  const logo = textOf(document.querySelector("header img[alt], .logo img[alt], img[alt]"));
  if (
    logo &&
    logo.length < 60 &&
    !/logo|teamtailor|image/i.test(logo) &&
    !isWeakCompany(logo, "teamtailor")
  ) {
    company = scrubCompany(logo, "teamtailor");
  }

  company = scrubCompany(company, "teamtailor") || company;

  return {
    company: company || "Unknown",
    role: role || fromSlug || "Unknown role",
    url: location.href.split("?")[0].split("#")[0],
    jobKey: jobId ? `teamtailor:${jobId}` : null,
    reqId: jobId || "",
    source: "teamtailor",
  };
}

function parsePaycom() {
  // https://www.paycomonline.net/v4/ats/web.php/portal/{PORTAL}/jobs/{ID}
  const path = location.pathname;
  const portal = path.match(/\/portal\/([A-Fa-f0-9]+)/)?.[1] || "";
  const jobId = path.match(/\/jobs\/(\d+)/)?.[1] || "";

  const bad =
    /^(overview|description|apply|position type|essential duties|job summary|paycom|full time|part time|search|home|sign in|loading\.{0,3}|please wait)$/i;

  function pick(...cands) {
    for (const raw of cands) {
      const t = (raw || "").trim().replace(/\s+/g, " ");
      if (!t || t.length < 2 || bad.test(t)) continue;
      if (isWeakRole(t, "paycom")) continue;
      return t;
    }
    return "";
  }

  // Paycom often injects a "Loading..." h1 before the real title paints
  const role = pick(
    ...[...document.querySelectorAll("h1")].map((el) => textOf(el)),
    textOf(document.querySelector("[class*='job-title'], [class*='jobTitle'], .job-title")),
    ...[...document.querySelectorAll("h2")].map((el) => textOf(el)),
    document.title.split(/[|–—]/).map((s) => s.trim())[0],
    document.title.trim(),
  );

  // Location line often sits under the title — not the company
  let company = "";
  const locLine = textOf(
    document.querySelector("[class*='location'], [class*='Location'], .fa-map-marker, [class*='map']"),
  );
  // Prefer explicit employer mentions in the body / header
  const body = (document.body?.innerText || "").slice(0, 4000);
  const named =
    body.match(/\b([A-Z][A-Za-z0-9&.' ]{2,40})\s+is\s+looking\b/i)?.[1] ||
    body.match(/\bat\s+([A-Z][A-Za-z0-9&.' ]{2,40})\b/)?.[1] ||
    "";
  if (named && !/devops|engineer|quality|hillsboro|oregon/i.test(named)) {
    company = scrubCompany(named, "paycom");
  }

  // "Fortior Solutions Corporate - Hillsboro, OR 97124"
  if (!company || isWeakCompany(company, "paycom")) {
    const corporate = body.match(
      /([A-Z][A-Za-z0-9&.' ]+?)\s+Corporate\s*[-–—]\s*[A-Za-z .]+,\s*[A-Z]{2}/,
    )?.[1];
    if (corporate) company = scrubCompany(corporate, "paycom");
  }

  if ((!company || isWeakCompany(company, "paycom")) && locLine) {
    // Only use loc line if it starts with a company-shaped prefix before Corporate/city
    const fromLoc = scrubCompany(locLine, "paycom");
    if (fromLoc && !/^\d|,\s*[A-Z]{2}\b/.test(fromLoc) && fromLoc.length > 2) {
      company = fromLoc;
    }
  }

  if (!company || isWeakCompany(company, "paycom")) {
    const logo = textOf(document.querySelector("header img[alt], .logo img[alt], img[alt]"));
    if (logo && logo.length < 60 && !/logo|paycom|image/i.test(logo)) {
      company = scrubCompany(logo, "paycom");
    }
  }

  company = scrubCompany(company, "paycom") || company;

  const jobKey = jobId
    ? portal
      ? `paycom:${portal}:${jobId}`
      : `paycom:${jobId}`
    : null;

  return {
    company: company || "Unknown",
    role: role || "Unknown role",
    url: location.href.split("#")[0],
    jobKey,
    reqId: jobId || "",
    source: "paycom",
  };
}

function parseDayforce() {
  // https://jobs.dayforcehcm.com/en-US/nbhbank/bankmidwest/jobs/32164
  // https://jobs.dayforcehcm.com/en-US/fng/119397/jobs/14233  (119397 = org id, not company)
  // https://jobs.dayforcehcm.com/hightower/candidateportal/jobs/8627/apply/manualApplication
  const parts = location.pathname.split("/").filter(Boolean);
  const jobsIdx = parts.findIndex((p) => /^jobs?$/i.test(p));
  const jobId =
    (jobsIdx >= 0 && parts[jobsIdx + 1] && /^\d+$/.test(parts[jobsIdx + 1])
      ? parts[jobsIdx + 1]
      : "") ||
    location.pathname.match(/\/jobs\/(\d+)/i)?.[1] ||
    "";

  // Locale / portal / wizard chrome — never board or company slugs
  function isDayforcePathChrome(seg) {
    const s = (seg || "").trim();
    if (!s || /^\d+$/.test(s)) return true;
    return /^(en(?:-[a-z]{2})?|fr(?:-[a-z]{2})?|es(?:-[a-z]{2})?|de(?:-[a-z]{2})?|pt(?:-[a-z]{2})?|candidateportal|portal|jobs?|job|apply|manual|manualapplication|application|myprofile|signin|sign-in|home)$/i.test(
      s,
    );
  }

  // Meaningful slugs before /jobs/ (skip en-US, candidateportal, org ids, …)
  const boardSlugs =
    jobsIdx >= 0 ? parts.slice(0, jobsIdx).filter((p) => !isDayforcePathChrome(p)) : [];
  // Prefer site brand (bankmidwest) over client code (nbhbank / fng) when both exist
  const siteSlug = boardSlugs[boardSlugs.length - 1] || "";
  const clientSlug = boardSlugs[boardSlugs.length - 2] || "";

  const bad =
    /^(search jobs|sign in|careers|job description|apply|save|share|posted|home|english|united states|manual application|manual apply)$/i;

  function pick(...cands) {
    for (const raw of cands) {
      const t = (raw || "").trim().replace(/\s+/g, " ");
      if (!t || t.length < 5 || bad.test(t)) continue;
      if (isWeakRole(t, "dayforce")) continue;
      return t;
    }
    return "";
  }

  const ldDayforce =
    typeof parseJobPostingJsonLd === "function" ? parseJobPostingJsonLd() : { title: "", company: "" };

  const role = pick(
    ldDayforce.title,
    textOf(document.querySelector("h1")),
    textOf(document.querySelector("[class*='job-title'], [class*='jobTitle'], [data-automation-id*='jobTitle']")),
    textOf(document.querySelector("[class*='JobTitle']")),
    document.title.split(/[|–—]/).map((s) => s.trim())[0],
  );
  // Apply wizard pages titled "Manual Application" — never treat as the role

  function titleCaseSlug(slug) {
    return (slug || "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }

  function acceptCompany(raw) {
    const scrubbed = scrubCompany((raw || "").trim().replace(/\s+/g, " "), "dayforce");
    if (!scrubbed || isWeakCompany(scrubbed, "dayforce")) return "";
    if (/^(logo|image|dayforce)$/i.test(scrubbed)) return "";
    return scrubbed;
  }

  // Brand signals first — never lock a numeric path segment (119397) as company
  let company = "";

  const fromLogo = acceptCompany(
    textOf(
      document.querySelector(
        "header img[alt], a[href*='careers'] img[alt], .logo img[alt], [class*='logo'] img[alt], img[alt*='Flex'], img[alt*='Bank']",
      ),
    ),
  );
  if (fromLogo) company = fromLogo;

  if (!company) {
    const ogSite = acceptCompany(
      document.querySelector('meta[property="og:site_name"]')?.getAttribute("content"),
    );
    if (ogSite) company = ogSite;
  }

  if (!company && ldDayforce.company) {
    const fromLd = acceptCompany(ldDayforce.company);
    if (fromLd) company = fromLd;
  }

  if (!company) {
    const headerBrand = acceptCompany(
      textOf(
        document.querySelector(
          "header [class*='company'], header [class*='brand'], [class*='employer'], [class*='ClientName']",
        ),
      ),
    );
    if (headerBrand && headerBrand.length < 60) company = headerBrand;
  }

  // Description / JD often names the employer
  if (!company) {
    const body = (document.body?.innerText || "").slice(0, 4000);
    if (/\bFlex[\s\-]*N[\s\-]*Gate\b/i.test(body)) company = "Flex-N-Gate";
    else if (/\bNBH Bank\b/i.test(body)) company = "NBH Bank";
    else if (/\bBank Midwest\b/i.test(body)) company = "Bank Midwest";
  }

  // Path slugs last: board/site brand (hightower, bankmidwest) over client code (nbhbank / fng).
  // Portal chrome (candidateportal) and org ids already filtered from boardSlugs.
  if (!company || isWeakCompany(company, "dayforce")) {
    const fromSite = acceptCompany(titleCaseSlug(siteSlug));
    const fromClient = acceptCompany(titleCaseSlug(clientSlug));
    company = fromSite || fromClient || company;
  }

  company = scrubCompany(company, "dayforce") || company;

  // Prefer client code (fng) as stable key when present; else board slug (hightower)
  const keySlug = clientSlug || siteSlug || "job";
  const jobKey = jobId ? `dayforce:${keySlug.toLowerCase()}:${jobId}` : null;

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

function findGreenhouseBoardToken() {
  try {
    for (const el of document.querySelectorAll('script[src*="greenhouse"]')) {
      const m = (el.getAttribute("src") || "").match(/[?&]for=([^&#]+)/i);
      if (m?.[1]) return decodeURIComponent(m[1]);
    }
    for (const el of document.querySelectorAll('iframe[src*="greenhouse"]')) {
      const src = el.getAttribute("src") || "";
      let m = src.match(/[?&]for=([^&#]+)/i);
      if (m?.[1]) return decodeURIComponent(m[1]);
      m = src.match(/(?:boards|job-boards)\.greenhouse\.io\/([^/?#]+)/i);
      if (m?.[1] && !/^(embed|jobs|tokens|api)$/i.test(m[1])) return decodeURIComponent(m[1]);
    }
    const html = (document.documentElement?.innerHTML || "").slice(0, 100000);
    let m = html.match(/greenhouse\.io\/embed\/job_board\/js\?for=([A-Za-z0-9_-]+)/i);
    if (m?.[1]) return m[1];
    m = html.match(/greenhouse\.io\/embed\/job_app\?for=([A-Za-z0-9_-]+)/i);
    if (m?.[1]) return m[1];
    m = html.match(/["']board[_-]?token["']\s*[:=]\s*["']([A-Za-z0-9_-]+)["']/i);
    if (m?.[1]) return m[1];
    m = html.match(/\bfor\s*[:=]\s*["']([A-Za-z0-9_-]+)["']/i);
    if (m?.[1] && !/^(true|false|job|jobs)$/i.test(m[1])) {
      // Only accept when greenhouse context is nearby
      if (/greenhouse|grnhse/i.test(html.slice(Math.max(0, m.index - 80), m.index + 80))) {
        return m[1];
      }
    }
  } catch {
    /* ignore */
  }
  // boards.greenhouse.io/{token}/jobs/{id}
  const host = location.hostname.replace(/^www\./, "");
  if (host.includes("greenhouse.io")) {
    const board = location.pathname.split("/").filter(Boolean)[0] || "";
    if (board && !/^(jobs|embeds|embed|api)$/i.test(board)) return board;
  }
  return "";
}

/** Brand label from custom Greenhouse hosts: careers.roblox.com → roblox */
function greenhouseHostBrand(hostname) {
  const host = (hostname || "").replace(/^www\./, "").toLowerCase();
  if (!host || host.includes("greenhouse")) return "";
  const skip = /^(www|careers?|jobs?|job|apply|talent|recruiting|boards?|cdn|api|app)$/i;
  const tld = /^(com|org|net|io|co|us|uk|ai|app|dev|info|biz|edu|gov|ca|au|de|fr|jp|in)$/i;
  for (const part of host.split(".")) {
    if (!part || skip.test(part) || tld.test(part)) continue;
    return part.replace(/[-_]+/g, " ");
  }
  return "";
}

/** Fill weak Greenhouse parent-frame parses from the public boards API. */
async function enrichGreenhouseFromApi(parsed) {
  if (!parsed || parsed.source !== "greenhouse") return parsed;
  const params = new URLSearchParams(location.search);
  const jid =
    (parsed.jobKey || "").replace(/^greenhouse:/i, "") ||
    params.get("gh_jid") ||
    params.get("jobid") ||
    "";
  if (!jid) return parsed;
  const roleWeak =
    !parsed.role ||
    (typeof isWeakRole === "function" && isWeakRole(parsed.role, "greenhouse"));
  const coWeak =
    !parsed.company ||
    (typeof isWeakCompany === "function" && isWeakCompany(parsed.company, "greenhouse"));
  if (!roleWeak && !coWeak) return parsed;

  const host = location.hostname.replace(/^www\./, "");
  const hostGuess = greenhouseHostBrand(host);
  const tokens = [...new Set([findGreenhouseBoardToken(), hostGuess].filter(Boolean))];
  if (!tokens.length) return parsed;

  for (const token of tokens) {
    try {
      const res = await fetch(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs/${encodeURIComponent(jid)}`,
      );
      if (!res.ok) continue;
      const data = await res.json();
      const apiRole = (data.title || "").trim();
      const apiCompany = (
        data.company_name ||
        data.offices?.[0]?.name ||
        ""
      ).trim();
      if (!apiRole && !apiCompany) continue;
      return {
        ...parsed,
        role: roleWeak && apiRole ? apiRole : parsed.role,
        company: coWeak && apiCompany ? apiCompany : parsed.company,
        jobKey: parsed.jobKey || `greenhouse:${jid}`,
        source: "greenhouse",
      };
    } catch {
      /* try next token */
    }
  }
  return parsed;
}

function parseGreenhouse() {
  const params = new URLSearchParams(location.search);
  const jid =
    params.get("gh_jid") ||
    params.get("jobid") ||
    location.pathname.match(/\/jobs\/(\d+)/)?.[1] ||
    location.pathname.match(/\/(\d{6,})\/?$/)?.[1] ||
    "";

  const badTitle =
    /^(job details|loading(\s+job\s+details?)?.*|careers?|jobs?|overview|home|about|application|apply now|all jobs|thank you|thanks for|confirmation|follow your application|work at .+|early careers?|newsroom|opportunities)\b/i;

  function pickRole(...candidates) {
    for (const raw of candidates) {
      const t = (raw || "").trim().replace(/\s+/g, " ");
      if (!t || t.length < 4 || t.length > 180) continue;
      if (badTitle.test(t)) continue;
      if (/thank you|thanks for applying/i.test(t)) continue;
      if (typeof isWeakRole === "function" && isWeakRole(t, "greenhouse")) continue;
      return t;
    }
    return "";
  }

  function weakCo(c) {
    const t = (c || "").trim();
    if (!t || badTitle.test(t) || /loading/i.test(t)) return true;
    return typeof isWeakCompany === "function" && isWeakCompany(t, "greenhouse");
  }

  function acceptCompany(raw) {
    let t = (raw || "").trim().replace(/\s+/g, " ");
    if (!t || t.length > 80 || weakCo(t)) return "";
    if (typeof scrubCompany === "function") t = scrubCompany(t, "greenhouse") || "";
    if (!t || weakCo(t)) return "";
    return t;
  }

  const docTitle = document.title
    .split("|")[0]
    .split(" - ")
    .map((s) => s.trim())
    .filter((s) => s && !badTitle.test(s) && !/thank you|thanks for applying/i.test(s));

  const ldGreenhouse =
    typeof parseJobPostingJsonLd === "function" ? parseJobPostingJsonLd() : { title: "", company: "" };

  const role = pickRole(
    ldGreenhouse.title,
    textOf(document.querySelector("h1.app-title, .app-title")),
    textOf(document.querySelector("[data-testid='job-title'], .job-title, .posting-headline h2")),
    document.querySelector('meta[property="og:title"]')?.getAttribute("content"),
    ...[...document.querySelectorAll("h1, h2")].map((n) => textOf(n)),
    ...docTitle,
  );

  let company = "";

  // Prefer brand signals on custom domains — never nav chrome ("Careers")
  const logo = textOf(
    document.querySelector(
      "header img[alt], a[href='/'] img[alt], .logo img[alt], [class*='logo'] img[alt], img[alt*='logo' i], img[alt]",
    ),
  );
  company = acceptCompany(logo);

  if (!company) {
    company = acceptCompany(
      document.querySelector('meta[property="og:site_name"]')?.getAttribute("content"),
    );
  }

  if (!company) {
    company = acceptCompany(
      document.querySelector('meta[name="application-name"]')?.getAttribute("content"),
    );
  }

  if (!company) {
    company = acceptCompany(ldGreenhouse.company);
  }

  if (!company) {
    company = acceptCompany(
      textOf(document.querySelector(".company-name")) ||
        textOf(document.querySelector('[class*="company-name"], [data-company]')),
    );
  }

  // job-boards.greenhouse.io/{board}/jobs/{id}
  const board =
    findGreenhouseBoardToken() || location.pathname.split("/").filter(Boolean)[0] || "";
  if (
    (!company || weakCo(company)) &&
    board &&
    !/^(jobs|embeds|embed)$/i.test(board)
  ) {
    company =
      acceptCompany(board.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())) ||
      company;
  }

  if (!company || weakCo(company)) {
    const host = location.hostname.replace(/^www\./, "");
    if (!host.includes("greenhouse")) {
      // careers.roblox.com → Roblox (skip careers/jobs chrome labels)
      const brand = greenhouseHostBrand(host);
      if (brand) {
        company =
          acceptCompany(brand.replace(/\b\w/g, (c) => c.toUpperCase())) || company;
      }
    } else {
      company =
        acceptCompany(document.title.split(" at ").pop()?.replace(/\s*\|.*/, "").trim()) ||
        company;
    }
  }

  // "Software Engineer, User Frameworks | Roblox"
  if (!company || weakCo(company)) {
    const fromTitle = document.title.match(/\|\s*([^|]+?)\s*$/)?.[1]?.trim();
    company = acceptCompany(fromTitle) || company;
  }

  if (typeof scrubCompany === "function") {
    company = scrubCompany(company, "greenhouse") || company;
  }
  if (weakCo(company)) company = "";

  return {
    company,
    role: role || "Unknown role",
    url: location.href.split("#")[0],
    jobKey: jid ? `greenhouse:${jid}` : null,
    source: "greenhouse",
  };
}

function parseLever() {
  // https://jobs.lever.co/atomcomputing/e6db0921-3a50-4c45-931a-deffbfa8d826/apply
  // Company is the first path segment (board slug), never hostname "jobs".
  const parts = location.pathname.split("/").filter(Boolean);
  const reservedSeg = /^(jobs|apply|postings?|lever)$/i;
  const companySlug =
    parts[0] && !reservedSeg.test(parts[0]) && !/^[0-9a-f-]{8,}$/i.test(parts[0])
      ? parts[0]
      : "";
  const jobId =
    parts.find((p) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p),
    ) || "";

  const bad =
    /^(apply|apply for this job|submit application|careers?|jobs?|home|sign in|lever)$/i;

  function pick(...cands) {
    for (const raw of cands) {
      const t = (raw || "").trim().replace(/\s+/g, " ");
      if (!t || t.length < 3 || bad.test(t)) continue;
      if (isWeakRole(t, "lever")) continue;
      return t;
    }
    return "";
  }

  function titleCaseSlug(slug) {
    return (slug || "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }

  function sameAs(a, b) {
    return (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();
  }

  function imgAlt(sel) {
    const el = document.querySelector(sel);
    if (!el) return "";
    return (el.getAttribute("alt") || el.alt || "").trim().replace(/\s+/g, " ");
  }

  /** Reject host labels, role titles, empty, or anything equal to the job title. */
  function badCompany(c, roleName) {
    const t = (c || "").trim();
    if (!t || isWeakCompany(t, "lever")) return true;
    if (roleName && sameAs(t, roleName)) return true;
    return false;
  }

  const ldLever =
    typeof parseJobPostingJsonLd === "function" ? parseJobPostingJsonLd() : { title: "", company: "" };

  const role = pick(
    ldLever.title,
    textOf(document.querySelector(".posting-headline h2")),
    textOf(document.querySelector(".posting-headline h1")),
    textOf(document.querySelector("h2")),
    textOf(document.querySelector("h1")),
    // Lever titles are "Company - Role" — role is the right-hand segment
    document.title
      .split(/\s*[|–—]\s*|\s+-\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(-1)[0],
  );

  // Path slug is ALWAYS a strong floor for jobs.lever.co/{slug}/…
  // atomcomputing → Atom Computing (via scrubCompany alias / title case)
  const fromSlug = scrubCompany(titleCaseSlug(companySlug), "lever");
  let company = fromSlug && !badCompany(fromSlug, role) ? fromSlug : "";

  // Prefer brand signals over the slug floor when available
  // logo/alt → og:site_name → visible header → title company → keep slug
  // Never hostname "jobs", never company === role.
  const logo = imgAlt(
    ".main-header-logo img[alt], header img[alt], .logo img[alt], a[class*='logo'] img[alt]",
  );
  if (
    logo &&
    logo.length > 1 &&
    logo.length < 80 &&
    !/^logo$/i.test(logo) &&
    !/^lever(\s+logo)?$/i.test(logo) &&
    !/image/i.test(logo)
  ) {
    const scrubbed = scrubCompany(logo, "lever");
    if (!badCompany(scrubbed, role)) company = scrubbed;
  }

  if (badCompany(company, role) && ldLever.company) {
    const scrubbed = scrubCompany(ldLever.company, "lever");
    if (!badCompany(scrubbed, role)) company = scrubbed;
  }

  const og = document
    .querySelector('meta[property="og:site_name"]')
    ?.getAttribute("content")
    ?.trim();
  if (badCompany(company, role) && og) {
    const scrubbed = scrubCompany(og, "lever");
    if (!badCompany(scrubbed, role)) company = scrubbed;
  }

  if (badCompany(company, role)) {
    // Header brand text only — do not use pick() (it accepts role-shaped strings)
    const headerRaw = (
      textOf(document.querySelector(".main-header-company")) ||
      textOf(document.querySelector(".main-header-content .main-header-company span")) ||
      textOf(document.querySelector("[class*='main-header-company']")) ||
      ""
    ).trim();
    if (headerRaw && headerRaw.length < 60) {
      const scrubbed = scrubCompany(headerRaw, "lever");
      if (!badCompany(scrubbed, role)) company = scrubbed;
    }
  }

  // Lever document.title is "Company - Role" (left = employer)
  if (badCompany(company, role)) {
    const titleBits = document.title
      .split(/\s*[|–—]\s*|\s+-\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const fromTitle = titleBits[0] || "";
    if (fromTitle && fromTitle.length < 60 && !badCompany(fromTitle, role)) {
      company = scrubCompany(fromTitle, "lever");
    }
  }

  // Restore slug floor if brand signals were weak / role-shaped
  if (badCompany(company, role) && fromSlug && !badCompany(fromSlug, role)) {
    company = fromSlug;
  }

  company = scrubCompany(company, "lever") || company;
  if (badCompany(company, role)) {
    company = fromSlug && !badCompany(fromSlug, role) ? fromSlug : "";
  }

  const listingUrl = location.href
    .split("?")[0]
    .split("#")[0]
    .replace(/\/apply\/?$/i, "")
    .replace(/\/+$/, "");

  return {
    company: company || "Unknown",
    role: role || "Unknown role",
    url: listingUrl || location.href.split("?")[0],
    jobKey: jobId ? `lever:${jobId}` : null,
    source: "lever",
  };
}

function parseWorkday() {
  // https://company.wd5.myworkdayjobs.com/.../job/City/Role-Title_R-108283-1
  // Keep Req ID (R-108283) separate from the role title.
  const path = location.pathname;
  const href = location.href;

  function normalizeWorkdayReq(raw) {
    if (!raw) return "";
    let id = String(raw).trim().toUpperCase().replace(/\s+/g, "");
    // R108283 → R-108283 ; JR12345 stays JR12345-ish
    id = id.replace(/^(JR|R|REQ)[_-]?(\d{3,})(?:[-_]\d+)?$/i, (_, p, n) => {
      const prefix = p.toUpperCase();
      return prefix === "R" || prefix === "REQ" ? `${prefix}-${n}` : `${prefix}${n}`;
    });
    // Drop Workday URL revision suffix: R-108283-1 → R-108283
    id = id.replace(/^((?:JR|R|REQ)-?\d{3,})[-_]\d+$/i, "$1");
    if (/^R\d{3,}$/i.test(id)) id = `R-${id.slice(1)}`;
    return id;
  }

  const reqRaw =
    path.match(/_((?:JR|R|REQ)[-_]?\d{3,}(?:[-_]\d+)?)\b/i)?.[1] ||
    href.match(/_((?:JR|R|REQ)[-_]?\d{3,}(?:[-_]\d+)?)\b/i)?.[1] ||
    path.match(/\/job\/[^/]+\/[^/]*?((?:JR|R|REQ)[-_]?\d{3,}(?:[-_]\d+)?)/i)?.[1] ||
    (document.body?.innerText || "").match(
      /\bJob\s*ID\s*[:#]?\s*((?:JR|R|REQ)[-_]?\d{3,})/i,
    )?.[1] ||
    new URLSearchParams(location.search).get("jobRequisitionId") ||
    new URLSearchParams(location.search).get("requisitionId") ||
    "";
  const reqId = normalizeWorkdayReq(reqRaw);

  // Fallback: stable segment under /job/… (before /apply)
  const jobSeg =
    path.match(/\/job\/(.+?)(?:\/apply|\?|$)/i)?.[1]?.replace(/\/+$/, "") || "";

  const jobKey = reqId
    ? `workday:${reqId}`
    : jobSeg
      ? `workday:${location.hostname.replace(/^www\./, "")}/${jobSeg}`
      : null;

  const bad =
    /^(apply|start your apply|autofil|sign in|create account|my applications|job description|workday|next|submit|review)\b/i;

  function stripReqFromRole(t) {
    return scrubRole(t, "workday") || (t || "").trim();
  }

  function pick(...cands) {
    for (const raw of cands) {
      const t = stripReqFromRole(raw);
      if (!t || t.length < 5 || bad.test(t)) continue;
      if (isWeakRole(t, "workday")) continue;
      return t;
    }
    return "";
  }

  // Title_R-108283-1 → Title (must strip before turning -/_ into spaces)
  let fromPath = "";
  if (jobSeg) {
    const last = jobSeg.split("/").pop() || "";
    fromPath = last
      .replace(/_((?:JR|R|REQ)[-_]?\d{3,}(?:[-_]\d+)?)$/i, "")
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
    document.title.split("|")[0],
  );

  const host = location.hostname.replace(/^www\./, "");
  let company = host.split(".")[0] || "Workday";
  // expedia.wd108.myworkdayjobs.com → expedia
  if (/\.myworkdayjobs\.com$/i.test(host)) {
    company = host.split(".")[0];
  }
  company = company.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  if (/^Expedia$/i.test(company)) company = "Expedia";
  const logo = textOf(document.querySelector("img[alt], [data-automation-id='logo'] img[alt]"));
  if (logo && logo.length > 2 && logo.length < 60 && !/logo|workday|image/i.test(logo)) {
    company = logo;
  }

  // Listing URL without /apply suffix — better for locking
  const listingUrl = location.href
    .split("?")[0]
    .replace(/\/apply\/?.*$/i, "")
    .replace(/\/+$/, "");

  const finalRole = stripReqFromRole(role || fromPath || "Unknown role");

  return {
    company: company || "Workday",
    role: finalRole || "Unknown role",
    url: listingUrl || location.href.split("?")[0],
    jobKey,
    reqId: reqId || "",
    source: "workday",
  };
}

function parseAshby() {
  const ldAshby =
    typeof parseJobPostingJsonLd === "function" ? parseJobPostingJsonLd() : { title: "", company: "" };
  let role =
    ldAshby.title ||
    textOf(document.querySelector("h1")) ||
    document.title.split("|")[0].trim() ||
    "";
  const parts = location.pathname.split("/").filter(Boolean);
  const org = (parts[0] || "").toLowerCase();
  const jobId = parts.find((p, i) => i > 0 && /^[0-9a-f-]{8,}$/i.test(p)) || parts[1] || "";
  let company =
    (ldAshby.company && !isWeakCompany(ldAshby.company, "ashby") && ldAshby.company) ||
    org.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  // Prefer "@ Company" from the page title, then from an h1 that still has it glued on
  const atMatch =
    document.title.match(/@\s*(.+?)(?:\s*[|\-]|$)/) || role.match(/\s+@\s*(.+)$/);
  if (atMatch) company = atMatch[1].trim();
  // Strip "@ Company" / "at Company Inc" — ApplyTrackATS.ashby.scrubRole
  role = typeof scrubRole === "function" ? scrubRole(role, "ashby") || role : role;
  // Trailing duplicate of the company name (no @/at separator)
  if (company && role) {
    const esc = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    role = role.replace(new RegExp(`\\s*[\\-–—|]?\\s*${esc}\\s*$`, "i"), "").trim() || role;
  }
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
  // recruiting.ultipro.com/tos1002tabs/JobBoard/.../OpportunityDetail?opportunityId=...
  // Never title-case / digit-strip opaque tenant codes (tos1002tabs → "Tostabs").
  const params = new URLSearchParams(location.search);
  const pathParts = location.pathname.split("/").filter(Boolean);
  const tenant = pathParts[0] || "";
  const boardId =
    params.get("jobBoardId") ||
    params.get("JobBoardId") ||
    (pathParts[1]?.toLowerCase() === "jobboard" &&
    pathParts[2] &&
    !/^(opportunity|application)/i.test(pathParts[2])
      ? pathParts[2]
      : "");
  const opportunityId =
    params.get("opportunityId") ||
    params.get("OpportunityId") ||
    location.pathname.match(/OpportunityDetail\/([^/?#]+)/i)?.[1] ||
    params.get("jobId") ||
    "";

  const body = (document.body?.innerText || "").slice(0, 5000);
  const reqMatch =
    body.match(/Requisition\s*(?:Number|#)?\s*[:.]?\s*([A-Z0-9_-]{5,})/i) ||
    textOf(document.body).match(/SOFTW\d+/i);

  const bad =
    /^(apply now|apply with linkedin|job category|requisition|posted date|full-time|hybrid|careers?|jobs?|home|sign in|customer care)\b/i;

  function looksLikeTenantCode(s) {
    const t = (s || "").trim();
    if (!t || /\s/.test(t)) return false;
    // Opaque UKG path tenants: tos1002tabs, pow1009pows
    if (/^[a-z]{2,}\d+[a-z]{2,}$/i.test(t)) return true;
    if (/^[a-z0-9]{6,}$/i.test(t) && /\d/.test(t) && /[a-z]/i.test(t)) return true;
    return false;
  }

  function imgAlt(sel) {
    const el = document.querySelector(sel);
    if (!el) return "";
    return (el.getAttribute("alt") || el.alt || "").trim().replace(/\s+/g, " ");
  }

  /** Prefer brand alts; scrub "logo" suffix — do not reject "TOSHIBA logo". */
  function cleanBrand(raw) {
    let c = (raw || "").trim().replace(/\s+/g, " ");
    c = c
      .replace(/\s+logo$/i, "")
      .replace(/^logo\s+(of\s+)?/i, "")
      .trim();
    if (!c || c.length < 2 || c.length > 60) return "";
    if (/^(logo|ulti|ukg|ultipro|image)$/i.test(c)) return "";
    if (/logo|ulti\s*pro|\bukg\b|image/i.test(c)) return "";
    if (looksLikeTenantCode(c)) return "";
    return c;
  }

  function pick(...cands) {
    for (const raw of cands) {
      const t = (raw || "").trim().replace(/\s+/g, " ");
      if (!t || t.length < 6 || bad.test(t)) continue;
      return t;
    }
    return "";
  }

  const ldUltiPro =
    typeof parseJobPostingJsonLd === "function" ? parseJobPostingJsonLd() : { title: "", company: "" };

  const roleRaw = pick(
    ldUltiPro.title,
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

  let company = "";

  // Known opaque tenants → brand (never digit-strip the path segment)
  if (/pow1009pows|pows|powersecure/i.test(tenant) || /powersecure/i.test(body)) {
    company = "PowerSecure";
  } else if (/tos1002tabs|toshiba|tostabs/i.test(tenant)) {
    company = "Toshiba";
  }

  if (!company && ldUltiPro.company && !looksLikeTenantCode(ldUltiPro.company)) {
    const fromLd = cleanBrand(ldUltiPro.company);
    if (fromLd) company = fromLd;
  }

  // Logo alt / header brand (img alt — textOf(img) is always empty)
  if (!company) {
    const logo =
      cleanBrand(
        imgAlt(
          "header img[alt], .logo img[alt], [class*='logo'] img[alt], a[class*='logo'] img[alt], [class*='brand'] img[alt]",
        ),
      ) ||
      cleanBrand(
        [...document.querySelectorAll("img[alt]")]
          .map((img) => (img.getAttribute("alt") || "").trim())
          .find((a) => cleanBrand(a)) || "",
      );
    if (logo) company = logo;
  }

  if (!company) {
    const og = document
      .querySelector('meta[property="og:site_name"]')
      ?.getAttribute("content")
      ?.trim();
    company = cleanBrand(og);
  }

  if (!company) {
    for (const part of document.title.split(/\s*[|–—]\s*/).map((s) => s.trim())) {
      if (!part || bad.test(part) || /careers?|jobs?|ukg|ultipro|apply/i.test(part)) continue;
      const cleaned = cleanBrand(part);
      if (
        cleaned &&
        cleaned.length < 40 &&
        cleaned.toLowerCase() !== role.toLowerCase() &&
        !looksLikeTenantCode(cleaned)
      ) {
        company = cleaned;
        break;
      }
    }
  }

  // Explicitly reject tenant path segments — never invent a company from them
  if (
    company &&
    (looksLikeTenantCode(company) ||
      (looksLikeTenantCode(tenant) &&
        company.replace(/\s/g, "").toLowerCase() ===
          tenant.replace(/\d+/g, "").toLowerCase()))
  ) {
    company = "";
  }
  if (!company && tenant && !looksLikeTenantCode(tenant) && !/\d/.test(tenant)) {
    // Rare readable slug without digits — title-case only when safe
    company = tenant
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }
  if (!company) company = "UKG";

  if (typeof scrubCompany === "function") {
    company = scrubCompany(company, "ultipro") || company;
  }

  const jobKey = opportunityId
    ? `ultipro:${opportunityId}`
    : reqMatch?.[1]
      ? `ultipro:${reqMatch[1]}`
      : boardId
        ? `ultipro:board:${boardId}`
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
    reqId: parsed.reqId || "",
    url: parsed.url,
    source: src,
    locked: true,
    at: Date.now(),
    jobDescription: typeof parsed.jobDescription === "string" ? parsed.jobDescription : "",
  };
  const json = JSON.stringify(payload);
  sessionStorage.setItem(`applytrack:job:${parsed.jobKey}`, json);
  sessionStorage.setItem("applytrack:job:latest", json);
  if (src) sessionStorage.setItem(`applytrack:ctx:${src}`, json);
}

/** True when company/role labels are the same string (ignoring whitespace/case). */
function labelsMatch(a, b) {
  const x = (a || "").replace(/\s+/g, "").toLowerCase();
  const y = (b || "").replace(/\s+/g, "").toLowerCase();
  return Boolean(x && y && x === y);
}

/**
 * Company is usable for locking only when it's a real employer name —
 * not weak chrome, and never a duplicate of the role title.
 */
function isUsableCompany(company, role, source) {
  const c = (company || "").trim();
  if (!c || isWeakCompany(c, source)) return false;
  if (role && labelsMatch(c, role)) return false;
  return true;
}

/** True once we have a real role + company for this posting — never mutate after. */
function isSolidLock(prev, source) {
  if (!prev?.locked || !prev.jobKey) return false;
  const src = source || prev.source;
  if (!prev.role || isWeakRole(prev.role, src)) return false;
  // company === role is never solid (e.g. Lever locked "Software Engineer" as both)
  if (!isUsableCompany(prev.company, prev.role, src)) return false;
  return true;
}

function readBestJobCtx(parsed, source) {
  const src = source || parsed?.source;
  let prev = parsed?.jobKey ? readJobCtx(`applytrack:job:${parsed.jobKey}`) : null;
  if (!prev && src) prev = readJobCtx(`applytrack:ctx:${src}`);
  // Wizard steps often drop the id / switch to "web" — reuse solid latest
  if (!prev) {
    const latest = readJobCtx("applytrack:job:latest");
    if (latest) {
      const currWeak =
        !parsed?.role || isWeakRole(parsed.role, src) || isWeakRole(parsed.role, latest.source);
      const currNoKey = !parsed?.jobKey;
      if (isSolidLock(latest, latest.source) && (currWeak || currNoKey || !src || src === "web")) {
        prev = latest;
      } else if (!src || latest.source === src) {
        prev = latest;
      }
    }
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
    const existingJdOk = isDecentJobDescription(existing?.jobDescription);
    const parsedJdOk = isDecentJobDescription(parsed.jobDescription);
    // Solid lock for this posting — frozen until tab session ends. Still let a
    // still-missing JD populate in from a later parse of the same listing.
    if (!force && existing && existing.jobKey === parsed.jobKey && isSolidLock(existing, src)) {
      if (!existingJdOk && parsedJdOk) {
        writeJobCtx({ ...existing, jobDescription: parsed.jobDescription });
      }
      return;
    }

    // Build next payload: never downgrade a good field already stored
    const role =
      !force && existing && !isWeakRole(existing.role, src)
        ? existing.role
        : scrubRole(parsed.role, src) || parsed.role;
    // Weak / role-duplicate company must upgrade from a better parse
    const existingCoOk =
      existing && isUsableCompany(existing.company, role, src);
    const company =
      !force && existingCoOk
        ? existing.company
        : scrubCompany(parsed.company, src) || parsed.company || existing?.company;
    const url = existing?.url || parsed.url;
    // Once decent, a JD is frozen too — never replaced by a shorter/empty capture.
    const jobDescription = existingJdOk
      ? existing.jobDescription
      : parsedJdOk
        ? parsed.jobDescription
        : existing?.jobDescription || parsed.jobDescription || "";

    if (isWeakRole(role, src)) return;

    writeJobCtx({
      ...parsed,
      role,
      company,
      url,
      jobDescription,
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
    const lockSrc = prev.source || src;
    // Apply/wizard/thank-you surfaces must never re-derive identity from page chrome —
    // prefer the session lock outright, even when it's merely "usable" (not yet solid).
    const wizardPage =
      typeof isApplicationWizardPage === "function"
        ? isApplicationWizardPage(location.href, lockSrc || src)
        : false;

    // Different posting ids — don't mix, unless current title is junk (wizard chrome),
    // or we're on an apply/wizard/thank-you page where a solid lock always wins even
    // if the fresh parse happens to produce text that isn't technically "weak".
    if (parsed.jobKey && prev.jobKey && parsed.jobKey !== prev.jobKey) {
      const currWeak =
        !parsed.role || isWeakRole(parsed.role, src) || isWeakRole(parsed.role, lockSrc);
      if (!(isSolidLock(prev, lockSrc) && (currWeak || wizardPage))) return parsed;
    }

    // FROZEN: once solid, ignore page parse for identity fields
    if (isSolidLock(prev, lockSrc)) {
      // Re-scrub locked role (cleans older locks that still had "R 108283" glued on)
      const cleanRole = scrubRole(prev.role, lockSrc) || prev.role;
      const cleanCo = scrubCompany(prev.company, lockSrc) || prev.company;
      if (cleanRole !== prev.role || cleanCo !== prev.company) {
        try {
          writeJobCtx({
            ...prev,
            role: cleanRole,
            company: cleanCo,
            reqId: prev.reqId || parsed.reqId || "",
          });
        } catch {
          /* ignore */
        }
      }
      return {
        ...parsed,
        jobKey: prev.jobKey,
        role: cleanRole,
        company: cleanCo,
        reqId: prev.reqId || parsed.reqId || "",
        url: prev.url || parsed.url,
        source: prev.source || parsed.source || src,
        locked: true,
        jobDescription: isDecentJobDescription(prev.jobDescription)
          ? prev.jobDescription
          : parsed.jobDescription || prev.jobDescription || "",
      };
    }

    // Incomplete lock — fill gaps / upgrade weak fields only. A field already
    // recorded as usable never regresses to a fresh parse, regardless of page type.
    const prevRoleOk = prev.role && !isWeakRole(prev.role, lockSrc);
    const nextRoleOk = parsed.role && !isWeakRole(parsed.role, src);
    const role = prevRoleOk
      ? prev.role
      : nextRoleOk
        ? scrubRole(parsed.role, src)
        : prev.role || parsed.role;

    const prevCo = scrubCompany(prev.company, lockSrc);
    const nextCo = scrubCompany(parsed.company, src);
    // company === role (or other weak) must upgrade from a better page parse
    const prevCoOk = isUsableCompany(prevCo, role, lockSrc);
    const nextCoOk = isUsableCompany(nextCo, role, src);
    const company = prevCoOk ? prevCo : nextCoOk ? nextCo : nextCo || prevCo || parsed.company;
    const jobDescription = isDecentJobDescription(prev.jobDescription)
      ? prev.jobDescription
      : parsed.jobDescription || prev.jobDescription || "";

    return {
      ...parsed,
      jobKey: parsed.jobKey || prev.jobKey,
      role,
      company,
      url: prev.url || parsed.url,
      source: prev.source || parsed.source || src,
      jobDescription,
    };
  } catch {
    return parsed;
  }
}

/**
 * Lightweight UI signal only — never blocks Mark Sent / auto-log.
 *   high:   solid role+company+jobKey, company !== role, not weak, decent JD on file
 *   medium: role/company are usable but jobKey and/or JD is still missing
 *   low:    weak/duplicate company or role, or an apply/wizard/thank-you page
 *           without a solid (or at least usable) lock backing it yet
 */
function computeCaptureConfidence(parsed, opts = {}) {
  if (!parsed) return "low";
  const source = parsed.source;
  const role = parsed.role || "";
  const company = parsed.company || "";
  const roleOk = Boolean(role) && !isWeakRole(role, source);
  const companyOk = isUsableCompany(company, role, source);
  if (!roleOk || !companyOk) return "low";
  if (opts.wizardPage && !opts.solid) return "low";
  if (!parsed.jobKey || !isDecentJobDescription(parsed.jobDescription)) return "medium";
  return "high";
}

/** Final payload for UI / save — always listing details when cached. */
function resolveJobPayload(parsed) {
  if (!parsed) return parsed;
  const normalized = typeof normalizeParsed === "function" ? normalizeParsed(parsed) : parsed;
  const merged = mergeRememberedJob(normalized, normalized.source);
  // Never let a weak page parse write over / replace a solid lock
  if (!isWeakRole(merged.role, merged.source)) {
    rememberJob(merged);
  }
  const prev = readBestJobCtx(merged, merged.source);
  let result;
  if (prev && isSolidLock(prev, prev.source || merged.source)) {
    const lockSrc = prev.source || merged.source;
    const cleanRole = scrubRole(prev.role, lockSrc) || prev.role;
    const cleanCo = scrubCompany(prev.company, lockSrc) || prev.company;
    if (cleanRole !== prev.role || cleanCo !== prev.company) {
      try {
        writeJobCtx({
          ...prev,
          role: cleanRole,
          company: cleanCo,
          reqId: prev.reqId || merged.reqId || "",
        });
      } catch {
        /* ignore */
      }
    }
    result = {
      ...merged,
      jobKey: prev.jobKey,
      role: cleanRole,
      company: cleanCo,
      reqId: prev.reqId || merged.reqId || "",
      url: prev.url || merged.url,
      source: lockSrc,
      locked: true,
      jobDescription: isDecentJobDescription(prev.jobDescription)
        ? prev.jobDescription
        : merged.jobDescription || prev.jobDescription || "",
    };
  } else {
    result = typeof normalizeParsed === "function" ? normalizeParsed(merged) : merged;
  }

  try {
    const wizardPage =
      typeof isApplicationWizardPage === "function"
        ? isApplicationWizardPage(
            location.href,
            result.source,
            `${document.title} ${textOf(document.querySelector("h1"))}`,
          )
        : false;
    const solid = isSolidLock({ ...result, locked: true }, result.source);
    result.captureConfidence = computeCaptureConfidence(result, { wizardPage, solid });
  } catch {
    /* ignore — confidence is a best-effort UI hint */
  }
  return result;
}

/**
 * Apply panel edits. Never destroy a solid lock with wizard junk
 * (e.g. Dayforce "Manual Application").
 */
function lockManualJob(company, role, base) {
  const prev = base || {};
  const src = prev.source;
  const c = (company || "").trim();
  const r = (role || "").trim();
  const existing =
    (prev.jobKey && readJobCtx(`applytrack:job:${prev.jobKey}`)) ||
    readBestJobCtx(prev, src);

  // Empty / junk typed values → keep solid lock untouched
  if (!r || isWeakRole(r, src) || isWeakRole(r, existing?.source)) {
    if (existing && isSolidLock(existing, existing.source)) {
      return {
        ...prev,
        jobKey: existing.jobKey,
        role: existing.role,
        company: existing.company,
        url: existing.url || prev.url,
        source: existing.source || src,
        locked: true,
      };
    }
    return base || null;
  }

  const jobKey =
    prev.jobKey ||
    existing?.jobKey ||
    `manual:${(location.href || "").split("#")[0]}`.slice(0, 220);
  const solid = existing && isSolidLock(existing, existing.source);
  // Same as locked values — no rewrite
  if (solid && r === existing.role && (!c || c === existing.company)) {
    return {
      ...prev,
      jobKey: existing.jobKey,
      role: existing.role,
      company: existing.company,
      url: existing.url || prev.url,
      source: existing.source || src,
      locked: true,
    };
  }

  const syntheticKey = !jobKey || String(jobKey).startsWith("manual:");
  const next = {
    ...prev,
    company: c || existing?.company || prev.company || "Unknown",
    role: r,
    jobKey,
    url: existing?.url || prev.url || location.href,
    source: existing?.source || prev.source || "manual",
    locked: true,
    manual: syntheticKey,
  };
  try {
    // Only force when the user typed a real, different title
    rememberJob(next, { force: solid ? r !== existing.role || (c && c !== existing.company) : true });
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

  function sameLabel(a, b) {
    return (
      Boolean(a) &&
      Boolean(b) &&
      a.replace(/\s+/g, "").toLowerCase() === b.replace(/\s+/g, "").toLowerCase()
    );
  }

  /** Brand / legal entity — never use as Role (e.g. "The Kroger Co.") */
  function looksLikeCompanyName(t) {
    const s = (t || "").trim();
    if (!s) return false;
    if (
      /^(the\s+)?[\w.&'’\-]+(?:\s+[\w.&'’\-]+){0,5}\s+(co\.?|inc\.?|llc|ltd\.?|corp\.?|corporation|company|group)\.?$/i.test(
        s,
      )
    ) {
      return true;
    }
    if (
      /\b(inc\.?|llc|ltd\.?|corp\.?|corporation|co\.)\s*$/i.test(s) &&
      !/\b(engineer|developer|analyst|manager|intern|director|specialist|architect|scientist|designer|lead|associate|consultant|coordinator|officer|programmer)\b/i.test(
        s,
      )
    ) {
      return true;
    }
    return false;
  }

  function looksLikeRole(t, rejectCompany = "") {
    const s = scrub(t);
    if (!s || s.length < 8 || badShell.test(s)) return false;
    if (isWeakRole(s, "oracle")) return false;
    if (looksLikeCompanyName(s)) return false;
    if (rejectCompany && sameLabel(s, rejectCompany)) return false;
    return true;
  }

  function scoreRole(t) {
    let n = t.length;
    if (/\b(engineer|developer|analyst|manager|intern|director|specialist|architect|scientist|designer|lead|associate|consultant|coordinator|officer|programmer)\b/i.test(t)) {
      n += 80;
    }
    if (/\b(ii|iii|iv|sr\.?|senior|junior|staff|principal|infrastructure)\b/i.test(t)) n += 20;
    // Prefer page headings / job titles over bloated document.title or brand lines
    if (/\bcareers?\b/i.test(t) || /\bunited states\b/i.test(t)) n -= 100;
    if (looksLikeCompanyName(t)) n -= 200;
    return n;
  }

  function pickRole(cands, rejectCompany = "") {
    let best = "";
    let bestScore = -1e9;
    for (const raw of cands) {
      const t = scrub(raw);
      if (!looksLikeRole(t, rejectCompany)) continue;
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

  // document.title: "Senior Infrastructure Engineer | The Kroger Co."
  // Prefer left of | / emdash; if that is a brand, try other segments
  const titleParts = (document.title || "")
    .split(/[|–—]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const ogTitle = document
    .querySelector('meta[property="og:title"], meta[name="twitter:title"]')
    ?.getAttribute("content")
    ?.trim();

  const roleSelectors = [
    "[class*='jobtitle']",
    "[class*='job-title']",
    "[class*='JobTitle']",
    "[class*='jobTitle']",
    "[id*='jobTitle']",
    "[id*='job-title']",
    "[data-bind*='jobTitle']",
    "[data-bind*='JobTitle']",
    "[class*='job-header'] h1",
    "[class*='JobHeader'] h1",
    "[class*='job-details'] h1",
    "[class*='JobDetails'] h1",
    "[class*='job-details__title']",
    "[class*='jobDetails'] h1",
    "main h1",
    "[role='main'] h1",
  ];

  const roleFromDom = roleSelectors
    .map((sel) => textOf(document.querySelector(sel)))
    .filter(Boolean);

  const roleCandidates = [
    ldTitle,
    ...roleFromDom,
    ...headingTexts,
    ...titleParts,
    ogTitle,
  ];

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

  // Brand-looking heading when job title lives elsewhere (CX often puts company in h1 first)
  if (!company) {
    for (const h of headingTexts) {
      if (looksLikeCompanyName(h) && looksLikeCompany(h)) {
        company = scrubCo(h);
        break;
      }
    }
  }

  // Title segment that looks like a company (right of "|")
  if (!company) {
    for (const part of titleParts) {
      if (looksLikeCompanyName(part) && looksLikeCompany(part)) {
        company = scrubCo(part);
        break;
      }
    }
  }

  // Never use fa-*-saasfaprod1 / oraclecloud tenant hostname as the company.
  // Opaque codes like hcgn / eluq must NOT become "Hcgn".
  const onProfileOrPortal =
    /\/my-profile\b|\/candidateexperience\/[^/]+\/?$/i.test(location.pathname) &&
    !/\/job\/\d+/i.test(location.pathname);
  if (!company && !onProfileOrPortal) {
    const sub = (location.hostname.split(".")[0] || "").replace(/[-_]/g, " ").trim();
    if (/^jpmc$/i.test(sub)) company = "JPMorgan Chase";
    else if (
      sub.length >= 7 &&
      looksLikeCompany(sub) &&
      !isWeakCompany(sub, "oracle") &&
      !/saasfa|exvu|prod\d|oraclecloud|^fa\b/i.test(sub)
    ) {
      company = scrubCo(sub.replace(/\b\w/g, (c) => c.toUpperCase()));
    }
  }
  if (company && isWeakCompany(company, "oracle")) company = "";

  // Prefer real job titles; reject brand/company strings even if they appear first in DOM
  let role = pickRole(roleCandidates, company);
  // If role still equals company (no legal suffix), keep searching without that label
  if ((!role || sameLabel(role, company)) && company) {
    role = pickRole(
      roleCandidates.filter((c) => !sameLabel(scrub(c), company)),
      company,
    );
  }
  if (role && (looksLikeCompanyName(role) || sameLabel(role, company))) role = "";

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
  const params = new URLSearchParams(location.search);
  let parsed;
  if (host.includes("linkedin.com")) parsed = parseLinkedIn();
  else if (isPinpointPage()) parsed = parsePinpoint();
  else if (isRipplingPage()) parsed = parseRippling();
  else if (
    host.includes("greenhouse") ||
    params.get("gh_jid") ||
    (params.get("jobid") && /career|job-listing|\/jobs?\b/i.test(location.href)) ||
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
  } else if (host.includes("dayforcehcm.com") || host.includes("dayforce.com")) {
    parsed = parseDayforce();
  } else if (host.includes("paycomonline.net") && /\/ats\/|\/portal\/|\/jobs\//i.test(location.href)) {
    parsed = parsePaycom();
  } else if (isTeamtailorPage()) {
    parsed = parseTeamtailor();
  } else if (host.includes("smartrecruiters.com")) {
    parsed = parseSmartRecruiters();
  } else {
    parsed = {
      company: "",
      role: document.title || "",
      url: location.href,
      jobKey: null,
      source: "web",
    };
  }

  // Extract the JD once per posting — skip the (relatively expensive) DOM walk
  // once a decent one is already locked in for this jobKey/source.
  try {
    if (typeof extractJobDescription === "function") {
      const lockedCtx =
        (parsed.jobKey && readJobCtx(`applytrack:job:${parsed.jobKey}`)) ||
        (parsed.source && readJobCtx(`applytrack:ctx:${parsed.source}`));
      if (!isDecentJobDescription(lockedCtx?.jobDescription)) {
        parsed.jobDescription = extractJobDescription();
      }
    }
  } catch {
    /* ignore */
  }

  // Always merge solid locks — including weak/web wizard pages
  if (typeof resolveJobPayload === "function") {
    parsed = resolveJobPayload(parsed);
  }
  return parsed;
}
