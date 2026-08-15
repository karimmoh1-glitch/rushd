import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (user.onboardingCompletedAt) redirect("/dashboard");

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-4 py-12">
      {children}
    </div>
  );
}
