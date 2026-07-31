import type { AppRow } from "@/lib/types";
import { formatSource, parseJobKey, STATUS_LABELS } from "@/lib/statuses";
import type { ApplicationStatus } from "@/db/schema";

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

// Excel caps cell text at 32,767 chars — leave headroom for a truncation note.
const MAX_XLSX_CELL_CHARS = 32000;

function fmtJobDescription(jd: string | null): string {
  if (!jd) return "";
  return jd.length > MAX_XLSX_CELL_CHARS
    ? `${jd.slice(0, MAX_XLSX_CELL_CHARS)}\n…[truncated for Excel cell limit]`
    : jd;
}

/** Build a plain-object row set for the applications sheet (used by xlsx export). */
export function toExportRows(apps: AppRow[]) {
  return apps.map((app) => {
    const { ats, id: postingId } = parseJobKey(app.jobKey || "");
    return {
      Company: app.company,
      Role: app.role,
      Status: STATUS_LABELS[(app.status as ApplicationStatus) in STATUS_LABELS ? (app.status as ApplicationStatus) : "applied"] || app.status,
      Source: formatSource(app.source),
      "Job URL": app.url,
      "Job ID": app.reqId || postingId || "",
      "ATS": ats || "",
      "Posting Key": app.jobKey || "",
      "Applied At": fmtDate(app.appliedAt),
      "Follow-up At": fmtDate(app.followUpAt),
      "Created At": fmtDate(app.createdAt),
      "Last Updated": fmtDate(app.updatedAt),
      Notes: app.notes,
      "Job Description": fmtJobDescription(app.jobDescription),
    };
  });
}

/** Client-only: generates and downloads an .xlsx workbook of the given applications. */
export async function exportApplicationsToExcel(apps: AppRow[], filename = "applytrack-applications.xlsx") {
  const XLSX = await import("xlsx");
  const rows = toExportRows(apps);
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 22 }, // Company
    { wch: 32 }, // Role
    { wch: 12 }, // Status
    { wch: 16 }, // Source
    { wch: 42 }, // Job URL
    { wch: 18 }, // Job ID
    { wch: 14 }, // ATS
    { wch: 30 }, // Posting Key
    { wch: 12 }, // Applied At
    { wch: 12 }, // Follow-up At
    { wch: 12 }, // Created At
    { wch: 12 }, // Last Updated
    { wch: 40 }, // Notes
    { wch: 60 }, // Job Description
  ];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Applications");
  XLSX.writeFile(book, filename);
}
