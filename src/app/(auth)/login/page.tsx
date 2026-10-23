import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/dal";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Log in",
};

export default async function LoginPage() {
  // Signed-in visitors skip the auth pages. This lives here, not in proxy.ts, because the
  // Workers deployment can't run proxy.ts (see docs/ARCHITECTURE.md). Real auth is in the DAL.
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-[1.75rem] font-medium tracking-tight">Welcome back</CardTitle>
        <CardDescription>Log in to see today&apos;s plan.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm />
      </CardContent>
    </Card>
  );
}
