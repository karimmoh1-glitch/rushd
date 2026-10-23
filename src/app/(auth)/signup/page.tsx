import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { BONUS_MESSAGES, REF_COOKIE } from "@/lib/referral/referral";
import { aiEnabled } from "@/lib/env";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/dal";
import { SignupForm } from "./signup-form";
import { PageViewBeacon } from "@/components/marketing/page-view-beacon";

export const metadata: Metadata = {
  title: "Sign up",
};

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  // Signed-in visitors skip the auth pages (see login/page.tsx).
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const cookieStore = await cookies();
  const invited = Boolean(cookieStore.get(REF_COOKIE)?.value);
  const params = await searchParams;
  const fromTry = params.from === "try";

  return (
    <Card>
      <PageViewBeacon path="/signup" />
      <CardHeader>
        <CardTitle className="font-display text-[1.75rem] font-medium tracking-tight">Create your account</CardTitle>
        <CardDescription>
          {fromTry ? "Your ranked week will be waiting. " : ""}Start on the free plan. No credit card needed.
        </CardDescription>
        {invited && aiEnabled && (
          <p className="mt-2 rounded-lg border border-signal/50 bg-signal-soft/40 px-3 py-2 text-sm">
            A friend invited you. Study once after setup and you both get {BONUS_MESSAGES} more tutor messages every month.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <SignupForm />
      </CardContent>
    </Card>
  );
}
