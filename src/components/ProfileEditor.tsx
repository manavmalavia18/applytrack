"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
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
  const [parsing, setParsing] = useState(false);
  const [message, setMessage] = useState("");
  const [showAnswers, setShowAnswers] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Quick facts that seed the bank (optional overrides)
  const [location, setLocation] = useState(
    "I'm open to roles anywhere in the United States — remote, hybrid, or willing to relocate.",
  );
  const [workAuth, setWorkAuth] = useState(
    "Yes. I am currently authorized to work in the U.S. on F-1 STEM OPT, but I would require future employer sponsorship, such as H-1B, to continue working long term.",
  );
  const [sponsorship, setSponsorship] = useState(
    "I am on F-1 STEM OPT now and will need future H-1B sponsorship for long-term employment.",
  );

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/profile");
      const data = await res.json();
      if (res.ok) {
        const p = { answerBank: {}, ...data.profile } as Profile;
        setProfile(p);
        if (p.answerBank?.location) setLocation(p.answerBank.location);
        if (p.answerBank?.workAuth) setWorkAuth(p.answerBank.workAuth);
        if (p.answerBank?.sponsorship) setSponsorship(p.answerBank.sponsorship);
        if (Object.keys(p.answerBank || {}).length > 0) setShowAnswers(true);
      }
    })();
  }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setMessage("");
    const bank = {
      ...profile.answerBank,
      location,
      workAuth,
      sponsorship,
    };
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...profile, answerBank: bank }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMessage(data.error || "Save failed");
      return;
    }
    setProfile({ answerBank: {}, ...data.profile });
    setMessage("Saved. Extension can fill forms from your answer bank.");
  }

  async function parseResume(file?: File | null) {
    if (!profile) return;
    setParsing(true);
    setMessage("");
    const form = new FormData();
    if (file) form.append("file", file);
    if (profile.resumeText.trim()) form.append("resumeText", profile.resumeText);
    form.append("location", location);
    form.append("workAuth", workAuth);
    form.append("sponsorship", sponsorship);

    const res = await fetch("/api/profile/parse-resume", { method: "POST", body: form });
    const data = await res.json();
    setParsing(false);
    if (!res.ok) {
      setMessage(data.error || "Could not parse resume");
      return;
    }
    setProfile({ answerBank: {}, ...data.profile });
    setShowAnswers(true);
    const n = (data.filledKeys as string[] | undefined)?.length || 0;
    setMessage(`Resume parsed — ${n} answers filled. Skim them below, then Save.`);
  }

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    void parseResume(file);
  }

  if (!profile) {
    return <p className="text-sm text-zinc-500">Loading profile…</p>;
  }

  const filledCount = Object.values(profile.answerBank || {}).filter(
    (v) => typeof v === "string" && v.trim(),
  ).length;

  return (
    <form onSubmit={onSave} className="flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-xl border bg-white p-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Application profile</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Upload your resume once. We extract the text and fill reusable form answers — no AI.
            Then use <strong>Fill from answer bank</strong> in the extension.
          </p>
        </div>

        <label className="flex flex-col gap-1 text-sm">
          Name
          <input
            className="rounded-md border px-3 py-2"
            value={profile.displayName}
            onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
            required
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Headline <span className="font-normal text-zinc-500">(optional)</span>
          <input
            className="rounded-md border px-3 py-2"
            placeholder="Software engineer · full-stack · open to USA remote/relocate"
            value={profile.headline}
            onChange={(e) => setProfile({ ...profile, headline: e.target.value })}
          />
        </label>

        <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-4">
          <p className="text-sm font-medium text-zinc-800">Resume</p>
          <p className="mt-0.5 text-xs text-zinc-500">PDF or TXT · parses locally on the server, no LLM</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.md,application/pdf,text/plain"
              className="hidden"
              onChange={onFile}
            />
            <button
              type="button"
              disabled={parsing}
              onClick={() => fileRef.current?.click()}
              className="rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 disabled:opacity-60"
            >
              {parsing ? "Parsing…" : "Upload resume"}
            </button>
            {fileName ? <span className="text-xs text-zinc-600">{fileName}</span> : null}
            {profile.resumeText.trim() ? (
              <button
                type="button"
                disabled={parsing}
                onClick={() => void parseResume(null)}
                className="rounded-md border px-3 py-2 text-sm hover:bg-white disabled:opacity-60"
              >
                Re-parse pasted text
              </button>
            ) : null}
          </div>
          <label className="mt-3 flex flex-col gap-1 text-xs text-zinc-600">
            Or paste plain text
            <textarea
              className="min-h-28 rounded-md border bg-white px-3 py-2 font-mono text-xs text-zinc-800"
              value={profile.resumeText}
              onChange={(e) => setProfile({ ...profile, resumeText: e.target.value })}
              placeholder="Paste resume text if you don’t have a PDF…"
            />
          </label>
        </div>

        <details className="rounded-lg border bg-zinc-50 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium text-zinc-800">
            Work auth & location <span className="font-normal text-zinc-500">(used in answers)</span>
          </summary>
          <div className="mt-3 flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-xs">
              Location
              <textarea
                className="min-h-14 rounded-md border bg-white px-3 py-2 text-sm"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Work authorization
              <textarea
                className="min-h-14 rounded-md border bg-white px-3 py-2 text-sm"
                value={workAuth}
                onChange={(e) => setWorkAuth(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Sponsorship
              <textarea
                className="min-h-14 rounded-md border bg-white px-3 py-2 text-sm"
                value={sponsorship}
                onChange={(e) => setSponsorship(e.target.value)}
              />
            </label>
          </div>
        </details>

        {filledCount > 0 ? (
          <p className="text-sm text-teal-800">
            {filledCount} answer{filledCount === 1 ? "" : "s"} ready for the extension.
          </p>
        ) : (
          <p className="text-sm text-zinc-500">Upload a resume to generate answers.</p>
        )}
      </div>

      {filledCount > 0 ? (
        <div className="rounded-xl border bg-white p-4">
          <button
            type="button"
            className="text-sm font-medium text-teal-900 underline-offset-2 hover:underline"
            onClick={() => setShowAnswers((v) => !v)}
          >
            {showAnswers ? "Hide answers" : "Review / edit generated answers"}
          </button>
          {showAnswers ? (
            <div className="mt-4 flex flex-col gap-3">
              {ANSWER_BANK_FIELDS.map((field) => (
                <label key={field.key} className="flex flex-col gap-1 text-sm">
                  {field.label}
                  <textarea
                    className="min-h-16 rounded-md border px-3 py-2 text-sm"
                    value={profile.answerBank[field.key] || ""}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        answerBank: { ...profile.answerBank, [field.key]: e.target.value },
                      })
                    }
                  />
                </label>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {message ? <p className="text-sm text-teal-800">{message}</p> : null}
      <button
        type="submit"
        disabled={saving || filledCount === 0}
        className="w-fit rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save profile"}
      </button>
    </form>
  );
}
