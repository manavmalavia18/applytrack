import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const user = await getSessionUser().catch(() => null);
  if (user) redirect("/dashboard");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-6 py-20">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-teal-800">ApplyTrack</p>
      <h1 className="font-display text-5xl leading-tight tracking-tight text-zinc-900 md:text-6xl">
        Track every application.
        <br />
        Know when you already applied.
      </h1>
      <p className="max-w-xl text-lg text-zinc-600">
        Chrome extension one-click on LinkedIn, Greenhouse, Lever, and Workday. Pipeline board on
        Vercel. Revisit a job and see your status instantly.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/signup"
          className="rounded-md bg-teal-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-900"
        >
          Get started
        </Link>
        <Link
          href="/login"
          className="rounded-md border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium hover:bg-zinc-50"
        >
          Sign in
        </Link>
      </div>
    </main>
  );
}
