import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <div>
      <h1 className="font-heading text-2xl font-semibold">
        Welcome, {user.profile?.displayName}
      </h1>
      <p className="mt-2 text-muted-foreground">
        Dashboard coming together next.
      </p>
    </div>
  );
}
