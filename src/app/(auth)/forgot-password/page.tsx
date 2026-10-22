import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Forgot password",
};

// Rushd doesn't send email yet, so recovery is a reset link issued by the
// Rushd team (see the admin page). Say so plainly rather than pretend.
export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-[1.75rem] font-medium tracking-tight">Forgot your password?</CardTitle>
        <CardDescription>Rushd can&apos;t send reset emails yet.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p>
          Ask the Rushd team member who invited you for a reset link. It works once and expires after an hour.
          Opening it lets you choose a new password and signs out every other device.
        </p>
        <Link href="/login" className="font-medium underline underline-offset-4">
          Back to log in
        </Link>
      </CardContent>
    </Card>
  );
}
