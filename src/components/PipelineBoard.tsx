"use client";

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { FormEvent, MouseEvent, useMemo, useState } from "react";
import { ApplicationDetail } from "@/components/ApplicationDetail";
import {
  PIPELINE_ORDER,
  STATUS_DOT,
  STATUS_LABELS,
  STATUS_STYLES,
  STATUS_VERB,
  formatSource,
} from "@/lib/statuses";
import { exportApplicationsToExcel } from "@/lib/export";
import type { AppRow } from "@/lib/types";
import type { ApplicationStatus } from "@/db/schema";

export type { AppRow } from "@/lib/types";

type FilterValue = "all" | ApplicationStatus;

export function PipelineBoard({ initial }: { initial: AppRow[] }) {
  const [apps, setApps] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterValue>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [form, setForm] = useState({
    company: "",
    role: "",
    url: "",
    status: "applied" as ApplicationStatus,
    notes: "",
  });

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter((a) =>
      [a.company, a.role, a.notes, formatSource(a.source)].some((v) =>
        v.toLowerCase().includes(q),
      ),
    );
  }, [apps, search]);

  const counts = useMemo(() => {
    const map = Object.fromEntries(PIPELINE_ORDER.map((s) => [s, 0])) as Record<
      ApplicationStatus,
      number
    >;
    for (const app of searched) {
      const status = normalizeStatus(app.status);
      map[status] += 1;
    }
    return map;
  }, [searched]);

  const filtered = useMemo(() => {
    if (filter === "all") return searched;
    return searched.filter((a) => normalizeStatus(a.status) === filter);
  }, [searched, filter]);

  const selected = useMemo(
    () => (selectedId ? apps.find((a) => a.id === selectedId) || null : null),
    [apps, selectedId],
  );

  async function patchApplication(id: string, patch: Record<string, unknown>) {
    setBusy(id);
    const res = await fetch(`/api/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (res.ok && data.application) {
      setApps((prev) => prev.map((a) => (a.id === id ? { ...a, ...data.application } : a)));
    }
  }

  async function updateStatus(id: string, status: ApplicationStatus) {
    await patchApplication(id, { status });
  }

  async function remove(id: string) {
    if (!confirm("Delete this application?")) return;
    setBusy(id);
    await fetch(`/api/applications/${id}`, { method: "DELETE" });
    setBusy(null);
    setApps((prev) => prev.filter((a) => a.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  }

  async function addApplication(e: FormEvent) {
    e.preventDefault();
    setAddError(null);
    const company = form.company.trim();
    const role = form.role.trim();
    const url = form.url.trim();
    if (!company || !role) {
      setAddError("Company and role are required.");
      return;
    }
    setAdding(true);
    const res = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company,
        role,
        url: url || undefined,
        status: form.status,
        notes: form.notes.trim(),
        source: "manual",
        manual: true,
      }),
    });
    const data = await res.json();
    setAdding(false);
    if (!res.ok) {
      setAddError(data.error || "Failed to add application");
      return;
    }
    if (data.application) {
      setApps((prev) => {
        const rest = prev.filter((a) => a.id !== data.application.id);
        return [data.application, ...rest];
      });
    }
    setForm({ company: "", role: "", url: "", status: "applied", notes: "" });
    setShowAdd(false);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      await exportApplicationsToExcel(filtered, `applytrack-applications-${stamp}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  function stop(e: MouseEvent) {
    e.stopPropagation();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
          <p className="text-sm text-zinc-600">
            {filtered.length} of {apps.length} applications
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <button
            type="button"
            onClick={() => {
              setShowAdd((v) => !v);
              setAddError(null);
            }}
            className="rounded-md bg-teal-800 px-3 py-1.5 text-white hover:bg-teal-900"
          >
            {showAdd ? "Cancel" : "Add application"}
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || apps.length === 0}
            className="rounded-md border border-teal-700 px-3 py-1.5 text-teal-800 hover:bg-teal-50 disabled:opacity-50"
          >
            {exporting ? "Exporting…" : "Export to Excel"}
          </button>
          <Link href="/dashboard/settings" className="rounded-md border px-3 py-1.5 hover:bg-zinc-50">
            Extension token
          </Link>
          <form action="/api/auth/logout" method="post" onSubmit={async (e) => {
            e.preventDefault();
            await fetch("/api/auth/logout", { method: "POST" });
            window.location.href = "/";
          }}>
            <button type="submit" className="rounded-md border px-3 py-1.5 hover:bg-zinc-50">
              Log out
            </button>
          </form>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search company, role, notes, source…"
          className="w-full max-w-sm rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm"
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="rounded-md border px-2 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50"
          >
            Clear
          </button>
        ) : null}
      </div>

      {showAdd ? (
        <form
          onSubmit={addApplication}
          className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
        >
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-700">
            Manual entry
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-600">Company</span>
              <input
                required
                value={form.company}
                onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                className="rounded-md border border-zinc-300 px-3 py-2"
                placeholder="Acme Inc"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-600">Role</span>
              <input
                required
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                className="rounded-md border border-zinc-300 px-3 py-2"
                placeholder="Software Engineer"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span className="text-zinc-600">Job URL (optional)</span>
              <input
                type="url"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                className="rounded-md border border-zinc-300 px-3 py-2"
                placeholder="https://…"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-600">Status</span>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((f) => ({ ...f, status: e.target.value as ApplicationStatus }))
                }
                className="rounded-md border border-zinc-300 px-3 py-2"
              >
                {PIPELINE_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-zinc-600">Notes (optional)</span>
              <input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="rounded-md border border-zinc-300 px-3 py-2"
                placeholder="Referral, recruiter, etc."
              />
            </label>
          </div>
          {addError ? <p className="mt-2 text-sm text-red-600">{addError}</p> : null}
          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={adding}
              className="rounded-md bg-teal-800 px-3 py-1.5 text-sm text-white hover:bg-teal-900 disabled:opacity-50"
            >
              {adding ? "Adding…" : "Add to pipeline"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label="All"
          count={searched.length}
        />
        {PIPELINE_ORDER.map((s) => (
          <FilterChip
            key={s}
            active={filter === s}
            onClick={() => setFilter(s)}
            label={STATUS_LABELS[s]}
            count={counts[s]}
            dotClass={STATUS_DOT[s]}
          />
        ))}
      </div>

      <ul className="flex flex-col gap-2">
        {filtered.map((app) => {
          const status = normalizeStatus(app.status);
          return (
            <li
              key={app.id}
              onClick={() => setSelectedId(app.id)}
              className="group cursor-pointer rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm transition hover:border-teal-300 hover:shadow-md"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={app.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={stop}
                      className="font-medium text-zinc-900 hover:text-teal-800 hover:underline"
                    >
                      {app.role}
                    </a>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLES[status]}`}
                    >
                      {STATUS_LABELS[status]}
                    </span>
                    {app.captureConfidence === "low" ? (
                      <span
                        title="Capture confidence was low — double-check company/role"
                        className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700"
                      >
                        Low confidence
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-sm text-zinc-600">{app.company}</p>
                  <p className="mt-1 text-xs text-zinc-400">
                    {formatSource(app.source)}
                    {app.appliedAt
                      ? ` · ${STATUS_VERB[status]} ${formatDistanceToNow(new Date(app.appliedAt), { addSuffix: true })}`
                      : null}
                    {app.followUpAt ? (
                      <span className="text-amber-600">
                        {" "}
                        · follow up{" "}
                        {formatDistanceToNow(new Date(app.followUpAt), { addSuffix: true })}
                      </span>
                    ) : null}
                  </p>
                </div>

                <div
                  className="flex shrink-0 items-center gap-1.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100"
                  onClick={stop}
                >
                  <select
                    value={status}
                    disabled={busy === app.id}
                    onChange={(e) => updateStatus(app.id, e.target.value as ApplicationStatus)}
                    className="rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {PIPELINE_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy === app.id}
                    onClick={() => remove(app.id)}
                    className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          );
        })}
        {filtered.length === 0 ? (
          <li className="rounded-xl border border-dashed border-zinc-300 bg-white/60 px-4 py-12 text-center text-sm text-zinc-400">
            {apps.length === 0
              ? "No applications yet — add one or track from the extension."
              : "Nothing matches this filter."}
          </li>
        ) : null}
      </ul>

      {selected ? (
        <ApplicationDetail
          app={selected}
          busy={busy === selected.id}
          onClose={() => setSelectedId(null)}
          onSave={patchApplication}
          onDelete={remove}
        />
      ) : null}
    </div>
  );
}

function normalizeStatus(status: string): ApplicationStatus {
  return (status in STATUS_LABELS ? status : "applied") as ApplicationStatus;
}

function FilterChip({
  active,
  onClick,
  label,
  count,
  dotClass,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  dotClass?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${
        active
          ? "border-teal-800 bg-teal-800 text-white shadow-sm"
          : "border-zinc-200 bg-white text-zinc-600 hover:border-teal-300 hover:text-teal-800"
      }`}
    >
      {dotClass ? <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} /> : null}
      {label}
      <span
        className={`rounded-full px-1.5 text-xs ${
          active ? "bg-white/20" : "bg-zinc-100 text-zinc-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
