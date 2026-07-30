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

    if (host.includes("linkedin.com")) {
      const jobId =
        url.searchParams.get("currentJobId") ||
        url.pathname.match(/\/jobs\/view\/(\d+)/)?.[1];
      if (jobId) return `linkedin:${jobId}`;
    }
    if (host.includes("greenhouse") || host.includes("job-boards.greenhouse")) {
      const jid =
        url.searchParams.get("gh_jid") ||
        url.pathname.match(/\/jobs\/(\d+)/)?.[1];
      if (jid) return `greenhouse:${jid}`;
    }
    if (host.includes("lever.co")) {
      const slug = url.pathname.replace(/\/+$/, "");
      if (slug) return `lever:${host}${slug}`;
    }
    if (host.includes("myworkdayjobs.com") || host.includes("workday.com")) {
      const path = url.pathname;
      const reqId =
        path.match(/_((?:JR|R|REQ)[-_]?\d{3,})\b/i)?.[1] ||
        url.href.match(/_((?:JR|R|REQ)[-_]?\d{3,})\b/i)?.[1] ||
        url.searchParams.get("jobRequisitionId") ||
        url.searchParams.get("requisitionId");
      if (reqId) return `workday:${reqId.toUpperCase()}`;
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
  return /^(enter your (information|info)|personal information|additional information|work experience|education|equal opportunity|review( your application)?|application( form)?|my profile|work summary|demographics|preferences|thank you|candidate|profile|privacy agreement)$/i.test(
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
    if (host.includes("greenhouse") || new URL(raw).searchParams.get("gh_jid")) {
      return "greenhouse";
    }
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
    return host.split(".")[0] || "web";
  } catch {
    return "manual";
  }
}
