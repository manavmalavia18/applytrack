"use client";

import { format, formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import {
  PIPELINE_ORDER,
  STATUS_LABELS,
  STATUS_STYLES,
  formatSource,
  parseJobKey,
} from "@/lib/statuses";
import type { ApplicationStatus } from "@/db/schema";
import type { AppRow } from "@/lib/types";

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function fmtFull(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${format(d, "MMM d, yyyy")} (${formatDistanceToNow(d, { addSuffix: true })})`;
}

type Props = {
  app: AppRow;
  busy: boolean;
  onClose: () => void;
  onSave: (id: string, patch: Record<string, unknown>) => Promise<void>;
  onDelete: (id: string) => void;
};

export function ApplicationDetail({ app, busy, onClose, onSave, onDelete }: Props) {
  const [form, setForm] = useState({
    company: app.company,
    role: app.role,
    url: app.url,
    status: app.status as ApplicationStatus,
    reqId: app.reqId,
    notes: app.notes,
    jobDescription: app.jobDescription || "",
    appliedAt: toDateInputValue(app.appliedAt),
    followUpAt: toDateInputValue(app.followUpAt),
  });
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm({
      company: app.company,
      role: app.role,
      url: app.url,
      status: app.status as ApplicationStatus,
      reqId: app.reqId,
      notes: app.notes,
      jobDescription: app.jobDescription || "",
      appliedAt: toDateInputValue(app.appliedAt),
      followUpAt: toDateInputValue(app.followUpAt),
    });
    setDirty(false);
  }, [app]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { ats, id: postingId, cycle } = parseJobKey(app.jobKey || "");

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
    setSaved(false);
  }

  async function handleSave() {
    await onSave(app.id, {
      company: form.company.trim() || app.company,
      role: form.role.trim() || app.role,
      url: form.url.trim() || app.url,
      status: form.status,
      reqId: form.reqId.trim(),
      notes: form.notes,
      jobDescription: form.jobDescription,
      appliedAt: form.appliedAt || null,
      followUpAt: form.followUpAt || null,
    });
    setDirty(false);
    setSaved(true);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close details"
        onClick={onClose}
        className="absolute inset-0 bg-black/30 backdrop-blur-[1px]"
      />
      <aside className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-xl sm:max-w-md">
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-zinc-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-semibold text-zinc-900">{app.role}</h2>
              <span
                className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[form.status]}`}
              >
                {STATUS_LABELS[form.status]}
              </span>
            </div>
            <p className="truncate text-sm text-zinc-600">{app.company}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-zinc-200 px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-50"
          >
            Close
          </button>
        </header>

        <div className="flex flex-1 flex-col gap-5 px-5 py-5">
          <a
            href={app.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-1 rounded-md bg-teal-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-900"
          >
            Open job posting ↗
          </a>

          <section className="grid grid-cols-1 gap-x-4 gap-y-3 rounded-lg border border-zinc-200 bg-zinc-50/70 p-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">Source / ATS</p>
              <p className="font-medium text-zinc-800">{formatSource(app.source)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">ATS posting id</p>
              <p className="truncate font-medium text-zinc-800" title={form.reqId || postingId || "—"}>
                {form.reqId || postingId || "—"}
              </p>
            </div>
            {ats ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Detected board</p>
                <p className="font-medium text-zinc-800">{ats}</p>
              </div>
            ) : null}
            {cycle && cycle > 1 ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-500">Apply cycle</p>
                <p className="font-medium text-zinc-800">#{cycle} (reopened posting)</p>
              </div>
            ) : null}
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">Created</p>
              <p className="font-medium text-zinc-800">{fmtFull(app.createdAt)}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-zinc-500">Last updated</p>
              <p className="font-medium text-zinc-800">{fmtFull(app.updatedAt)}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-zinc-500">Posting key</p>
              <p className="truncate font-mono text-xs text-zinc-500" title={app.jobKey}>
                {app.jobKey || "—"}
              </p>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Job description
            </h3>
            {form.jobDescription ? (
              <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-zinc-200 bg-zinc-50/70 p-3 text-sm leading-relaxed text-zinc-700">
                {form.jobDescription}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 p-3 text-sm text-zinc-500">
                No job description captured yet. Paste one below to keep it with this application.
              </p>
            )}
            <textarea
              value={form.jobDescription}
              onChange={(e) => set("jobDescription", e.target.value)}
              rows={4}
              placeholder="Paste the job description here…"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </section>

          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Edit details
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-zinc-600">Company</span>
                <input
                  value={form.company}
                  onChange={(e) => set("company", e.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-zinc-600">Role</span>
                <input
                  value={form.role}
                  onChange={(e) => set("role", e.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                <span className="text-zinc-600">Job URL</span>
                <input
                  value={form.url}
                  onChange={(e) => set("url", e.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-zinc-600">Status</span>
                <select
                  value={form.status}
                  onChange={(e) => set("status", e.target.value as ApplicationStatus)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                >
                  {PIPELINE_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-zinc-600">Job / req ID</span>
                <input
                  value={form.reqId}
                  onChange={(e) => set("reqId", e.target.value)}
                  placeholder="e.g. R-108283"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-zinc-600">Applied at</span>
                <input
                  type="date"
                  value={form.appliedAt}
                  onChange={(e) => set("appliedAt", e.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-zinc-600">Follow-up at</span>
                <input
                  type="date"
                  value={form.followUpAt}
                  onChange={(e) => set("followUpAt", e.target.value)}
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                <span className="text-zinc-600">Notes</span>
                <textarea
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  rows={4}
                  placeholder="Referral, recruiter contact, interview prep…"
                  className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy || !dirty}
                onClick={handleSave}
                className="rounded-md bg-teal-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-900 disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save changes"}
              </button>
              {saved && !dirty ? (
                <span className="text-xs text-teal-700">Saved ✓</span>
              ) : null}
            </div>
          </section>

          <div className="mt-auto border-t border-zinc-200 pt-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => onDelete(app.id)}
              className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Delete application
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
