/** Normalize a job URL into a stable posting key (ATS id preferred). */
export function normalizeJobUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    const drop = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "ref",
      "refId",
      "trk",
      "trackingId",
      "fbclid",
      "gclid",
      "mc_cid",
      "mc_eid",
    ];
    for (const key of drop) url.searchParams.delete(key);
    const host = url.hostname.replace(/^www\./, "");

    // Greenhouse embed on any host (esri.com?gh_jid=...)
    const ghJid = url.searchParams.get("gh_jid");
    if (ghJid) return `greenhouse:${ghJid}`;
    // Custom career shells (e.g. laika.com/careers/job-listing?jobid=…)
    const jobid = url.searchParams.get("jobid");
    if (
      jobid &&
      /^\d{6,}$/.test(jobid) &&
      (/job-listing|grnhse|greenhouse/i.test(raw) || /\/careers?\//i.test(url.pathname))
    ) {
      return `greenhouse:${jobid}`;
    }

    // Pinpoint HQ — {org}.pinpointhq.com/{lang}/postings/{uuid}
    if (host.includes("pinpointhq.com")) {
      const id = url.pathname.match(
        /\/postings\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
      )?.[1];
      if (id) return `pinpoint:${id}`;
    }

    // Rippling ATS — ats.rippling.com/{locale?}/{board}/jobs/{uuid}
    if (host.includes("rippling.com")) {
      const id = url.pathname.match(
        /\/jobs\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
      )?.[1];
      if (id) return `rippling:${id}`;
    }

    if (host.includes("linkedin.com")) {
      const jobId =
        url.searchParams.get("currentJobId") ||
        url.pathname.match(/\/jobs\/view\/(\d+)/)?.[1];
      if (jobId) return `linkedin:${jobId}`;
    }
    if (host.includes("greenhouse") || host.includes("job-boards.greenhouse")) {
      const jid =
        url.searchParams.get("gh_jid") ||
        url.searchParams.get("jobid") ||
        url.pathname.match(/\/jobs\/(\d+)/)?.[1];
      if (jid) return `greenhouse:${jid}`;
    }
    if (host.includes("lever.co")) {
      const slug = url.pathname.replace(/\/+$/, "");
      if (slug) return `lever:${host}${slug}`;
    }
    if (host.includes("myworkdayjobs.com") || host.includes("workday.com")) {
      const path = url.pathname;
      let reqId =
        path.match(/_((?:JR|R|REQ)[-_]?\d{3,}(?:[-_]\d+)?)\b/i)?.[1] ||
        url.href.match(/_((?:JR|R|REQ)[-_]?\d{3,}(?:[-_]\d+)?)\b/i)?.[1] ||
        url.searchParams.get("jobRequisitionId") ||
        url.searchParams.get("requisitionId");
      if (reqId) {
        reqId = String(reqId)
          .toUpperCase()
          .replace(/\s+/g, "")
          .replace(/^(R)(\d{3,})(?:[-_]\d+)?$/i, "R-$2")
          .replace(/^((?:JR|R|REQ)-?\d{3,})[-_]\d+$/i, "$1");
        if (/^R\d{3,}$/.test(reqId)) reqId = `R-${reqId.slice(1)}`;
        return `workday:${reqId}`;
      }
      const jobSeg = path.match(/\/job\/(.+?)(?:\/apply|\?|$)/i)?.[1]?.replace(/\/+$/, "");
      if (jobSeg) return `workday:${host}/${jobSeg}`.toLowerCase();
      const trimmed = path.replace(/\/+$/, "").replace(/\/apply$/i, "");
      if (trimmed) return `workday:${host}${trimmed}`.toLowerCase();
    }
    if (host.includes("ashbyhq.com")) {
      const parts = url.pathname.split("/").filter(Boolean);
      const jobId = parts.find((p, i) => i > 0 && /^[0-9a-f-]{8,}$/i.test(p)) || parts[1];
      if (jobId) return `ashby:${jobId}`;
    }
    if (host.includes("icims.com")) {
      const id = url.pathname.match(/\/jobs\/(\d+)/)?.[1];
      if (id) return `icims:${id}`;
    }
    if (host.includes("applytojob.com") || host.includes("jazzhr.com") || host.includes("jazz.co")) {
      const id = url.pathname.match(/\/apply\/([^/]+)/i)?.[1];
      if (id) return `jazzhr:${id}`;
    }
    if (host.includes("successfactors.com") || host.includes("successfactors.eu")) {
      const id =
        url.searchParams.get("jobId") ||
        url.searchParams.get("jobReqId") ||
        url.searchParams.get("reqId") ||
        url.searchParams.get("requisitionId") ||
        url.pathname.match(/\/job\/(\d+)/)?.[1];
      if (id) return `successfactors:${id}`;
      // Volatile session tokens in query — keep host+path only as last resort
      return `successfactors:${host}${url.pathname}`.toLowerCase();
    }
    if (host.includes("paylocity.com")) {
      const id =
        url.pathname.match(/\/Details\/(\d+)/i)?.[1] ||
        url.pathname.match(/\/Jobs\/(\d+)/i)?.[1] ||
        url.searchParams.get("jobId");
      if (id) return `paylocity:${id}`;
    }
    if (host.includes("ultipro.com") || host.includes("ukg.com")) {
      const id =
        url.searchParams.get("opportunityId") ||
        url.searchParams.get("OpportunityId") ||
        url.pathname.match(/OpportunityDetail\/([^/?#]+)/i)?.[1];
      if (id) return `ultipro:${id}`;
    }
    if (host.includes("phenom.com") || host.includes("phenompeople.com") || host.includes("phenompro.com")) {
      const id = url.pathname.match(/\/job\/(\d+)/i)?.[1] || url.pathname.match(/\/jobs\/(\d+)/i)?.[1];
      if (id) return `phenom:${id}`;
    }
    if (host.includes("salesforce-sites.com") || host.includes("force.com")) {
      const id =
        url.searchParams.get("jobID") ||
        url.searchParams.get("jobId") ||
        url.searchParams.get("JobId");
      if (id) return `salesforce:${id}`;
    }
    if (host.includes("bamboohr.com")) {
      const id = url.pathname.match(/\/careers\/(\d+)/i)?.[1] || url.pathname.match(/\/jobs\/(\d+)/i)?.[1];
      if (id) return `bamboohr:${id}`;
    }
    if (host.includes("workable.com")) {
      const id = url.pathname.match(/\/view\/([^/]+)/i)?.[1] || url.pathname.match(/\/j\/([^/]+)/i)?.[1];
      if (id) return `workable:${id}`;
    }
    if (host.includes("entertimeonline.com") || host.includes("adp.com")) {
      const id =
        url.searchParams.get("ShowJob") ||
        url.searchParams.get("jobId") ||
        url.searchParams.get("JobId") ||
        url.searchParams.get("reqId") ||
        url.searchParams.get("requisitionId");
      if (id) return `adp:${id}`;
    }
    if (host.includes("oraclecloud.com")) {
      const id = url.pathname.match(/\/job\/(\d+)/)?.[1];
      if (id) return `oracle:${id}`;
    }
    if (host.includes("taleo.net")) {
      const id =
        url.searchParams.get("reqNo") ||
        url.searchParams.get("job") ||
        url.searchParams.get("jobId") ||
        url.searchParams.get("requisition") ||
        url.pathname.match(/\/jobdetail[^/]*\/(?:job\/)?(\d+)/i)?.[1];
      if (id) return `taleo:${id}`;
    }
    if (host.includes("dayforcehcm.com") || host.includes("dayforce.com")) {
      const parts = url.pathname.split("/").filter(Boolean);
      const jobsIdx = parts.findIndex((p) => /^jobs?$/i.test(p));
      const id =
        (jobsIdx >= 0 && parts[jobsIdx + 1] && /^\d+$/.test(parts[jobsIdx + 1])
          ? parts[jobsIdx + 1]
          : "") || url.pathname.match(/\/jobs\/(\d+)/i)?.[1];
      const client = jobsIdx >= 2 ? parts[jobsIdx - 2] : "";
      if (id) return `dayforce:${(client || "job").toLowerCase()}:${id}`;
    }
    if (host.includes("paycomonline.net")) {
      const portal = url.pathname.match(/\/portal\/([A-Fa-f0-9]+)/)?.[1];
      const id = url.pathname.match(/\/jobs\/(\d+)/)?.[1];
      if (id) return portal ? `paycom:${portal}:${id}` : `paycom:${id}`;
    }
    if (host.includes("teamtailor.com")) {
      const id = url.pathname.match(/\/jobs\/(\d+)/)?.[1];
      if (id) return `teamtailor:${id}`;
    }
    // Custom-domain Teamtailor boards often use /jobs/{id}-slug
    if (/\/jobs\/\d+[-/]/i.test(url.pathname) && /careers\.|jobs\./i.test(host)) {
      const id = url.pathname.match(/\/jobs\/(\d+)/)?.[1];
      if (id) return `teamtailor:${id}`;
    }
    if (host.includes("smartrecruiters.com")) {
      const id = url.pathname.match(/\/(\d{10,})(?:-|\/|$)/)?.[1];
      if (id) return `smartrecruiters:${id}`;
    }
    url.searchParams.sort();
    return `${host}${url.pathname}${url.search}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

/** Strip application-cycle suffix: greenhouse:123#2 → greenhouse:123 */
export function baseJobKey(jobKey: string): string {
  return jobKey.replace(/#\d+$/, "");
}

const STALE_MS = 30 * 24 * 60 * 60 * 1000;

/** Same posting id reused months later → treat as a new apply cycle. */
export function isStaleApplication(app: {
  status: string;
  appliedAt: Date | string | null;
  updatedAt: Date | string;
}): boolean {
  if (app.status === "rejected" || app.status === "offer") return true;
  const anchor = app.appliedAt || app.updatedAt;
  const t = anchor instanceof Date ? anchor.getTime() : new Date(anchor).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t > STALE_MS;
}

/** Form-wizard chrome mistaken for a job title. */
export function isJunkRole(role: string): boolean {
  const t = (role || "").trim();
  if (!t || t === "Unknown role") return true;
  if (/^you have applied for\b/i.test(t)) return true;
  return /^(enter your (information|info)|personal information|additional information|work experience|education|equal opportunity|review( your application)?|application( form)?|my profile|work summary|demographics|preferences|thank you|candidate|profile|privacy agreement|manual application|manual apply)$/i.test(
    t,
  );
}

/** Strip confirmation chrome from a job title. */
export function cleanRoleTitle(role: string): string {
  return (role || "")
    .replace(/^you have applied for\s+/i, "")
    .replace(/^you('ve| have) successfully applied( for)?\s+/i, "")
    .replace(/^application (submitted|received) for\s+/i, "")
    .trim();
}

export function detectSource(raw: string): string {
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "");
    if (host.includes("linkedin.com")) return "linkedin";
    if (
      host.includes("greenhouse") ||
      new URL(raw).searchParams.get("gh_jid") ||
      (/^\d{5,}$/.test(new URL(raw).searchParams.get("jobid") || "") &&
        /career|job-listing|\/jobs?\b/i.test(raw))
    ) {
      return "greenhouse";
    }
    if (host.includes("pinpointhq.com")) return "pinpoint";
    if (host.includes("rippling.com")) return "rippling";
    if (host.includes("lever.co")) return "lever";
    if (host.includes("workday")) return "workday";
    if (host.includes("ashbyhq.com")) return "ashby";
    if (host.includes("icims.com")) return "icims";
    if (host.includes("applytojob.com") || host.includes("jazzhr") || host.includes("jazz.co")) {
      return "jazzhr";
    }
    if (host.includes("successfactors.com") || host.includes("successfactors.eu")) {
      return "successfactors";
    }
    if (host.includes("paylocity.com")) return "paylocity";
    if (host.includes("ultipro.com") || host.includes("ukg.com")) return "ultipro";
    if (host.includes("phenom.com") || host.includes("phenompeople") || host.includes("phenompro")) {
      return "phenom";
    }
    if (host.includes("salesforce-sites.com") || host.includes("force.com")) return "salesforce";
    if (host.includes("bamboohr.com")) return "bamboohr";
    if (host.includes("workable.com")) return "workable";
    if (host.includes("entertimeonline.com") || host.includes("adp.com")) return "adp";
    if (host.includes("oraclecloud.com")) return "oracle";
    if (host.includes("taleo.net")) return "taleo";
    if (host.includes("dayforcehcm.com") || host.includes("dayforce.com")) return "dayforce";
    if (host.includes("paycomonline.net")) return "paycom";
    if (host.includes("teamtailor.com")) return "teamtailor";
    if (/\/jobs\/\d+[-/]/i.test(new URL(raw).pathname) && /careers\.|jobs\./i.test(host)) {
      return "teamtailor";
    }
    if (host.includes("smartrecruiters.com")) return "smartrecruiters";
    return host.split(".")[0] || "web";
  } catch {
    return "manual";
  }
}
