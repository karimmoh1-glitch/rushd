import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/dal";
import { getCanvasConnectionView } from "@/lib/canvas/service";
import { isVaultConfigured } from "@/lib/canvas/token-vault";
import { resolveTimeZone } from "@/lib/time/zone";
import { CanvasIntegration } from "./canvas-integration";

export const metadata: Metadata = {
  title: "Canvas",
};

// Syncing several courses makes many sequential Canvas API calls; give the
// server actions on this page room beyond the default function timeout.
export const maxDuration = 60;

export default async function CanvasIntegrationPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const user = await requireUser();
  const [view, params] = await Promise.all([getCanvasConnectionView(user.id), searchParams]);

  return (
    <CanvasIntegration
      view={view}
      configured={isVaultConfigured()}
      timeZone={resolveTimeZone(user.profile?.timezone)}
      fromOnboarding={params.from === "onboarding"}
    />
  );
}
