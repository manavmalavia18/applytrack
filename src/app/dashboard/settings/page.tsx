import { redirect } from "next/navigation";
import { ProfileEditor } from "@/components/ProfileEditor";
import { TokenManager } from "@/components/TokenManager";
import { getSessionUser } from "@/lib/auth";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
      <ProfileEditor />
      <TokenManager />
    </main>
  );
}
