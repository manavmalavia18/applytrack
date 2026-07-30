/** Site parsers — best-effort DOM extraction. */
function textOf(el) {
  return (el && (el.innerText || el.textContent) || "").trim().replace(/\s+/g, " ");
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
  const role = textOf(document.querySelector("h1.app-title, h1")) || "";
  const company =
    textOf(document.querySelector(".company-name")) ||
    document.title.split(" at ").pop()?.replace(/\s*\|.*/, "").trim() ||
    "";
  const jid =
    new URLSearchParams(location.search).get("gh_jid") ||
    location.pathname.match(/\/jobs\/(\d+)/)?.[1];
  return {
    company,
    role,
    url: location.href,
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
  const role =
    textOf(document.querySelector('[data-automation-id="jobPostingHeader"]')) ||
    textOf(document.querySelector("h2, h1")) ||
    "";
  const company = location.hostname.split(".")[0] || "Workday";
  return {
    company,
    role,
    url: location.href,
    jobKey: null,
    source: "workday",
  };
}

function parseJobPage() {
  const host = location.hostname;
  if (host.includes("linkedin.com")) return parseLinkedIn();
  if (host.includes("greenhouse")) return parseGreenhouse();
  if (host.includes("lever.co")) return parseLever();
  if (host.includes("workday") || host.includes("myworkdayjobs")) return parseWorkday();
  return {
    company: "",
    role: document.title || "",
    url: location.href,
    jobKey: null,
    source: "web",
  };
}
