"use client";

import { FormEvent, useEffect, useState } from "react";

type Profile = {
  email: string;
  displayName: string;
  headline: string;
  resumeText?: string;
  writingStyle?: string;
  answerBank?: Record<string, string>;
};

/**
 * Minimal account settings. Application answers are saved by the Chrome
 * extension per company when you Submit — not managed here.
 */
export function ProfileEditor() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/profile");
      const data = await res.json();
      if (res.ok) setProfile(data.profile);
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
      body: JSON.stringify({
        displayName: profile.displayName,
        headline: profile.headline || "",
        resumeText: profile.resumeText || "",
        writingStyle: profile.writingStyle || "",
        answerBank: profile.answerBank || {},
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setMessage(data.error || "Save failed");
      return;
    }
    setProfile(data.profile);
    setMessage("Saved.");
  }

  if (!profile) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }

  return (
    <form onSubmit={onSave} className="flex max-w-xl flex-col gap-4 rounded-xl border bg-white p-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Account</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Form answers are remembered by the extension when you click{" "}
          <strong>Submit</strong> on a job site. Next time you apply at that company, they
          auto-fill. Nothing to manage here.
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
          placeholder="Software engineer · open to USA"
          value={profile.headline || ""}
          onChange={(e) => setProfile({ ...profile, headline: e.target.value })}
        />
      </label>
      {message ? <p className="text-sm text-teal-800">{message}</p> : null}
      <button
        type="submit"
        disabled={saving}
        className="w-fit rounded-md bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-900 disabled:opacity-60"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
