import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Reset password",
  robots: { index: false },
};

export default function ResetPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Choose a new password</CardTitle>
        <CardDescription>This signs you out everywhere else.</CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm />
      </CardContent>
    </Card>
  );
}
