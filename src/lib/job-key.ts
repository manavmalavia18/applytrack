/** Normalize a job URL into a stable key for revisit detection. */
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
    // LinkedIn: keep currentJobId / jobId if present as identity
    const host = url.hostname.replace(/^www\./, "");
    if (host.includes("linkedin.com")) {
      const jobId =
        url.searchParams.get("currentJobId") ||
        url.pathname.match(/\/jobs\/view\/(\d+)/)?.[1];
      if (jobId) return `linkedin:${jobId}`;
    }
    if (host.includes("greenhouse.io") || host.includes("boards.greenhouse.io")) {
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
      const path = url.pathname.replace(/\/+$/, "");
      if (path) return `workday:${host}${path}`;
    }
    url.searchParams.sort();
    return `${host}${url.pathname}${url.search}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

export function detectSource(raw: string): string {
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "");
    if (host.includes("linkedin.com")) return "linkedin";
    if (host.includes("greenhouse")) return "greenhouse";
    if (host.includes("lever.co")) return "lever";
    if (host.includes("workday")) return "workday";
    return host.split(".")[0] || "web";
  } catch {
    return "manual";
  }
}
