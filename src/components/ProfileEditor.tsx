"use client";

import { FormEvent, useEffect, useState } from "react";
import { ANSWER_BANK_FIELDS, type AnswerBank } from "@/lib/answer-bank";

type Profile = {
  email: string;
  displayName: string;
  headline: string;
  resumeText: string;
  writingStyle: string;
  answerBank: AnswerBank;
};

export function ProfileEditor() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/profile");
      const data = await res.json();
      if (res.ok) setProfile({ answerBank: {}, ...data.profile });
    })();
  }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setMessage("");
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMessage(data.error || "Save failed");
      return;
    }
    setProfile({ answerBank: {}, ...data.profile });
    setMessage("Profile saved — extension can fill answers from your answer bank.");
  }

  if (!profile) {
    return <p className="text-sm text-zinc-500">Loading profile…</p>;
  }

  function setBankField(key: keyof AnswerBank, value: string) {
    setProfile({ ...profile!, answerBank: { ...profile!.answerBank, [key]: value } });
  }

  return (
    <form onSubmit={onSave} className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 rounded-xl border bg-white p-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Application profile</h2>
          <p className="text-sm text-zinc-600">
            Paste your resume once for your own reference. Fill your form answers below in the
            answer bank — the extension matches and inserts them with no AI involved.
          </p>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input
            className="rounded-md border px-3 py-2"
            value={profile.displayName}
            onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Headline
          <input
            className="rounded-md border px-3 py-2"
            placeholder="CS student · full-stack · Boston"
            value={profile.headline}
            onChange={(e) => setProfile({ ...profile, headline: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Resume / experience (plain text)
          <textarea
            className="min-h-48 rounded-md border px-3 py-2 font-mono text-xs"
            required
            value={profile.resumeText}
            onChange={(e) => setProfile({ ...profile, resumeText: e.target.value })}
            placeholder="Paste resume bullets, projects, skills…"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Writing style (optional)
          <textarea
            className="min-h-20 rounded-md border px-3 py-2 text-sm"
            value={profile.writingStyle}
            onChange={(e) => setProfile({ ...profile, writingStyle: e.target.value })}
            placeholder="Concise, first person, no buzzwords…"
          />
        </label>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-white p-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Answer bank</h2>
          <p className="text-sm text-zinc-600">
            Write each answer once. The extension matches form questions against these by keyword
            and fills them <strong>without calling any AI model</strong> — instant and free. Leave a
            field blank to skip it (those questions show as &ldquo;needs manual answer&rdquo; in the
            extension). Use <code className="rounded bg-zinc-100 px-1">[Company]</code> /{" "}
            <code className="rounded bg-zinc-100 px-1">[Role]</code> in the two &ldquo;why&rdquo;
            answers below — they&apos;re swapped in automatically per job.
          </p>
        </div>
        {ANSWER_BANK_FIELDS.map((field) => (
          <label key={field.key} className="flex flex-col gap-1 text-sm">
            {field.label}
            {field.templated ? (
              <span className="text-xs font-normal text-zinc-500">
                Supports <code className="rounded bg-zinc-100 px-1">[Company]</code> /{" "}
                <code className="rounded bg-zinc-100 px-1">[Role]</code>
              </span>
            ) : null}
            <textarea
              className="min-h-20 rounded-md border px-3 py-2 text-sm"
              value={profile.answerBank[field.key] || ""}
              onChange={(e) => setBankField(field.key, e.target.value)}
              placeholder={field.placeholder}
            />
          </label>
        ))}
      </div>

      {message ? <p className="text-sm text-teal-800">{message}</p> : null}
      <button
        type="submit"
        disabled={saving}
        className="w-fit rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
