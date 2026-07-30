import { redirect } from "next/navigation";
import { TokenManager } from "@/components/TokenManager";
import { getSessionUser } from "@/lib/auth";

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <TokenManager />
    </main>
  );
}
