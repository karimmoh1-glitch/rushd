import type { Metadata } from "next";
import { OnboardingWizard } from "./onboarding-wizard";
import { teamsAvailable } from "@/lib/teams/service";
import { aiEnabled } from "@/lib/env";
import { emailConfigured } from "@/lib/email/send";

export const metadata: Metadata = {
  title: "Set up your plan",
};

export default function OnboardingPage() {
  return <OnboardingWizard teams={teamsAvailable()} ai={aiEnabled} email={emailConfigured()} />;
}
