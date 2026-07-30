import { AuthForm } from "@/components/AuthForm";

export default function SignupPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <AuthForm mode="signup" />
    </main>
  );
}
