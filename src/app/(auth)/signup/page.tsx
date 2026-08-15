import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Sign up",
};

export default function SignupPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-2xl">Create your account</CardTitle>
        <CardDescription>Free for students. No credit card, ever.</CardDescription>
      </CardHeader>
      <CardContent>
        <SignupForm />
      </CardContent>
    </Card>
  );
}
