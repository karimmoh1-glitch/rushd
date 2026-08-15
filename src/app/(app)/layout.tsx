import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/dal";
import { AppShell } from "@/components/app-shell";
import { getActiveSession } from "@/server/actions/study-sessions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  if (!user.onboardingCompletedAt) redirect("/onboarding");

  const activeSession = await getActiveSession();

  return (
    <AppShell
      displayName={user.profile?.displayName ?? "Student"}
      isAdmin={user.isAdmin}
      activeSession={activeSession}
    >
      {children}
    </AppShell>
  );
}
