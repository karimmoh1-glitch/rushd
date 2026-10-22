import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/dal";
import { SignupForm } from "./signup-form";
import { PageViewBeacon } from "@/components/marketing/page-view-beacon";

export const metadata: Metadata = {
  title: "Sign up",
};

export default async function SignupPage() {
  // See login/page.tsx — same relocation from the removed src/proxy.ts.
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <Card>
      <PageViewBeacon path="/signup" />
      <CardHeader>
        <CardTitle className="font-display text-[1.75rem] font-medium tracking-tight">Create your account</CardTitle>
        <CardDescription>Start on the free plan. No credit card needed.</CardDescription>
      </CardHeader>
      <CardContent>
        <SignupForm />
      </CardContent>
    </Card>
  );
}
