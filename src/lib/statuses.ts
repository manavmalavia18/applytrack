import type { ApplicationStatus } from "@/db/schema";

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  oa: "OA",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

export const PIPELINE_ORDER: ApplicationStatus[] = [
  "saved",
  "applied",
  "oa",
  "interview",
  "offer",
  "rejected",
];

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
