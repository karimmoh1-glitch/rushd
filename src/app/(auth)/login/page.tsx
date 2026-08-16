import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/dal";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Log in",
};

export default async function LoginPage() {
  // Bounce already-signed-in visitors away from the auth pages. Previously
  // done in src/proxy.ts; moved here because Next.js 16 always runs proxy.ts
  // in the Node.js runtime, which Cloudflare's Workers deployment doesn't
  // support — see docs/ARCHITECTURE.md. The real authorization boundary was
  // always the DAL (src/lib/auth/dal.ts), never the proxy, so this is a pure
  // relocation, not a security change.
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-2xl">Welcome back</CardTitle>
        <CardDescription>Log in to see today&apos;s plan.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm />
      </CardContent>
    </Card>
  );
}
