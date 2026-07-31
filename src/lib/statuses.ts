import type { ApplicationStatus } from "@/db/schema";

/**
 * User-facing copy for each status. The underlying DB enum (`saved`, `oa`, …)
 * stays as-is for compatibility with the extension + existing rows — only the
 * label shown in the UI changes. Never surface the raw enum value to users.
 */
export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: "Wishlist",
  applied: "Sent",
  oa: "Assessment",
  interview: "Interviewing",
  offer: "Offer",
  rejected: "Closed",
};

/** Short verb used in relative-time hints, e.g. "sent 3d ago". */
export const STATUS_VERB: Record<ApplicationStatus, string> = {
  saved: "saved",
  applied: "sent",
  oa: "sent",
  interview: "sent",
  offer: "sent",
  rejected: "sent",
};

export const PIPELINE_ORDER: ApplicationStatus[] = [
  "saved",
  "applied",
  "oa",
  "interview",
  "offer",
  "rejected",
];

/** Tailwind classes for the colored status pill/chip shown on cards + filters. */
export const STATUS_STYLES: Record<ApplicationStatus, string> = {
  saved: "bg-slate-100 text-slate-600 border-slate-200",
  applied: "bg-sky-100 text-sky-700 border-sky-200",
  oa: "bg-amber-100 text-amber-800 border-amber-200",
  interview: "bg-violet-100 text-violet-700 border-violet-200",
  offer: "bg-teal-100 text-teal-800 border-teal-300",
  rejected: "bg-zinc-100 text-zinc-500 border-zinc-200",
};

/** Solid-dot variant used for compact indicators. */
export const STATUS_DOT: Record<ApplicationStatus, string> = {
  saved: "bg-slate-400",
  applied: "bg-sky-500",
  oa: "bg-amber-500",
  interview: "bg-violet-500",
  offer: "bg-teal-600",
  rejected: "bg-zinc-400",
};

export function isStatus(value: string): value is ApplicationStatus {
  return value in STATUS_LABELS;
}

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual entry",
  web: "Web",
  linkedin: "LinkedIn",
  greenhouse: "Greenhouse",
  lever: "Lever",
  workday: "Workday",
  ashby: "Ashby",
  icims: "iCIMS",
  jazzhr: "JazzHR",
  successfactors: "SuccessFactors",
  paylocity: "Paylocity",
  ultipro: "UKG / UltiPro",
  phenom: "Phenom",
  salesforce: "Salesforce",
  bamboohr: "BambooHR",
  workable: "Workable",
  adp: "ADP",
  oracle: "Oracle Cloud",
  taleo: "Taleo",
  dayforce: "Dayforce",
  paycom: "Paycom",
  teamtailor: "Teamtailor",
  smartrecruiters: "SmartRecruiters",
  pinpoint: "Pinpoint",
  rippling: "Rippling",
};

export function formatSource(source: string): string {
  if (!source) return "Unknown";
  return SOURCE_LABELS[source] || source.charAt(0).toUpperCase() + source.slice(1);
}

/** Split a stored job key (e.g. "greenhouse:12345#2") into ATS + posting id. */
export function parseJobKey(jobKey: string): { ats: string; id: string; cycle: number | null } {
  const cycleMatch = jobKey.match(/#(\d+)$/);
  const base = cycleMatch ? jobKey.slice(0, cycleMatch.index) : jobKey;
  const idx = base.indexOf(":");
  if (idx === -1) return { ats: "", id: base, cycle: cycleMatch ? Number(cycleMatch[1]) : null };
  return {
    ats: base.slice(0, idx),
    id: base.slice(idx + 1),
    cycle: cycleMatch ? Number(cycleMatch[1]) : null,
  };
}
