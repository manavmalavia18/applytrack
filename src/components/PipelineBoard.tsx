"use client";

import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { PIPELINE_ORDER, STATUS_LABELS } from "@/lib/statuses";
import type { ApplicationStatus } from "@/db/schema";

export type AppRow = {
  id: string;
  company: string;
  role: string;
  url: string;
  status: string;
  source: string;
  notes: string;
  appliedAt: string | null;
  followUpAt: string | null;
  updatedAt: string;
};

export function PipelineBoard({ initial }: { initial: AppRow[] }) {
  const [apps, setApps] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [form, setForm] = useState({
    company: "",
    role: "",
    url: "",
    status: "applied" as ApplicationStatus,
    notes: "",
  });

  const grouped = useMemo(() => {
    const map = Object.fromEntries(PIPELINE_ORDER.map((s) => [s, [] as AppRow[]])) as Record<
      ApplicationStatus,
      AppRow[]
    >;
    for (const app of apps) {
      const status = (app.status in STATUS_LABELS ? app.status : "applied") as ApplicationStatus;
      map[status].push(app);
    }
    return map;
  }, [apps]);

  async function updateStatus(id: string, status: ApplicationStatus) {
    setBusy(id);
    const res = await fetch(`/api/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    setBusy(null);
    if (res.ok && data.application) {
      setApps((prev) => prev.map((a) => (a.id === id ? { ...a, ...data.application } : a)));
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this application?")) return;
    setBusy(id);
    await fetch(`/api/applications/${id}`, { method: "DELETE" });
    setBusy(null);
    setApps((prev) => prev.filter((a) => a.id !== id));
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
          <p className="text-sm text-zinc-600">{apps.length} applications</p>
        </div>
        <div className="flex gap-2 text-sm">
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PIPELINE_ORDER.map((status) => (
          <section key={status} className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3">
            <header className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-700">
                {STATUS_LABELS[status]}
              </h2>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs text-zinc-500">
                {grouped[status].length}
              </span>
            </header>
            <ul className="flex flex-col gap-2">
              {grouped[status].map((app) => (
                <li key={app.id} className="rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
                  <a
                    href={app.url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-teal-800 hover:underline"
                  >
                    {app.role}
                  </a>
                  <p className="text-sm text-zinc-700">{app.company}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {app.source}
                    {app.appliedAt
                      ? ` · applied ${formatDistanceToNow(new Date(app.appliedAt), { addSuffix: true })}`
                      : null}
                    {app.followUpAt
                      ? ` · follow-up ${formatDistanceToNow(new Date(app.followUpAt), { addSuffix: true })}`
                      : null}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {PIPELINE_ORDER.filter((s) => s !== status).map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={busy === app.id}
                        onClick={() => updateStatus(app.id, s)}
                        className="rounded border px-1.5 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                      >
                        → {STATUS_LABELS[s]}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={busy === app.id}
                      onClick={() => remove(app.id)}
                      className="rounded border border-red-200 px-1.5 py-0.5 text-[11px] text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
              {grouped[status].length === 0 ? (
                <li className="px-1 py-6 text-center text-xs text-zinc-400">Empty</li>
              ) : null}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
