import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (!user.onboardingCompletedAt) redirect("/onboarding");

  return (
    <AppShell
      displayName={user.profile?.displayName ?? "Student"}
      isAdmin={user.isAdmin}
    >
      {children}
    </AppShell>
  );
}
