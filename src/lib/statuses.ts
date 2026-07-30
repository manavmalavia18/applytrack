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
