"use client";

import { useEffect, useState } from "react";

type TokenRow = {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
};

export function TokenManager() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [apiBase, setApiBase] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch("/api/tokens");
    const data = await res.json();
    if (res.ok) setTokens(data.tokens || []);
  }

  useEffect(() => {
    setApiBase(window.location.origin);
    void load();
  }, []);

  async function createToken() {
    setLoading(true);
    setSecret(null);
    const res = await fetch("/api/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Chrome extension" }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setSecret(data.secret);
      await load();
    } else {
      alert(data.error || "Failed");
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/tokens?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Extension setup</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Create an API token, paste it into the Chrome extension, and set the API base URL.
        </p>
      </div>

      <div className="rounded-lg border bg-zinc-50 p-4 text-sm">
        <p className="font-medium">API base URL</p>
        <code className="mt-1 block break-all text-teal-800">{apiBase || "…"}</code>
      </div>

      <button
        type="button"
        onClick={createToken}
        disabled={loading}
        className="w-fit rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
      >
        {loading ? "Creating…" : "Generate extension token"}
      </button>

      {secret ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-medium text-amber-900">Copy now — shown once</p>
          <code className="mt-2 block break-all text-amber-950">{secret}</code>
        </div>
      ) : null}

      <ul className="flex flex-col gap-2">
        {tokens.map((t) => (
          <li key={t.id} className="flex items-center justify-between rounded-lg border bg-white px-3 py-2 text-sm">
            <span>
              {t.name} · <code>{t.tokenPrefix}…</code>
            </span>
            <button
              type="button"
              onClick={() => revoke(t.id)}
              className="text-red-600 hover:underline"
            >
              Revoke
            </button>
          </li>
        ))}
      </ul>

      <a href="/dashboard" className="text-sm text-teal-700 underline">
        ← Back to pipeline
      </a>
    </div>
  );
}
