import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { emailConfigured } from "@/lib/email/send";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = {
  title: "Forgot password",
};
export const dynamic = "force-dynamic";

// With email configured, students reset by email. Without it, recovery is a
// reset link issued by the Rushd team (see the admin page); say so plainly.
export default function ForgotPasswordPage() {
  const canEmail = emailConfigured();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-[1.75rem] font-medium tracking-tight">Forgot your password?</CardTitle>
        <CardDescription>{canEmail ? "We'll email you a link to choose a new one." : "Rushd can't send reset emails yet."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {canEmail ? (
          <ForgotForm />
        ) : (
          <p>
            Ask the Rushd team member who invited you for a reset link. It works once and expires after an hour.
            Opening it lets you choose a new password and signs out every other device.
          </p>
        )}
        <Link href="/login" className="font-medium underline underline-offset-4">
          Back to log in
        </Link>
      </CardContent>
    </Card>
  );
}
